import cv2
import json
import numpy as np
import os

def draw_transparent_polygon(overlay, polygon_pts, color):
    """Draws a filled polygon onto the overlay image."""
    pts = np.array(polygon_pts, np.int32)
    pts = pts.reshape((-1, 1, 2))
    cv2.fillPoly(overlay, [pts], color)

def generate_presentation_image():
    # 1. Paths Setup
    base_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(base_dir, "data", "polito_cross_02", "clean_frame.jpg")
    config_path = os.path.join(base_dir, "data", "polito_cross_02", "config.json")
    output_path = os.path.join(base_dir, "presentation_02.jpg")

    # 2. Load Image and Config
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not load image at {image_path}")
        return

    with open(config_path, "r") as f:
        config = json.load(f)

    # 3. Create a transparent overlay layer
    overlay = img.copy()

    # --- THE NEW COLOR PALETTE (BGR Format) ---
    # Pure Tech Blue (Zero Red, slightly Green for brightness)
    COLOR_VEHICLE = (255, 50, 0)      
    # Bright Warning Yellow
    COLOR_WAITING = (0, 255, 255)     
    # Pastel Light Red (High Blue/Green to make it pinkish/light red)
    COLOR_CROSSING = (128, 128, 255)  
    # Bright Green for Traffic Lights
    COLOR_LIGHT = (0, 255, 0)         

    rois = config.get("spatial_rois", {})

    # 4. Draw Vehicles (Pure Blue)
    for v in rois.get("vehicles", []):
        draw_transparent_polygon(overlay, v["polygon"], COLOR_VEHICLE)

    # 5. Draw Pedestrians & Crossing (Dynamic Color Logic)
    for p in rois.get("pedestrians", []):
        if p["direction_id"] == "MAIN_CROSSING":
            # Paint the main crossing area Light Red
            draw_transparent_polygon(overlay, p["polygon"], COLOR_CROSSING)
        else:
            # Paint the sidewalk waiting areas Yellow
            draw_transparent_polygon(overlay, p["polygon"], COLOR_WAITING)

    # 6. Draw Traffic Lights (Bright Green)
    for l in rois.get("traffic_lights", []):
        draw_transparent_polygon(overlay, l["polygon"], COLOR_LIGHT)

    # 7. Blend the overlay with the original image
    alpha = 0.35
    final_img = cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0)

    # 8. Add presentation text
    cv2.putText(final_img, "Active Perception ROIs", (30, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)

    # 9. Save and display
    cv2.imwrite(output_path, final_img)
    print(f"Success! Presentation image saved to: {output_path}")

if __name__ == "__main__":
    generate_presentation_image()