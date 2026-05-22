import argparse
import itertools
import json
import time
from datetime import datetime
from pathlib import Path

from ultralytics import YOLO

try:
	from test_readiness.common import parse_list, resolve_path, safe_metric
	from test_readiness.wandb_tracker import WandbTracker
except ImportError:
	from common import parse_list, resolve_path, safe_metric
	from wandb_tracker import WandbTracker


def run_val_grid(
	model_path: Path,
	data_yaml: Path,
	imgsz_list,
	conf_list,
	iou_list,
	device: str,
	split: str,
	batch: int,
	workers: int,
	wandb_project: str,
	wandb_run_name: str | None,
	save_summary_json: Path | None,
):
	tracker = WandbTracker(
		project=wandb_project,
		config={
			"model": str(model_path),
			"data_yaml": str(data_yaml),
			"imgsz_list": list(imgsz_list),
			"conf_list": list(conf_list),
			"iou_list": list(iou_list),
			"device": device,
			"split": split,
		},
		run_name=wandb_run_name,
	)

	model = YOLO(str(model_path))
	combos = list(itertools.product(imgsz_list, conf_list, iou_list))
	best_row = None
	all_rows = []

	for idx, (imgsz, conf, iou) in enumerate(combos, start=1):
		print(f"[{idx}/{len(combos)}] val imgsz={imgsz} conf={conf} iou={iou}")

		t0 = time.perf_counter()
		results = model.val(
			data=str(data_yaml),
			imgsz=int(imgsz),
			conf=float(conf),
			iou=float(iou),
			device=device,
			split=split,
			batch=batch,
			workers=workers,
			verbose=False,
			plots=False,
		)
		elapsed_sec = time.perf_counter() - t0

		metrics_obj = getattr(results, "box", None)
		precision = safe_metric(metrics_obj, "mp") if metrics_obj else None
		recall = safe_metric(metrics_obj, "mr") if metrics_obj else None
		map50 = safe_metric(metrics_obj, "map50") if metrics_obj else None
		map5095 = safe_metric(metrics_obj, "map") if metrics_obj else None

		speed = getattr(results, "speed", {}) or {}
		preprocess_ms = float(speed.get("preprocess", 0.0))
		inference_ms = float(speed.get("inference", 0.0))
		postprocess_ms = float(speed.get("postprocess", 0.0))

		row = {
			"timestamp": datetime.utcnow().isoformat(),
			"imgsz": int(imgsz),
			"conf": float(conf),
			"iou": float(iou),
			"precision": precision,
			"recall": recall,
			"mAP50": map50,
			"mAP50_95": map5095,
			"elapsed_sec": elapsed_sec,
			"preprocess_ms": preprocess_ms,
			"inference_ms": inference_ms,
			"postprocess_ms": postprocess_ms,
		}

		tracker.log(row)
		all_rows.append(row)

		score = map5095 if map5095 is not None else -1.0
		best_score = best_row["mAP50_95"] if best_row and best_row["mAP50_95"] is not None else -1.0
		if score > best_score:
			best_row = row

	if best_row is not None:
		best_payload = {f"best/{k}": v for k, v in best_row.items()}
		tracker.log(best_payload)
		print("Best config:")
		print(best_row)

	if save_summary_json is not None:
		save_summary_json.parent.mkdir(parents=True, exist_ok=True)
		with open(save_summary_json, "w", encoding="utf-8") as f:
			json.dump(
				{
					"best": best_row,
					"experiments": all_rows,
				},
				f,
				ensure_ascii=False,
				indent=2,
			)
		print(f"Summary JSON saved to: {save_summary_json}")

	tracker.finish()


def build_parser() -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(description="Run YOLO val grid and log metrics to W&B")
	parser.add_argument("--model", type=str, default="yolo11m.pt", help="YOLO model path")
	parser.add_argument(
		"--data-yaml",
		type=str,
		default="test_readiness/datasets/ground_truth/data.yaml",
		help="Dataset yaml exported from CVAT",
	)
	parser.add_argument("--imgsz-list", type=str, default="640,960,1280")
	parser.add_argument("--conf-list", type=str, default="0.25,0.35,0.50")
	parser.add_argument("--iou-list", type=str, default="0.50,0.60")
	parser.add_argument("--device", type=str, default="mps")
	parser.add_argument("--split", type=str, default="val")
	parser.add_argument("--batch", type=int, default=8)
	parser.add_argument("--workers", type=int, default=4)
	parser.add_argument("--wandb-project", type=str, default="traffic-readiness")
	parser.add_argument("--wandb-run-name", type=str, default="")
	parser.add_argument(
		"--summary-json",
		type=str,
		default="test_readiness/output/benchmark_summary.json",
		help="Optional local summary output. W&B remains the main source.",
	)
	return parser


def main() -> None:
	project_root = Path(__file__).resolve().parents[1]
	args = build_parser().parse_args()

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


if __name__ == "__main__":
	main()
