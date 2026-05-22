"""/Users/markus/Documents/traffic/.venv/bin/python traffic_light_control/src/visualizer.py --video data/polito_cross_02/2026-04-11T08:30:30Z.mp4"""
"""/Users/markus/Documents/traffic/.venv/bin/python traffic_light_control/src/visualizer.py --video data/polito_cross_01/2026-04-18T08:43:30Z.mp4"""

import cv2
import numpy as np
import json
import os
import sys
import argparse

# Add parent directory to system path so we can import settings when run directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import settings
from ultralytics import YOLO
from src.frame_enhancer import apply_roi_gamma, get_target_pedestrian_polygons
from src.pedestrian_manager import PedestrianManager
from src.vehicle_manager import VehicleManager


def _resolve_yolo_config(config_data, base_dir):
    yolo_cfg = config_data.get("yolo", {})

    model_path = str(yolo_cfg.get("model_path", settings.MODEL_PATH))
    if not os.path.isabs(model_path):
        model_path = os.path.join(base_dir, model_path)

    tracker_path = str(yolo_cfg.get("tracker", settings.TRACKER_CONFIG))
    if not os.path.isabs(tracker_path):
        tracker_path = os.path.join(base_dir, tracker_path)

    return {
        "model_path": model_path,
        "imgsz": int(yolo_cfg.get("imgsz", 1088)),
        "conf_threshold": float(yolo_cfg.get("conf_threshold", settings.CONF_THRESHOLD)),
        "iou_threshold": float(yolo_cfg.get("iou_threshold", settings.IOU_THRESHOLD)),
        "tracker": tracker_path,
        "device": str(yolo_cfg.get("device", "mps")),
        "persist": bool(yolo_cfg.get("persist", True)),
        "verbose": bool(yolo_cfg.get("verbose", False)),
    }

