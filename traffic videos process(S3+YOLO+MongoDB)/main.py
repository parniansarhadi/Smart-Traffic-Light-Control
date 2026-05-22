"""python traffic_light_control/main.py --mode batch --video-dir data/polito_cross_02"""

import argparse
import json
import multiprocessing as mp
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median

import cv2
from ultralytics import YOLO

# --- Import Custom Modules ---
import settings
from src.frame_enhancer import apply_roi_gamma, get_target_pedestrian_polygons
from src.light_manager import LightManager
from src.mongodb_upload import build_mongodb_uri, create_mongo_client
from src.output_json_config import build_final_payload
from src.pedestrian_manager import PedestrianManager
from src.video_source import discover_videos
from src.vehicle_manager import VehicleManager


def _merge_pedestrians_for_second(ped_samples, latest_pedestrians):
    """Counts use median in a 1-second window; waiting-time fields use the latest frame."""
    merged = []
    for ped in latest_pedestrians or []:
        direction = ped.get("direction", "none")
        samples = ped_samples.get(direction, {})
        waiting_vals = samples.get("waiting_count", [])
        crossing_vals = samples.get("crossing_count", [])

        merged_item = dict(ped)
        if waiting_vals:
            merged_item["waiting_count"] = int(round(median(waiting_vals)))
        if crossing_vals:
            merged_item["crossing_count"] = int(round(median(crossing_vals)))
        merged_item["total_waiting_time"] = float(
            samples.get("last_total_waiting_time", ped.get("total_waiting_time", 0.0))
        )
        merged.append(merged_item)
    return merged


def _parse_base_time_from_filename(video_path):
    video_filename = os.path.basename(video_path)
    base_timestamp_str = os.path.splitext(video_filename)[0]
    try:
        return datetime.strptime(base_timestamp_str, "%Y-%m-%dT%H:%M:%SZ"), video_filename
    except ValueError:
        print(
            f"Warning: Filename {video_filename} does not match time format. Using current time."
        )
        return datetime.utcnow(), video_filename


def _safe_slug(value, default="unknown"):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text or default


def _discover_videos(video_dir):
    """Scan directory for video files, return list sorted by filename."""
    return discover_videos(video_dir, os.path.dirname(os.path.abspath(__file__)))


def _load_config(project_root, config_dir):
    config_path = _resolve_config_path(project_root, config_dir)
    try:
        with open(config_path, "r") as f:
            return json.load(f), config_path
    except FileNotFoundError:
        raise FileNotFoundError(f"Could not find {config_path}")


def _resolve_video_source(config_data, project_root, cli_video_dir=None):
    source_cfg = config_data.get("video_source", {}) if isinstance(config_data, dict) else {}

    s3_uri = str(source_cfg.get("s3_uri", "")).strip()
    if s3_uri:
        return s3_uri

    local_dir = source_cfg.get("local_dir") or cli_video_dir or "data/polito_cross_02"
    if not os.path.isabs(local_dir):
        local_dir = os.path.join(project_root, local_dir)
    return os.path.normpath(local_dir)


def _get_video_duration(video_path):
    """Calculate video duration in seconds."""
    try:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        if fps > 0:
            return frame_count / fps
    except Exception:
        pass
    return 0.0


def _resolve_timeline_fps(config_data, video_path):
    """Resolve FPS used for timeline generation in JSON timestamps."""
    metadata = config_data.get("metadata", {}) if isinstance(config_data, dict) else {}

    # Allow explicit fps in config metadata when provided.
    meta_fps = metadata.get("fps")
    if meta_fps is not None:
        try:
            fps = float(meta_fps)
            if fps > 0:
                return fps
        except (TypeError, ValueError):
            pass

    # cross02 requirement: use fixed 15fps timeline.
    intersection_id = str(metadata.get("intersection_id", "")).lower()
    video_path_lc = str(video_path).lower()
    if "cross_02" in intersection_id or "polito_cross_02" in video_path_lc:
        return 15.0

    cap = cv2.VideoCapture(video_path)
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    finally:
        cap.release()

    if fps > 0:
        return fps
    return 30.0


