import cv2
import numpy as np


_TARGET_PED_DIRECTION_IDS = {"EASTTOWEST", "WESTTOEAST", "MAIN_CROSSING"}


def get_target_pedestrian_polygons(config_data):
    """Return polygons only for low-light pedestrian zones used for Gamma correction."""
    polygons = []
    pedestrian_rois = config_data.get("spatial_rois", {}).get("pedestrians", [])
    for ped_roi in pedestrian_rois:
        if ped_roi.get("direction_id") in _TARGET_PED_DIRECTION_IDS:
            polygons.append(ped_roi.get("polygon", []))
    return polygons


# Precomputed LUT cache keyed by gamma value to avoid per-frame recomputation.
_gamma_lut_cache: dict = {}


def _get_gamma_lut(gamma: float) -> np.ndarray:
    if gamma not in _gamma_lut_cache:
        table = (np.power(np.arange(256) / 255.0, gamma) * 255).astype(np.uint8)
        _gamma_lut_cache[gamma] = table
    return _gamma_lut_cache[gamma]


def apply_roi_gamma(
    frame,
    polygons,
    enabled=True,
    gamma=0.75,
    brightness_gain=1.0,
):
    """Apply gamma correction and optional brightness gain to ROI pixels.

    Strategy for bridge/underpass low-light:
      Gamma < 1 applied to the LAB-L channel raises dark pixels
      disproportionately (e.g. pixel 50 → ~93 at gamma=0.6).
        brightness_gain > 1 linearly lifts ROI brightness (e.g. 1.5 => +50%).
      Only pixels inside the target pedestrian polygons are modified.
    """
    if not enabled or frame is None or not polygons:
        return frame

    height, width = frame.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)

    for polygon in polygons:
        if not polygon:
            continue
        pts = np.array(polygon, dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(mask, [pts], 255)

    if not np.any(mask):
        return frame

    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    # Apply gamma correction on L channel
    lut = _get_gamma_lut(gamma)
    l_enhanced = cv2.LUT(l_channel, lut)

    if brightness_gain != 1.0:
        l_enhanced = np.clip(
            l_enhanced.astype(np.float32) * float(brightness_gain),
            0,
            255,
        ).astype(np.uint8)

    enhanced_lab = cv2.merge([l_enhanced, a_channel, b_channel])
    enhanced_frame = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    output = frame.copy()
    output[mask > 0] = enhanced_frame[mask > 0]
    return output
