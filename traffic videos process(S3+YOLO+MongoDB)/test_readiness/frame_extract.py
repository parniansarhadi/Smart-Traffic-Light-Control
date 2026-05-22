import argparse
from pathlib import Path

import cv2

try:
	from test_readiness.common import resolve_path
except ImportError:
	from common import resolve_path


def extract_frames_for_cvat(video_path: Path, output_dir: Path, frames_per_minute: int = 4) -> int:
	"""Extract representative frames from a video for CVAT annotation."""
	if frames_per_minute <= 0:
		raise ValueError("frames_per_minute must be > 0")
	if not video_path.exists():
		raise FileNotFoundError(f"Video not found: {video_path}")

	output_dir.mkdir(parents=True, exist_ok=True)

	cap = cv2.VideoCapture(str(video_path))
	if not cap.isOpened():
		raise RuntimeError(f"Failed to open video: {video_path}")

	fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
	total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
	if fps <= 0.0:
		cap.release()
		raise RuntimeError("Could not read FPS from video")

	duration_sec = (total_frames / fps) if total_frames > 0 else 0.0
	interval_sec = 60.0 / float(frames_per_minute)

	idx = 0
	saved = 0
	current_ts = 0.0
	while duration_sec <= 0.0 or current_ts < duration_sec:
		cap.set(cv2.CAP_PROP_POS_MSEC, current_ts * 1000.0)
		ok, frame = cap.read()
		if not ok:
			break

		file_name = (
			f"{video_path.stem}_fpm{frames_per_minute}_"
			f"{idx:04d}_t{current_ts:08.2f}s.jpg"
		)
		out_path = output_dir / file_name
		cv2.imwrite(str(out_path), frame)
		saved += 1

		idx += 1
		current_ts += interval_sec

	cap.release()
	return saved


def build_parser() -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(description="Extract frames for CVAT annotation")
	parser.add_argument(
		"--video",
		type=str,
		default="data/polito_cross_02/2026-04-11T09:20:30Z.mp4",
		help="Input video path",
	)
	parser.add_argument(
		"--output-dir",
		type=str,
		default="test_readiness/datasets/cvat_frames_2026-04-11T09-20-30Z",
		help="Output folder for extracted frames",
	)
	parser.add_argument(
		"--frames-per-minute",
		type=int,
		default=4,
		help="How many frames to extract per minute",
	)
	return parser


def main() -> None:
	project_root = Path(__file__).resolve().parents[1]
	args = build_parser().parse_args()

	video_path = resolve_path(args.video, project_root)
	output_dir = resolve_path(args.output_dir, project_root)
	saved = extract_frames_for_cvat(video_path, output_dir, args.frames_per_minute)

	print(f"Extracted {saved} frames -> {output_dir}")


if __name__ == "__main__":
	main()