def _resolve_yolo_config(config_data, project_root):
    yolo_cfg = config_data.get("yolo", {})

    model_path = str(yolo_cfg.get("model_path", settings.MODEL_PATH))
    if not os.path.isabs(model_path):
        model_path = os.path.join(project_root, model_path)

    tracker_path = str(yolo_cfg.get("tracker", settings.TRACKER_CONFIG))
    if not os.path.isabs(tracker_path):
        tracker_path = os.path.join(project_root, tracker_path)

    return {
        "model_path": model_path,
        "imgsz": int(yolo_cfg.get("imgsz", 1088)),
        "conf_threshold": float(yolo_cfg.get("conf_threshold", settings.CONF_THRESHOLD)),
        "iou_threshold": float(yolo_cfg.get("iou_threshold", settings.IOU_THRESHOLD)),
        "tracker": tracker_path,
        "device": str(os.getenv("YOLO_DEVICE", yolo_cfg.get("device", "mps"))),
        "persist": bool(yolo_cfg.get("persist", True)),
        "verbose": bool(yolo_cfg.get("verbose", False)),
    }


def _interactive_mode(project_root, video_dir):
    """Allow user to select a single video to process."""
    videos = _discover_videos(video_dir)
    if not videos:
        print(f"No videos found in {video_dir}")
        return None
    print(f"\nFound {len(videos)} video(s):\n")
    for i, v in enumerate(videos, 1):
        duration = _get_video_duration(v)
        print(f"  {i}. {os.path.basename(v)} ({duration:.1f}s)")
    while True:
        choice = input("\nEnter video number (1-{}): ".format(len(videos)))
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(videos):
                return videos[idx]
        except ValueError:
            pass
        print("Invalid choice. Try again.")


def _batch_mode(project_root, video_dir, config_dir, upload_config):
    """Process all videos sequentially (one video at a time)."""
    config_data, _ = _load_config(project_root, config_dir)
    source_location = _resolve_video_source(config_data, project_root, video_dir)
    videos = _discover_videos(source_location)
    if not videos:
        print(f"No videos found in {source_location}")
        return
    print(f"\nBatch mode: Found {len(videos)} video(s)")
    print("Processing order:")
    for idx, video_path in enumerate(videos, 1):
        print(f"  {idx}. {os.path.basename(video_path)}")

    for idx, video_path in enumerate(videos, 1):
        base_time, _ = _parse_base_time_from_filename(video_path)
        duration = _get_video_duration(video_path)
        print(f"\n[{idx}/{len(videos)}] Processing: {os.path.basename(video_path)} ({duration:.1f}s)")
        print(f"  Base time: {base_time.strftime('%Y-%m-%dT%H:%M:%SZ')}")
        _process_single_video(project_root, config_dir, video_path, base_time, upload_config)


def _resolve_config_path(project_root, config_dir):
    config_path = config_dir
    if not os.path.isabs(config_path):
        config_path = os.path.join(project_root, config_path)
    return os.path.join(os.path.normpath(config_path), "config.json")


def _resolve_mongodb_upload_config(args):
    explicit_mongo_config = any(
        [
            args.mongodb_uri,
            args.mongodb_username,
            args.mongodb_password,
            os.getenv("MONGODB_URI"),
            os.getenv("MONGODB_USERNAME"),
            os.getenv("MONGODB_PASSWORD"),
        ]
    )

    enabled = bool(args.upload_to_mongodb)
    if not enabled:
        env_value = os.getenv("ENABLE_AUTO_UPLOAD", "").strip().lower()
        enabled = env_value in {"1", "true", "yes", "on"} or explicit_mongo_config

    if not enabled:
        return {"enabled": False}

    uri = args.mongodb_uri or os.getenv("MONGODB_URI")
    if not uri:
        username = args.mongodb_username or os.getenv("MONGODB_USERNAME")
        password = args.mongodb_password or os.getenv("MONGODB_PASSWORD")
        if username and password:
            uri = build_mongodb_uri(username, password)

    if not uri:
        raise ValueError(
            "MongoDB upload is enabled, but no connection string was provided. "
            "Set MONGODB_URI or pass --mongodb-uri / --mongodb-username / --mongodb-password."
        )

    return {
        "enabled": True,
        "uri": uri,
        "db": args.mongodb_db or os.getenv("MONGODB_DATABASE", "traffic_results"),
        "collection": args.mongodb_collection or os.getenv("MONGODB_COLLECTION", "approved_uploads"),
    }


