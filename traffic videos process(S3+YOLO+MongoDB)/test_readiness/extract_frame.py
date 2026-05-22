import cv2
import os

def extract_specific_frame(video_path, frame_number=0, output_filename="target_frame_file2.jpg"):
    # 1. Open the video file
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Cannot open video file at {video_path}")
        return

    # --- THE MAGIC LINE ---
    # 2. Jump directly to the specific frame number
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
    
    # 3. Read that specific frame
    success, frame = cap.read()
    
    if success:
        # 4. Save the frame
        folder_path = os.path.dirname(video_path)
        output_path = os.path.join(folder_path, output_filename)
        
        cv2.imwrite(output_path, frame)
        print(f"Success! Frame {frame_number} saved to: {output_path}")
    else:
        print(f"Error: Could not read frame {frame_number}. Is the number too large?")

    # 5. Release resources
    cap.release()

if __name__ == "__main__":
    # Get absolute path to avoid terminal directory errors
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    TARGET_VIDEO = os.path.join(BASE_DIR, "data", "polito_cross_02", "2026-04-11T08:30:30Z.MP4")
    
    # Example: Skip the first 150 frames (approx. 5 seconds at 30 FPS)
    # You can change 150 to any frame where the intersection is clear
    TARGET_FRAME_NUMBER = 10 
    
    extract_specific_frame(TARGET_VIDEO, frame_number=TARGET_FRAME_NUMBER, output_filename="clean_frame.jpg")