import os

# ================= GLOBAL SYSTEM PATHS =================
# Path to the YOLO model (nano version recommended for speed)
MODEL_PATH = "yolo11m.pt"

# ================= AI & VISION THRESHOLDS =================
# YOLO confidence threshold (0.0 - 1.0)
# Note: 0.09 is very low and might cause ghost detections. 
# Consider raising to 0.25 - 0.35 in real-world scenarios if noise occurs.
CONF_THRESHOLD = 0.20

# IoU threshold for NMS; slightly higher helps suppress duplicate flicker boxes.
IOU_THRESHOLD = 0.50

# Shared tracker config used by both main pipeline and visualizer.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRACKER_CONFIG = os.path.join(_BASE_DIR, "trackers", "bytetrack_stable.yaml")

# ================= PEDESTRIAN LOW-LIGHT ENHANCEMENT =================
# Disable ROI-only Gamma correction by default.
ENABLE_PED_ROI_GAMMA = False
# Gamma < 1 lifts dark pixels (0.5=strong lift, 0.7=mild lift, 0.6=balanced).
GAMMA_VALUE = 0.6
# Linear brightness gain on pedestrian ROI after gamma correction.
# 1.5 means +50% brightness.
PED_ROI_BRIGHTNESS_GAIN = 1.5

# Save first N frames where a person is detected: side-by-side (original | enhanced).
SAVE_GAMMA_COMPARISON_FRAMES = True
GAMMA_COMPARISON_FRAME_COUNT = 2

# ================= BUSINESS LOGIC RULES =================
# Speed limit to consider a vehicle as "Stopped" or "Waiting" (km/h)
STOPPED_SPEED_LIMIT = 5.0

# Number of frames to keep in history for trajectory smoothing and speed calculation
MAX_HISTORY = 30

# Keep a vehicle alive this many frames after temporary tracking loss.
# Helps prevent count/waiting-time flicker caused by short occlusions.
TRACK_GRACE_FRAMES = 15

# Reconnect a newly seen tracker ID to a recently lost vehicle when
# class/lane/spatial distance suggest it is the same physical object.
LOGICAL_REID_GRACE_FRAMES = 45
LOGICAL_REID_DISTANCE_PX = 90.0

# Pedestrian anti-flicker controls mirroring vehicle-level robustness.
PED_TRACK_GRACE_FRAMES = 15
PED_LOGICAL_REID_GRACE_FRAMES = 45
PED_LOGICAL_REID_DISTANCE_PX = 90.0

# Pedestrian counting with sliding window median filter.
PED_ENABLE_MEDIAN_FILTER = True
PED_WINDOW_SIZE = 15  # Number of frames to keep in sliding window for median calculation.

# Pixel-to-meter mapping for speed estimation from image displacement.
PIXELS_PER_METER = 20.0