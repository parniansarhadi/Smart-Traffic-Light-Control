import argparse
from pathlib import Path

try:
	from test_readiness.common import parse_list, resolve_path
	from test_readiness.frame_extract import extract_frames_for_cvat
	from test_readiness.loop_different_params import run_val_grid
except ImportError:
	from common import parse_list, resolve_path
	from frame_extract import extract_frames_for_cvat
	from loop_different_params import run_val_grid


def build_parser() -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(description="Modular test readiness pipeline")
	subparsers = parser.add_subparsers(dest="command", required=True)

	p_extract = subparsers.add_parser("extract", help="Extract CVAT labeling frames")
	p_extract.add_argument(
		"--video",
		type=str,
		default="data/polito_cross_02/2026-04-11T09:20:30Z.mp4",
	)
	p_extract.add_argument(
		"--output-dir",
		type=str,
		default="test_readiness/datasets/cvat_frames_2026-04-11T09-20-30Z",
	)
	p_extract.add_argument("--frames-per-minute", type=int, default=4)

	p_bench = subparsers.add_parser("benchmark", help="Run parameter grid validation + W&B")
	p_bench.add_argument("--model", type=str, default="yolo11m.pt")
	p_bench.add_argument(
		"--data-yaml",
		type=str,
		default="test_readiness/datasets/ground_truth/data.yaml",
	)
	p_bench.add_argument("--imgsz-list", type=str, default="640,960,1280")
	p_bench.add_argument("--conf-list", type=str, default="0.25,0.35,0.50")
	p_bench.add_argument("--iou-list", type=str, default="0.50,0.60")
	p_bench.add_argument("--device", type=str, default="mps")
	p_bench.add_argument("--split", type=str, default="val")
	p_bench.add_argument("--batch", type=int, default=8)
	p_bench.add_argument("--workers", type=int, default=4)
	p_bench.add_argument("--wandb-project", type=str, default="traffic-readiness")
	p_bench.add_argument("--wandb-run-name", type=str, default="")
	p_bench.add_argument(
		"--summary-json",
		type=str,
		default="test_readiness/output/benchmark_summary.json",
	)

	return parser


def main() -> None:
	project_root = Path(__file__).resolve().parents[1]
	args = build_parser().parse_args()

	if args.command == "extract":
		video_path = resolve_path(args.video, project_root)
		output_dir = resolve_path(args.output_dir, project_root)
		saved = extract_frames_for_cvat(video_path, output_dir, args.frames_per_minute)
		print(f"Extracted {saved} frames -> {output_dir}")
		return

	if args.command == "benchmark":
		model_path = resolve_path(args.model, project_root)
		data_yaml = resolve_path(args.data_yaml, project_root)
		summary_json = resolve_path(args.summary_json, project_root) if args.summary_json else None

		imgsz_list = parse_list(args.imgsz_list, int)
		conf_list = parse_list(args.conf_list, float)
		iou_list = parse_list(args.iou_list, float)

		run_val_grid(
			model_path=model_path,
			data_yaml=data_yaml,
			imgsz_list=imgsz_list,
			conf_list=conf_list,
			iou_list=iou_list,
			device=args.device,
			split=args.split,
			batch=args.batch,
			workers=args.workers,
			wandb_project=args.wandb_project,
			wandb_run_name=args.wandb_run_name or None,
			save_summary_json=summary_json,
		)
		return


if __name__ == "__main__":
	main()