def _upload_json_to_mongodb(output_file_path, upload_config, source_video_path):
    if not upload_config.get("enabled"):
        return

    with open(output_file_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    document = {
        "source_file": str(output_file_path),
        "source_video": str(source_video_path),
        "uploaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "auto_upload",
        "payload": payload,
    }

    client = create_mongo_client(upload_config["uri"])
    try:
        client.admin.command("ping")
        result = client[upload_config["db"]][upload_config["collection"]].insert_one(document)
        print(f"Uploaded JSON to MongoDB. Inserted _id: {result.inserted_id}")
        print(f"Saved to: {upload_config['db']}.{upload_config['collection']}")
    finally:
        client.close()


def _process_single_video(project_root, config_dir, video_path, base_time, upload_config=None):
    """Process a single video file with given base timestamp."""
    try:
        config_data, config_path = _load_config(project_root, config_dir)
        print(f"  Loaded config from {config_path}")
    except FileNotFoundError as exc:
        print(f"  Error: {exc}")
        return
    metadata = config_data.get("metadata", {})
    camera_id = metadata.get("camera_id", "unknown")
    config_default_name = os.path.basename(os.path.normpath(config_dir)) or "traffic"
    intersection_id = metadata.get("intersection_id", config_default_name)
    yolo_runtime_cfg = _resolve_yolo_config(config_data, project_root)
    timeline_fps = _resolve_timeline_fps(config_data, video_path)
    video_filename = os.path.basename(video_path)
    print(f"Starting 3-process pipeline. Target: {video_filename}")
    print(f"  Timeline FPS for timestamps: {timeline_fps:.3f}")
    try:
        mp.set_start_method("spawn", force=True)
    except RuntimeError:
        pass
    input_queue = mp.Queue(maxsize=12)
    output_queue = mp.Queue(maxsize=24)
    reader = mp.Process(
        target=_reader_worker,
        args=(video_path, base_time, timeline_fps, input_queue),
        name="Reader",
    )
    inference = mp.Process(target=_inference_worker, args=(config_data, yolo_runtime_cfg, input_queue, output_queue), name="Inference")
    writer = mp.Process(
        target=_writer_logic_worker,
        args=(
            config_data,
            camera_id,
            intersection_id,
            project_root,
            output_queue,
            video_path,
            upload_config or {"enabled": False},
        ),
        name="WriterLogic",
    )
    reader.start()
    inference.start()
    writer.start()
    try:
        reader.join()
        inference.join()
        writer.join()
    except KeyboardInterrupt:
        print("\nInterrupted. Terminating child processes...")
        reader.terminate()
        inference.terminate()
        writer.terminate()
        reader.join()
        inference.join()
        writer.join()


def _reader_worker(video_path, base_time, timeline_fps, input_queue):
    cap = cv2.VideoCapture(video_path)
    fps = float(timeline_fps) if timeline_fps and float(timeline_fps) > 0 else 30.0
    dt = 1.0 / fps

    frame_id = 0
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        frame_id += 1
        sim_time = (frame_id - 1) * dt
        current_frame_time = base_time + timedelta(seconds=sim_time)
        timestamp_str = current_frame_time.strftime("%Y-%m-%dT%H:%M:%SZ")

        input_queue.put(
            {
                "frame_id": frame_id,
                "sim_time": sim_time,
                "dt": dt,
                "timestamp_str": timestamp_str,
                "frame": frame,
            }
        )

    cap.release()
    input_queue.put(None)


def _inference_worker(config_data, yolo_runtime_cfg, input_queue, output_queue):
    model = YOLO(yolo_runtime_cfg["model_path"])
    ped_gamma_polygons = get_target_pedestrian_polygons(config_data)

    while True:
        packet = input_queue.get()
        if packet is None:
            output_queue.put(None)
            break

        frame = packet["frame"]
        enhanced_frame = apply_roi_gamma(
            frame,
            ped_gamma_polygons,
            enabled=settings.ENABLE_PED_ROI_GAMMA,
            gamma=settings.GAMMA_VALUE,
            brightness_gain=settings.PED_ROI_BRIGHTNESS_GAIN,
        )

        results = model.track(
            enhanced_frame,
            persist=yolo_runtime_cfg["persist"],
            imgsz=yolo_runtime_cfg["imgsz"],
            conf=yolo_runtime_cfg["conf_threshold"],
            iou=yolo_runtime_cfg["iou_threshold"],
            tracker=yolo_runtime_cfg["tracker"],
            verbose=yolo_runtime_cfg["verbose"],
            device=yolo_runtime_cfg["device"],
        )

        boxes, track_ids, class_names = [], [], []
        if results[0].boxes is not None:
            boxes = results[0].boxes.xywh.cpu().numpy()
            class_ids = results[0].boxes.cls.int().cpu().tolist()
            class_names = [model.names[c] for c in class_ids]
            if results[0].boxes.id is not None:
                track_ids = results[0].boxes.id.int().cpu().tolist()

        output_queue.put(
            {
                "frame_id": packet["frame_id"],
                "sim_time": packet["sim_time"],
                "dt": packet["dt"],
                "timestamp_str": packet["timestamp_str"],
                "boxes": boxes,
                "track_ids": track_ids,
                "class_names": class_names,
            }
        )


def _writer_logic_worker(
    config_data,
    camera_id,
    intersection_id,
    project_root,
    output_queue,
    source_video_path,
    upload_config,
):
    vehicle_mgr = VehicleManager(config_data)
    light_mgr = LightManager(config_data, use_cv=False)
    pedestrian_mgr = PedestrianManager(config_data)

    start_processing_time = time.time()
    frame_id = 0

    all_seconds_data = []
    pending_frame = None
    current_second_key = None
    second_ped_samples = {}

    output_folder = os.path.join(project_root, "output")
    os.makedirs(output_folder, exist_ok=True)
    output_prefix = _safe_slug(intersection_id, default="traffic")
    source_video_stem = Path(source_video_path).stem
    source_video_slug = _safe_slug(source_video_stem, default="video")
    base_output_name = f"{output_prefix}_result_{source_video_slug}"
    output_file_path = os.path.join(output_folder, f"{base_output_name}.json")
    if os.path.exists(output_file_path):
        run_time_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file_path = os.path.join(
            output_folder,
            f"{base_output_name}_{run_time_str}.json",
        )
    output_file = open(output_file_path, "w")
    output_file.write("[")
    output_file.flush()
    os.fsync(output_file.fileno())

    first_record_written = False

    def _write_record(record):
        nonlocal first_record_written
        if first_record_written:
            output_file.write(",\n")
        else:
            output_file.write("\n")
            first_record_written = True
        json.dump(record, output_file, indent=4)
        output_file.flush()
        os.fsync(output_file.fileno())

    try:
        while True:
            packet = output_queue.get()
            if packet is None:
                break

            frame_id = packet["frame_id"]
            boxes = packet["boxes"]
            track_ids = packet["track_ids"]
            class_names = packet["class_names"]
            dt = packet["dt"]
            sim_time = packet["sim_time"]
            current_timestamp_str = packet["timestamp_str"]

            lanes_data, emergency_data = vehicle_mgr.update(
                boxes,
                track_ids,
                class_names,
                dt,
                sim_time=sim_time,
            )
            lights_data = light_mgr.update(frame=None, sim_time=sim_time)
            pedestrian_track_ids = track_ids if len(track_ids) == len(boxes) else [None] * len(boxes)
            pedestrians_data = pedestrian_mgr.update(boxes, class_names, dt, track_ids=pedestrian_track_ids)

            second_key = int(sim_time)
            if current_second_key is None:
                current_second_key = second_key

            if second_key != current_second_key:
                if pending_frame is not None:
                    flush_frame = dict(pending_frame)
                    flush_frame["lane_passed_data"] = vehicle_mgr.get_last_second_passed_counts()
                    flush_frame["pedestrians_data"] = _merge_pedestrians_for_second(
                        second_ped_samples,
                        pending_frame.get("pedestrians_data", []),
                    )
                    record = build_final_payload(**flush_frame)
                    all_seconds_data.append(record)
                    _write_record(record)
                current_second_key = second_key
                second_ped_samples = {}

            pending_frame = {
                "camera_id": camera_id,
                "timestamp_str": current_timestamp_str,
                "lights_data": lights_data,
                "lanes_data": lanes_data,
                "emergency_data": emergency_data,
                "pedestrians_data": pedestrians_data,
            }

            for ped in pedestrians_data or []:
                direction = ped.get("direction", "none")
                if direction not in second_ped_samples:
                    second_ped_samples[direction] = {
                        "waiting_count": [],
                        "crossing_count": [],
                        "last_total_waiting_time": float(ped.get("total_waiting_time", 0.0)),
                    }
                second_ped_samples[direction]["waiting_count"].append(int(ped.get("waiting_count", 0)))
                second_ped_samples[direction]["crossing_count"].append(int(ped.get("crossing_count", 0)))
                second_ped_samples[direction]["last_total_waiting_time"] = float(
                    ped.get("total_waiting_time", 0.0)
                )

            if frame_id % 100 == 0:
                person_count = sum(1 for c in class_names if c == "person")
                person_track_set = {
                    pedestrian_track_ids[i]
                    for i, class_name in enumerate(class_names)
                    if class_name == "person"
                    and i < len(pedestrian_track_ids)
                    and pedestrian_track_ids[i] is not None
                }
                print(
                    f"-> Processed {frame_id} frames | persons={person_count} "
                    f"unique_person_ids={len(person_track_set)} "
                    f"gamma={'on' if settings.ENABLE_PED_ROI_GAMMA else 'off'}"
                )

        if pending_frame is not None:
            flush_frame = dict(pending_frame)
            flush_frame["lane_passed_data"] = vehicle_mgr.get_current_second_passed_counts()
            flush_frame["pedestrians_data"] = _merge_pedestrians_for_second(
                second_ped_samples,
                pending_frame.get("pedestrians_data", []),
            )
            record = build_final_payload(**flush_frame)
            all_seconds_data.append(record)
            _write_record(record)
    finally:
        if not output_file.closed:
            output_file.write("\n]\n")
            output_file.flush()
            os.fsync(output_file.fileno())
            output_file.close()

    if upload_config.get("enabled"):
        try:
            _upload_json_to_mongodb(output_file_path, upload_config, source_video_path)
        except Exception as exc:
            print(f"MongoDB upload failed: {exc}")

    actual_processing_time = time.time() - start_processing_time
    processed_fps = frame_id / actual_processing_time if actual_processing_time > 0 else 0

    print("\n" + "=" * 50)
    print("SUCCESS: Data Extraction Complete!")
    print(f"Total frames processed: {frame_id}")
    print(f"Data saved to:          {output_file_path}")
    print(f"Wall-clock time:        {actual_processing_time:.2f} seconds")
    print(f"Pipeline Speed:         {processed_fps:.2f} FPS")
    print("=" * 50)


def main():
    print("Initializing Universal Vision Sensor Pipeline")
    project_root = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Universal Vision Sensor Pipeline")
    parser.add_argument(
        "--mode",
        type=str,
        choices=["interactive", "batch", "single"],
        default="batch",
        help="single: process one video, interactive: choose from menu, batch: process all",
    )
    parser.add_argument(
        "--video",
        type=str,
        default="data/polito_cross_02/2026-04-11T08:30:30Z.mp4",
        help="Path to video (single mode)",
    )
    parser.add_argument(
        "--video-dir",
        type=str,
        default="data/polito_cross_02",
        help="Local directory with videos when config does not define an S3 source",
    )
    parser.add_argument(
        "--config-dir",
        type=str,
        default="data/polito_cross_02",
        help="Directory containing config.json for the selected intersection",
    )
    parser.add_argument(
        "--upload-to-mongodb",
        action="store_true",
        help="Upload the final JSON result to MongoDB Atlas after processing",
    )
    parser.add_argument("--mongodb-uri", type=str, help="Full MongoDB Atlas connection string")
    parser.add_argument("--mongodb-username", type=str, help="MongoDB username")
    parser.add_argument("--mongodb-password", type=str, help="MongoDB password")
    parser.add_argument("--mongodb-db", type=str, help="MongoDB database name")
    parser.add_argument("--mongodb-collection", type=str, help="MongoDB collection name")
    parser.add_argument(
        "--sequential",
        action="store_true",
        help="Deprecated: batch mode is always sequential now",
    )
    args = parser.parse_args()
    upload_config = _resolve_mongodb_upload_config(args)
    if args.mode == "single":
        video_path = args.video
        if not os.path.isabs(video_path):
            video_path = os.path.join(project_root, video_path)
        video_path = os.path.normpath(video_path)
        base_time, _ = _parse_base_time_from_filename(video_path)
        _process_single_video(project_root, args.config_dir, video_path, base_time, upload_config)
    elif args.mode == "interactive":
        config_data, _ = _load_config(project_root, args.config_dir)
        video_dir = _resolve_video_source(config_data, project_root, args.video_dir)
        selected_video = _interactive_mode(project_root, video_dir)
        if selected_video:
            base_time, _ = _parse_base_time_from_filename(selected_video)
            _process_single_video(project_root, args.config_dir, selected_video, base_time, upload_config)
    elif args.mode == "batch":
        _batch_mode(project_root, args.video_dir, args.config_dir, upload_config)


if __name__ == "__main__":
    main()
