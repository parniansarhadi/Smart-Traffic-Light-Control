import cv2
import numpy as np

import settings


class PedestrianManager:
    """Count pedestrians in each ROI and apply sliding-window median filtering to reduce flicker.
    No individual tracking—pure frame-by-frame counting with statistical smoothing.
    """

    def __init__(self, config_data):
        self.ped_rois = config_data.get("spatial_rois", {}).get("pedestrians", [])
        self.window_size = int(getattr(settings, "PED_WINDOW_SIZE", 15))
        self.median_enabled = bool(getattr(settings, "PED_ENABLE_MEDIAN_FILTER", True))

        # Sliding window: {direction_id: deque of count values}
        self.count_history = {
            roi["direction_id"]: [] for roi in self.ped_rois
        }

    def _get_bottom_center(self, box):
        x_center, y_center, w, h = box
        return (int(x_center), int(y_center + (h / 2)))

    def _get_center(self, box):
        x_center, y_center, w, h = box
        return (int(x_center), int(y_center))

    def _is_in_polygon(self, point, polygon_pts):
        pts = np.array(polygon_pts, np.int32)
        return cv2.pointPolygonTest(pts, point, False) >= 0

    def _is_crossing_roi(self, direction_id):
        return direction_id == "MAIN_CROSSING"

    def _compute_median(self, direction_id):
        """Return median of count history for a given direction, or 0 if empty."""
        if direction_id not in self.count_history or not self.count_history[direction_id]:
            return 0
        return int(np.median(self.count_history[direction_id]))

    def update(self, boxes, class_names, dt, track_ids=None):
        """Count persons in each ROI, push to sliding window, return median-filtered counts."""
        # Initialize current frame counts
        current_counts = {roi["direction_id"]: 0 for roi in self.ped_rois}
        current_crossing_counts = {roi["direction_id"]: 0 for roi in self.ped_rois}

        if boxes is not None and class_names is not None:
            count = min(len(boxes), len(class_names))

            for i in range(count):
                if class_names[i] != "person":
                    continue

                bottom_center = self._get_bottom_center(boxes[i])
                center_point = self._get_center(boxes[i])
                matched_direction = None

                # Primary rule: use bottom-center to represent the foot point.
                for roi in self.ped_rois:
                    if self._is_in_polygon(bottom_center, roi["polygon"]):
                        matched_direction = roi["direction_id"]
                        break

                # Fallback: for far/partially occluded pedestrians, bottom-center can miss ROI.
                if matched_direction is None:
                    for roi in self.ped_rois:
                        if self._is_in_polygon(center_point, roi["polygon"]):
                            matched_direction = roi["direction_id"]
                            break

                if matched_direction is None:
                    continue

                if self._is_crossing_roi(matched_direction):
                    current_crossing_counts[matched_direction] += 1
                else:
                    current_counts[matched_direction] += 1

        # Push current counts to sliding window and keep size limited
        for direction_id in self.count_history:
            self.count_history[direction_id].append(current_counts[direction_id])
            if len(self.count_history[direction_id]) > self.window_size:
                self.count_history[direction_id].pop(0)

        # Build output with median-smoothed counts
        output = []
        for roi in self.ped_rois:
            direction_id = roi["direction_id"]
            if self.median_enabled:
                smoothed_count = self._compute_median(direction_id)
            else:
                smoothed_count = current_counts[direction_id]

            output.append({
                "direction": direction_id,
                "waiting_count": smoothed_count if not self._is_crossing_roi(direction_id) else 0,
                "crossing_count": current_crossing_counts[direction_id],
                "total_waiting_time": 0.0  # No longer tracking individual waiting time
            })

        return output
        