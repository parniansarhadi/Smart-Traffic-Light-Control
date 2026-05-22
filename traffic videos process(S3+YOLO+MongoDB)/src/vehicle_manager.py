import cv2
import math
import numpy as np
from copy import deepcopy

import settings

class VehicleManager:
    def __init__(self, config_data):
        self.lanes = config_data.get("spatial_rois", {}).get("vehicles", [])

        # Track state across frames for speed and waiting-time accumulation.
        # Format: {track_id: {"lane_id": str, "wait_time": float, "last_point": (x, y), "speed": float}}
        self.tracked_vehicles = {}

        self.vehicle_classes = {"car", "bus", "truck", "motorcycle", "ambulance"}
        self.emergency_classes = {"ambulance"}
        self.stopped_speed_limit = getattr(settings, "STOPPED_SPEED_LIMIT", 5.0)
        config_ppm = config_data.get("metadata", {}).get("pixels_per_meter")
        if config_ppm is not None:
            self.pixels_per_meter = float(config_ppm)
        else:
            self.pixels_per_meter = float(getattr(settings, "PIXELS_PER_METER", 20.0))
        self.max_history = int(getattr(settings, "MAX_HISTORY", 30))
        self.track_grace_frames = int(getattr(settings, "TRACK_GRACE_FRAMES", 15))
        self.logical_reid_grace_frames = int(getattr(settings, "LOGICAL_REID_GRACE_FRAMES", 45))
        self.logical_reid_distance_px = float(getattr(settings, "LOGICAL_REID_DISTANCE_PX", 90.0))
        self.smoothing_segments = 5
        self.next_logical_id = 1
        self.recently_lost = []

        self.current_second_key = None
        self.prev_visible_logical = {}
        self.current_second_passed = self._new_passed_bucket()
        self.last_second_passed = self._new_passed_bucket()

    def _new_passed_bucket(self):
        lane_ids = [lane.get("direction_id") for lane in self.lanes if lane.get("direction_id")]
        return {
            lane_id: {
                "car": 0,
                "truck": 0,
                "motorcycle": 0,
                "bus": 0,
                "ambulance": 0,
            }
            for lane_id in lane_ids
        }

    def _start_new_second_if_needed(self, sim_time):
        if sim_time is None:
            return

        second_key = int(sim_time)
        if self.current_second_key is None:
            self.current_second_key = second_key
            return

        if second_key != self.current_second_key:
            self.last_second_passed = deepcopy(self.current_second_passed)
            self.current_second_passed = self._new_passed_bucket()
            self.current_second_key = second_key

    def _update_passed_from_disappeared(self, current_visible_logical):
        disappeared_ids = set(self.prev_visible_logical.keys()) - set(current_visible_logical.keys())
        for logical_id in disappeared_ids:
            prev_item = self.prev_visible_logical.get(logical_id, {})
            lane_id = prev_item.get("lane_id")
            class_name = prev_item.get("class_name")

            if lane_id not in self.current_second_passed:
                continue
            if class_name not in self.current_second_passed[lane_id]:
                continue

            self.current_second_passed[lane_id][class_name] += 1

        self.prev_visible_logical = current_visible_logical

    def get_last_second_passed_counts(self):
        return deepcopy(self.last_second_passed)

    def get_current_second_passed_counts(self):
        return deepcopy(self.current_second_passed)

    def _allocate_logical_id(self):
        logical_id = self.next_logical_id
        self.next_logical_id += 1
        return logical_id

    def _distance(self, p1, p2):
        if p1 is None or p2 is None:
            return float("inf")
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def _get_reid_candidate(self, lane_id, class_name, bottom_center):
        best_idx = None
        best_dist = float("inf")

        for idx, item in enumerate(self.recently_lost):
            if item["lane_id"] != lane_id or item["class_name"] != class_name:
                continue
            dist = self._distance(item.get("last_point"), bottom_center)
            if dist <= self.logical_reid_distance_px and dist < best_dist:
                best_idx = idx
                best_dist = dist

        if best_idx is None:
            return None
        return self.recently_lost.pop(best_idx)

    def _get_bottom_center(self, box):
        # YOLO xywh format: x_center, y_center, width, height
        x_center, y_center, w, h = box
        bottom_x = int(x_center)
        bottom_y = int(y_center + (h / 2))
        return (bottom_x, bottom_y)

    def _get_center(self, box):
        x_center, y_center, w, h = box
        return (int(x_center), int(y_center))

    def _is_in_polygon(self, point, polygon_pts):
        pts = np.array(polygon_pts, np.int32)
        dist = cv2.pointPolygonTest(pts, point, False)
        return dist >= 0

    def _get_speed_kmh(self, prev_point, curr_point, dt):
        if prev_point is None or dt <= 0 or self.pixels_per_meter <= 0:
            return 0.0

        dx = curr_point[0] - prev_point[0]
        dy = curr_point[1] - prev_point[1]
        dist_px = math.hypot(dx, dy)
        speed_mps = (dist_px / self.pixels_per_meter) / dt
        return speed_mps * 3.6

    def _get_smoothed_speed_kmh(self, history, dt):
        if len(history) < 2:
            return 0.0

        points = history[-(self.smoothing_segments + 1):]
        speeds = []
        for idx in range(1, len(points)):
            speeds.append(self._get_speed_kmh(points[idx - 1], points[idx], dt))

        if not speeds:
            return 0.0

        return sum(speeds) / len(speeds)

    def update(self, boxes, track_ids, class_names, dt, sim_time=None):
        self._start_new_second_if_needed(sim_time)

        if boxes is None:
            boxes = []
        if class_names is None:
            class_names = []
        if track_ids is None:
            track_ids = []

        if len(track_ids) < len(boxes):
            track_ids = list(track_ids) + [None] * (len(boxes) - len(track_ids))

        count = min(len(boxes), len(class_names), len(track_ids))
        current_frame_track_ids = set()
        current_visible_logical = {}
        transient_untracked = []

        for item in self.recently_lost:
            item["lost_frames"] += 1
        self.recently_lost = [
            item for item in self.recently_lost
            if item["lost_frames"] <= self.logical_reid_grace_frames
        ]

        for i in range(count):
            class_name = class_names[i]
            if class_name not in self.vehicle_classes:
                continue

            track_id = track_ids[i]
            bottom_center = self._get_bottom_center(boxes[i])
            center = self._get_center(boxes[i])
            matched_lane_id = None

            for lane in self.lanes:
                if self._is_in_polygon(center, lane["polygon"]):
                    matched_lane_id = lane["direction_id"]
                    break

            # Keep lane continuity if the center jitters outside the polygon briefly.
            if matched_lane_id is None and track_id is not None and track_id in self.tracked_vehicles:
                matched_lane_id = self.tracked_vehicles[track_id].get("lane_id")

            if matched_lane_id is not None:
                speed_kmh = 0.0
                waiting_time = 0.0
                is_waiting = False

                if track_id is not None:
                    current_frame_track_ids.add(track_id)

                    if track_id not in self.tracked_vehicles:
                        reid_item = self._get_reid_candidate(matched_lane_id, class_name, bottom_center)
                        logical_id = self._allocate_logical_id()
                        initial_wait_time = 0.0
                        if reid_item is not None:
                            logical_id = reid_item.get("logical_id", logical_id)
                            initial_wait_time = reid_item.get("wait_time", 0.0)

                        self.tracked_vehicles[track_id] = {
                            "lane_id": matched_lane_id,
                            "class_name": class_name,
                            "logical_id": logical_id,
                            "wait_time": initial_wait_time,
                            "last_point": bottom_center,
                            "speed": 0.0,
                            "is_waiting": False,
                            "history": [bottom_center],
                            "missed_frames": 0
                        }

                    state = self.tracked_vehicles[track_id]
                    state["history"].append(bottom_center)
                    if len(state["history"]) > self.max_history:
                        state["history"].pop(0)

                    speed_kmh = self._get_smoothed_speed_kmh(state["history"], dt)
                    state["speed"] = speed_kmh
                    state["last_point"] = bottom_center
                    state["lane_id"] = matched_lane_id
                    state["class_name"] = class_name
                    state["missed_frames"] = 0

                    logical_id = str(state.get("logical_id", track_id))
                    current_visible_logical[logical_id] = {
                        "lane_id": matched_lane_id,
                        "class_name": class_name,
                    }

                    if speed_kmh < self.stopped_speed_limit:
                        state["wait_time"] += dt
                        is_waiting = True
                    state["is_waiting"] = is_waiting

                    waiting_time = state["wait_time"]

                else:
                    # Keep untracked detections in this frame output only.
                    transient_untracked.append({
                        "direction": matched_lane_id,
                        "ID": f"untracked_{i}",
                        "class": class_name,
                        "speed": round(speed_kmh, 1),
                        "waiting_time": round(waiting_time, 1),
                        "is_waiting": is_waiting
                    })

        self._update_passed_from_disappeared(current_visible_logical)

        for track_id, state in list(self.tracked_vehicles.items()):
            if track_id not in current_frame_track_ids:
                state["missed_frames"] = state.get("missed_frames", 0) + 1
            if state.get("missed_frames", 0) > self.track_grace_frames:
                self.recently_lost.append({
                    "logical_id": state.get("logical_id"),
                    "lane_id": state.get("lane_id"),
                    "class_name": state.get("class_name"),
                    "wait_time": state.get("wait_time", 0.0),
                    "last_point": state.get("last_point"),
                    "lost_frames": 0
                })
                del self.tracked_vehicles[track_id]

        lane_stats = {
            lane["direction_id"]: {
                "vehicles_count": 0,
                "queue_length": 0,
                "total_waiting_time": 0.0,
                "objects": []
            }
            for lane in self.lanes
        }
        emergency_data = []

        for track_id, state in self.tracked_vehicles.items():
            lane_id = state.get("lane_id")
            if lane_id not in lane_stats:
                continue

            object_id = str(state.get("logical_id", track_id))
            speed_kmh = round(state.get("speed", 0.0), 1)
            waiting_time = round(state.get("wait_time", 0.0), 1)
            class_name = state.get("class_name", "car")
            is_waiting = bool(state.get("is_waiting", False))

            lane_stats[lane_id]["vehicles_count"] += 1
            if is_waiting:
                lane_stats[lane_id]["queue_length"] += 1
                lane_stats[lane_id]["total_waiting_time"] += state.get("wait_time", 0.0)

            lane_stats[lane_id]["objects"].append({
                "ID": object_id,
                "class": class_name,
                "speed": speed_kmh,
                "waiting_time": waiting_time
            })

            if class_name in self.emergency_classes:
                emergency_data.append({
                    "ID": object_id,
                    "direction": lane_id,
                    "speed": speed_kmh,
                    "waiting_time": waiting_time
                })

        for obj in transient_untracked:
            lane_id = obj["direction"]
            if lane_id not in lane_stats:
                continue

            lane_stats[lane_id]["vehicles_count"] += 1
            if obj["is_waiting"]:
                lane_stats[lane_id]["queue_length"] += 1
                lane_stats[lane_id]["total_waiting_time"] += obj["waiting_time"]

            lane_stats[lane_id]["objects"].append({
                "ID": obj["ID"],
                "class": obj["class"],
                "speed": obj["speed"],
                "waiting_time": obj["waiting_time"]
            })

        lanes_data = []
        for lane in self.lanes:
            direction = lane["direction_id"]
            stats = lane_stats[direction]
            lanes_data.append({
                "direction": direction,
                "vehicles_count": stats["vehicles_count"],
                "queue_length": stats["queue_length"],
                "total_waiting_time": round(stats["total_waiting_time"], 1),
                "objects": stats["objects"]
            })

        return lanes_data, emergency_data