class Visualizer:
    """
    Handles drawing presentation-friendly overlays for QA testing and demos.
    """
    def __init__(self, config_data):
        self.config_data = config_data
        
        # Define modern UI colors (BGR format)
        self.colors = {
            'box': (80, 220, 80),       # Bright green for tracked objects
            'box_shadow': (20, 60, 20),
            'text': (255, 255, 255),    # White for ID text
            'bg_panel': (0, 0, 0),      # Black for text background
            'lane': (255, 100, 100),    # Tech Blue for lanes
            'crossing': (128, 128, 255) # Light Red for pedestrian crossing
        }

    def _draw_transparent_polygon(self, overlay, polygon_pts, color, alpha=0.10):
        """
        Helper function to draw semi-transparent polygons for ROIs.
        """
        pts = np.array(polygon_pts, np.int32).reshape((-1, 1, 2))
        temp_layer = overlay.copy()
        cv2.fillPoly(temp_layer, [pts], color)
        cv2.addWeighted(temp_layer, alpha, overlay, 1 - alpha, 0, overlay)
        cv2.polylines(overlay, [pts], isClosed=True, color=color, thickness=1)

    def _draw_text_with_white_mask(
        self,
        frame,
        text,
        org,
        font,
        font_scale,
        text_color,
        thickness=2,
        pad=5,
    ):
        """Draw text with a translucent white mask behind it for readability."""
        (w_text, h_text), baseline = cv2.getTextSize(text, font, font_scale, thickness)
        x, y = org
        x1 = max(0, x - pad)
        y1 = max(0, y - h_text - pad)
        x2 = min(frame.shape[1] - 1, x + w_text + pad)
        y2 = min(frame.shape[0] - 1, y + baseline + pad)

        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 255), -1)
        cv2.putText(frame, text, org, font, font_scale, text_color, thickness, cv2.LINE_AA)

    def draw_scene(self, frame, boxes, track_ids, class_names):
        """
        Main drawing function for QA testing.
        Draws compact bounding boxes and labels for detected objects.
        """
        overlay = frame.copy()

        # 1. Draw ROIs (Lanes and Crossings)
        rois = self.config_data.get("spatial_rois", {})
        
        for lane in rois.get("vehicles", []):
            self._draw_transparent_polygon(overlay, lane["polygon"], self.colors['lane'])
            
        for ped in rois.get("pedestrians", []):
            color = self.colors['crossing'] if ped["direction_id"] == "MAIN_CROSSING" else self.colors['box']
            self._draw_transparent_polygon(overlay, ped["polygon"], color)

        # 2. Draw compact boxes for every detected target
        if boxes is not None and class_names is not None:
            for i, box in enumerate(boxes):
                x_center, y_center, w, h = box
                x1 = int(x_center - (w / 2))
                y1 = int(y_center - (h / 2))
                x2 = int(x_center + (w / 2))
                y2 = int(y_center + (h / 2))

                track_id = None
                if track_ids is not None and i < len(track_ids):
                    track_id = track_ids[i]

                cv2.rectangle(overlay, (x1 + 1, y1 + 1), (x2 + 1, y2 + 1), self.colors['box_shadow'], 1)
                cv2.rectangle(overlay, (x1, y1), (x2, y2), self.colors['box'], 2)

                # Center point dot
                cx = int(x_center)
                cy = int(y_center)
                cv2.circle(overlay, (cx + 1, cy + 1), 5, (10, 40, 10), -1)   # shadow
                cv2.circle(overlay, (cx, cy), 5, (0, 230, 80), -1)            # fill
                cv2.circle(overlay, (cx, cy), 5, (255, 255, 255), 1)          # border

                # Label to the right of the dot
                label = class_names[i]

                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.42
                thickness = 1
                (w_text, h_text), baseline = cv2.getTextSize(label, font, font_scale, thickness)
                pad = 4
                lx = cx + 9
                ly = cy + h_text // 2
                cv2.rectangle(overlay,
                              (lx - pad, ly - h_text - pad),
                              (lx + w_text + pad, ly + baseline + pad),
                              (0, 0, 0), -1)
                cv2.putText(overlay, label, (lx, ly),
                            font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

        return overlay

# ==============================================================================
# STANDALONE QA TESTING MODULE
# Executed only when running `python src/visualizer.py` directly
# ==============================================================================
if __name__ == "__main__":
    import time
    print("Starting QA Visualizer Mode...")

    # Define default paths based on project structure
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    parser = argparse.ArgumentParser(description="QA Visualizer")
    parser.add_argument(
        "--video",
        type=str,
        default="data/polito_cross_01/2026-03-11T08:43:30Z.MOV",
        help="Path to input video; config.json will be loaded from the same folder.",
    )
    args = parser.parse_args()

    video_path = args.video
    if not os.path.isabs(video_path):
        video_path = os.path.join(base_dir, video_path)
    video_path = os.path.normpath(video_path)
    config_path = os.path.join(os.path.dirname(video_path), "config.json")

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config not found: {config_path}")

    # Load Config
    with open(config_path, "r") as f:
        config_data = json.load(f)

    yolo_runtime_cfg = _resolve_yolo_config(config_data, base_dir)

    # Initialize YOLO, Visualizer, and Pedestrian Manager
    model = YOLO(yolo_runtime_cfg["model_path"])
    visualizer = Visualizer(config_data)
    ped_gamma_polygons = get_target_pedestrian_polygons(config_data)
    vehicle_mgr = VehicleManager(config_data)
    pedestrian_mgr = PedestrianManager(config_data)
    cap = cv2.VideoCapture(video_path)

    # Get original video FPS to calculate real-time delay
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    if video_fps == 0 or video_fps is None: 
        video_fps = 30.0
    target_frame_time = 1.0 / video_fps

    print("\n" + "="*30)
    print("🎮 QA PLAYER CONTROLS 🎮")
    print("[ 1 ] : Normal Speed (1x)")
    print("[ 4 ] : Fast Forward (4x Skip)")
    print("[Space]: Pause / Resume")
    print("[ q ] : Quit Player")
    print(
        f"YOLO config: model={os.path.basename(yolo_runtime_cfg['model_path'])} "
        f"imgsz={yolo_runtime_cfg['imgsz']} conf={yolo_runtime_cfg['conf_threshold']:.2f} "
        f"iou={yolo_runtime_cfg['iou_threshold']:.2f} device={yolo_runtime_cfg['device']}"
    )
    print("="*30 + "\n")

    speed_mode = 1  # Default to 1x speed for presentation
    frame_counter = 0
    saved_comparison_frames = 0

    output_dir = os.path.join(base_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    # Main Playback Loop
    while cap.isOpened():
        loop_start_time = time.time()
        
        success, frame = cap.read()
        if not success:
            print("Video playback finished.")
            break
            
        frame_counter += 1

        enhanced_frame = apply_roi_gamma(
            frame,
            ped_gamma_polygons,
            enabled=settings.ENABLE_PED_ROI_GAMMA,
            gamma=settings.GAMMA_VALUE,
            brightness_gain=settings.PED_ROI_BRIGHTNESS_GAIN,
        )

        # Frame Skipping Logic for 4x speed
        # If speed is 4, only process 1 out of every 4 frames
        if speed_mode == 4 and frame_counter % 4 != 0:
            continue 

        # Run YOLO with MPS acceleration
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
            else:
                track_ids = [None] * len(boxes)

        person_indices = [i for i, class_name in enumerate(class_names) if class_name == "person"]
        if (
            settings.ENABLE_PED_ROI_GAMMA
            and settings.SAVE_GAMMA_COMPARISON_FRAMES
            and saved_comparison_frames < settings.GAMMA_COMPARISON_FRAME_COUNT
            and person_indices
        ):
            compare_frame = cv2.hconcat([frame, enhanced_frame])
            cv2.putText(compare_frame, "Original", (30, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            cv2.putText(compare_frame, "Enhanced (Gamma Correction)", (frame.shape[1] + 30, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            compare_filename = f"vis_gamma_compare_frame_{frame_counter:06d}.jpg"
            compare_path = os.path.join(output_dir, compare_filename)
            cv2.imwrite(compare_path, compare_frame)
            saved_comparison_frames += 1
            print(
                f"Saved visualizer comparison frame {saved_comparison_frames}/{settings.GAMMA_COMPARISON_FRAME_COUNT}: "
                f"{compare_path}"
            )

        # Draw the sleek overlay
        qa_frame = visualizer.draw_scene(enhanced_frame, boxes, track_ids, class_names)

        lanes_data, _ = vehicle_mgr.update(
            boxes,
            track_ids,
            class_names,
            dt=target_frame_time,
            sim_time=frame_counter * target_frame_time,
        )

        # Update pedestrian manager to get smoothed counts
        pedestrians_data = pedestrian_mgr.update(boxes, class_names, dt=target_frame_time)
        
        # Build count display from pedestrian data
        count_text_lines = []
        for ped_data in pedestrians_data:
            direction = ped_data["direction"]
            waiting_count = ped_data["waiting_count"]
            crossing_count = ped_data["crossing_count"]
            if direction == "MAIN_CROSSING":
                count_text_lines.append(f"MAIN_CROSSING: {crossing_count}")
            else:
                count_text_lines.append(f"{direction}: {waiting_count}")
        
        # Draw current speed mode on the screen
        speed_text = "Speed: 1x (Real-time)" if speed_mode == 1 else "Speed: 4x (QA Fast Forward)"
        color = (0, 255, 0) if speed_mode == 1 else (0, 165, 255) # Green for 1x, Orange for 4x
        visualizer._draw_text_with_white_mask(
            qa_frame,
            speed_text,
            (30, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            color,
            thickness=2,
            pad=6,
        )
        gamma_pipeline_text = (
            f"Pipeline: Gamma={settings.GAMMA_VALUE:.2f}, Bright={settings.PED_ROI_BRIGHTNESS_GAIN:.2f}x"
            if settings.ENABLE_PED_ROI_GAMMA
            else "Pipeline: OFF"
        )
        gamma_color = (0, 255, 255) if settings.ENABLE_PED_ROI_GAMMA else (160, 160, 160)
        visualizer._draw_text_with_white_mask(
            qa_frame,
            gamma_pipeline_text,
            (30, 75),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            gamma_color,
            thickness=2,
            pad=6,
        )
        
        # Draw pedestrian counts in top-left corner
        count_y_offset = 110
        for i, count_line in enumerate(count_text_lines):
            visualizer._draw_text_with_white_mask(
                qa_frame,
                count_line,
                (30, count_y_offset + i * 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 200, 0),
                thickness=2,
                pad=6,
            )

        lane_lookup = {lane.get("direction"): lane for lane in lanes_data or []}
        lane_metric_targets = [
            ("SOUTHTONORTH", "S->N"),
            ("NORTHTOSOUTH", "N->S"),
        ]
        lane_y_offset = count_y_offset + len(count_text_lines) * 25 + 30
        for idx, (direction_id, label) in enumerate(lane_metric_targets):
            lane_data = lane_lookup.get(direction_id, {})
            waiting_vehicles = int(lane_data.get("queue_length", 0))
            total_waiting_time = float(lane_data.get("total_waiting_time", 0.0))
            lane_line = f"{label} wait: {waiting_vehicles} | t={total_waiting_time:.1f}s"
            self_draw_org = (30, lane_y_offset + idx * 25)
            visualizer._draw_text_with_white_mask(
                qa_frame,
                lane_line,
                self_draw_org,
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 80, 0),
                thickness=2,
                pad=6,
            )

        # Resize for better viewing on laptop screens
        display_frame = cv2.resize(qa_frame, (1280, 720))
        cv2.imshow("QA Testing Viewer", display_frame)

        # --- Dynamic Speed Control & Key Listening ---
        process_time = time.time() - loop_start_time
        
        if speed_mode == 1:
            # Calculate remaining ms to wait to hit exact 1x real-time speed
            wait_time_ms = max(1, int((target_frame_time - process_time) * 1000))
        else:
            # In 4x mode, blast through frames as fast as hardware allows
            wait_time_ms = 1

        key = cv2.waitKey(wait_time_ms) & 0xFF
        
        # Handle keyboard interactions
        if key == ord('q'):
            print("Exiting QA Player.")
            break
        elif key == ord('1'):
            speed_mode = 1
            print("-> Switched to 1x Speed.")
        elif key == ord('4'):
            speed_mode = 4
            print("-> Switched to 4x Speed (Frame Skipping Active).")
        elif key == ord(' '):
            print("-> PAUSED. Press Spacebar to resume.")
            while True:
                # Infinite loop to hold the frame until unpaused
                resume_key = cv2.waitKey(100) & 0xFF
                if resume_key == ord(' '):
                    print("-> RESUMED.")
                    break
                elif resume_key == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    sys.exit()

    cap.release()
    cv2.destroyAllWindows()