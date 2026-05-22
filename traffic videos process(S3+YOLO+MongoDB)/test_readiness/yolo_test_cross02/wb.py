import argparse
import csv
import re
import shutil
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import wandb
import yaml
from ultralytics import YOLO


def _to_float_dict(raw: dict[str, Any]) -> dict[str, float]:
	metrics: dict[str, float] = {}
	for k, v in raw.items():
		if isinstance(v, (int, float)):
			metrics[k] = float(v)
			continue
		# Handle scalar-like values (e.g. numpy scalar / torch scalar) safely.
		if hasattr(v, "item"):
			try:
				metrics[k] = float(v.item())
			except Exception:
				pass
	return metrics


def _dashboard_metrics(metrics: dict[str, float]) -> dict[str, float]:
	# Keep stable, short keys for W&B panels.
	aliases = {
		"metrics/mAP50(B)": "map50",
		"metrics/mAP50-95(B)": "map50_95",
		"metrics/precision(B)": "precision",
		"metrics/recall(B)": "recall",
		"fitness": "fitness",
	}
	out: dict[str, float] = {}
	for src, dst in aliases.items():
		if src in metrics:
			out[dst] = metrics[src]
	return out


def _safe_metric_name(raw: str) -> str:
	cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", str(raw).strip().lower())
	return cleaned.strip("_") or "unknown"


def _extract_class_names(results: Any) -> dict[int, str]:
	names = getattr(results, "names", None)
	if isinstance(names, dict):
		return {int(k): str(v) for k, v in names.items()}
	if isinstance(names, (list, tuple)):
		return {i: str(v) for i, v in enumerate(names)}
	return {}


def _classwise_metrics(
	results: Any,
	dataset_names: dict[int, str] | None = None,
	allowed_class_ids: set[int] | None = None,
) -> dict[str, float]:
	box = getattr(results, "box", None)
	if box is None:
		return {}

	class_names = dataset_names or _extract_class_names(results)
	indices_raw = getattr(box, "ap_class_index", None)
	if indices_raw is None:
		indices: list[int] = []
	else:
		try:
			indices = [int(x) for x in list(indices_raw)]
		except Exception:
			indices = []
	if not indices and class_names:
		indices = sorted(class_names.keys())
	if not indices:
		maps = getattr(box, "maps", None)
		if maps is not None:
			indices = list(range(len(maps)))

	out: dict[str, float] = {}
	for pos, cls_idx in enumerate(indices):
		cls_int = int(cls_idx)
		if allowed_class_ids is not None and cls_int not in allowed_class_ids:
			continue
		cls_name = class_names.get(cls_int, f"class_{cls_int}")
		base = f"class/{_safe_metric_name(cls_name)}"

		# Preferred path in Ultralytics metrics API.
		if hasattr(box, "class_result"):
			try:
				p, r, ap50, ap = box.class_result(pos)
				out[f"{base}/precision"] = float(p)
				out[f"{base}/recall"] = float(r)
				out[f"{base}/map50"] = float(ap50)
				out[f"{base}/map50_95"] = float(ap)
				continue
			except Exception:
				pass

		# Fallback path for API differences across versions.
		for attr, metric_name in (("p", "precision"), ("r", "recall"), ("maps", "map50_95")):
			arr = getattr(box, attr, None)
			if arr is None or len(arr) <= pos:
				continue
			try:
				out[f"{base}/{metric_name}"] = float(arr[pos])
			except Exception:
				pass

		all_ap = getattr(box, "all_ap", None)
		if all_ap is not None:
			try:
				if len(all_ap) > pos and len(all_ap[pos]) > 0:
					out[f"{base}/map50"] = float(all_ap[pos][0])
			except Exception:
				pass

	return out


def _sanitize_float(v: float) -> str:
	return str(v).replace(".", "p")


def _write_results_csv(csv_path: Path, row: dict[str, Any]) -> None:
	fieldnames = list(row.keys())
	write_header = not csv_path.exists()
	csv_path.parent.mkdir(parents=True, exist_ok=True)
	with csv_path.open("a", newline="", encoding="utf-8") as f:
		writer = csv.DictWriter(f, fieldnames=fieldnames)
		if write_header:
			writer.writeheader()
		writer.writerow(row)


def _load_yaml(yaml_path: Path) -> dict[str, Any]:
	with yaml_path.open("r", encoding="utf-8") as f:
		return yaml.safe_load(f) or {}


def _dataset_names_from_yaml(yaml_path: Path) -> dict[int, str]:
	content = _load_yaml(yaml_path)
	raw_names = content.get("names", {})
	if isinstance(raw_names, dict):
		return {int(k): str(v) for k, v in raw_names.items()}
	if isinstance(raw_names, list):
		return {i: str(v) for i, v in enumerate(raw_names)}
	return {}


def _resolve_split_dir(data_yaml: Path, content: dict[str, Any], split: str) -> Path:
	split_value = content.get(split)
	if not split_value:
		raise ValueError(f"Split '{split}' not found in {data_yaml}")
	root = Path(content.get("path", data_yaml.parent))
	if not root.is_absolute():
		root = (data_yaml.parent / root).resolve()
	return (root / split_value).resolve()


def _resolve_label_dir(image_dir: Path) -> Path:
	as_posix = image_dir.as_posix()
	if "/images/" in as_posix:
		return Path(as_posix.replace("/images/", "/labels/"))
	return image_dir.parent.parent / "labels" / image_dir.name


def _gamma_correct_image(src: Path, dst: Path, gamma: float) -> None:
	img = cv2.imread(str(src))
	if img is None:
		raise RuntimeError(f"Failed to read image: {src}")
	inv_gamma = 1.0 / gamma
	lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)], dtype=np.uint8)
	corrected = cv2.LUT(img, lut)
	dst.parent.mkdir(parents=True, exist_ok=True)
	if not cv2.imwrite(str(dst), corrected):
		raise RuntimeError(f"Failed to write gamma image: {dst}")


def _prepare_gamma_dataset(
	env_name: str,
	data_yaml: Path,
	split: str,
	gamma: float,
	cache_root: Path,
) -> Path:
	if abs(gamma - 1.0) < 1e-9:
		return data_yaml

	content = _load_yaml(data_yaml)
	image_dir = _resolve_split_dir(data_yaml, content, split)
	label_dir = _resolve_label_dir(image_dir)
	if not image_dir.exists():
		raise FileNotFoundError(f"Image split dir not found: {image_dir}")
	if not label_dir.exists():
		raise FileNotFoundError(f"Label split dir not found: {label_dir}")

	gamma_tag = _sanitize_float(gamma)
	root = cache_root / env_name / f"gamma_{gamma_tag}"
	images_out = root / "images" / split
	labels_out = root / "labels" / split
	output_yaml = root / "data.yaml"

	if images_out.exists():
		shutil.rmtree(images_out)
	images_out.mkdir(parents=True, exist_ok=True)

	if labels_out.exists() or labels_out.is_symlink():
		labels_out.unlink() if labels_out.is_symlink() else shutil.rmtree(labels_out)
	labels_out.parent.mkdir(parents=True, exist_ok=True)
	labels_out.mkdir(parents=True, exist_ok=True)

	valid_suffixes = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
	image_files = [p for p in sorted(image_dir.iterdir()) if p.suffix.lower() in valid_suffixes]
	if not image_files:
		raise RuntimeError(f"No images found in {image_dir}")

	for src in image_files:
		dst = images_out / src.name
		_gamma_correct_image(src, dst, gamma)

	for src_label in sorted(label_dir.glob("*.txt")):
		dst_label = labels_out / src_label.name
		dst_label.write_text(src_label.read_text(), encoding="utf-8")

	new_yaml: dict[str, Any] = {
		"path": str(root),
		"train": f"images/{split}",
		"val": f"images/{split}",
		"test": f"images/{split}",
	}
	if "names" in content:
		new_yaml["names"] = content["names"]
	if "nc" in content:
		new_yaml["nc"] = content["nc"]

	with output_yaml.open("w", encoding="utf-8") as f:
		yaml.safe_dump(new_yaml, f, sort_keys=False, allow_unicode=False)

	return output_yaml


def _resolve_default_model(script_dir: Path) -> Path:
	candidates = [
		script_dir.parents[2] / "yolo11m.pt",
		script_dir.parents[2] / "yolo11s.pt",
		script_dir.parents[3] / "yolo11m.pt",
	]
	for c in candidates:
		if c.exists():
			return c
	return candidates[0]


def parse_args() -> argparse.Namespace:
	script_dir = Path(__file__).resolve().parent
	parser = argparse.ArgumentParser(description="W&B automated YOLO validation sweep")
	parser.add_argument("--project", default="traffic-intersection-eval")
	parser.add_argument("--model", default=str(_resolve_default_model(script_dir)))
	parser.add_argument("--cross01-data", default=str(script_dir.parent / "yolo_test_cross01" / "data.yaml"))
	parser.add_argument("--cross02-data", default=str(script_dir / "data.yaml"))
	parser.add_argument("--environments", nargs="+", default=["cross_01", "cross_02"])
	parser.add_argument("--iou", nargs="+", type=float, default=[0.45, 0.60, 0.75])
	parser.add_argument("--imgsz", nargs="+", type=int, default=[640, 960, 1280, 1440, 1920])
	parser.add_argument("--conf", nargs="+", type=float, default=[0.25, 0.40, 0.55])
	parser.add_argument("--gamma", nargs="+", type=float, default=[1.0, 1.5])
	parser.add_argument("--split", default="val")
	parser.add_argument("--plots", action="store_true", help="Enable per-run val plots (disabled by default)")
	parser.add_argument("--no-plots", dest="plots", action="store_false", help="Disable per-run val plots")
	parser.set_defaults(plots=False)
	parser.add_argument("--cache-dir", default=str(script_dir / "gamma_cache"))
	return parser.parse_args()


def main() -> None:
	args = parse_args()

	model = YOLO(args.model)
	viewpoint_map = {
		"cross_01": "2nd_floor",
		"cross_02": "4th_floor",
	}
	data_map = {
		"cross_01": Path(args.cross01_data).resolve(),
		"cross_02": Path(args.cross02_data).resolve(),
	}
	cache_root = Path(args.cache_dir).resolve()
	results_csv = Path(__file__).resolve().with_name("results.csv")

	selected_envs = [env.lower() for env in args.environments]
	for env in selected_envs:
		if env not in data_map:
			raise ValueError(f"Unknown environment: {env}. Use cross_01 or cross_02")
		if not data_map[env].exists():
			print(f"Skip {env}: data.yaml not found at {data_map[env]}")

	active_envs = [env for env in selected_envs if data_map[env].exists()]
	if not active_envs:
		raise FileNotFoundError("No valid environment data.yaml found. Please provide --cross01-data / --cross02-data")

	total_runs = len(active_envs) * len(args.gamma) * len(args.imgsz) * len(args.conf) * len(args.iou)
	print(f"Planned runs: {total_runs}")

	for env in active_envs:
		viewpoint = viewpoint_map[env]
		base_data_yaml = data_map[env]

		for gamma in args.gamma:
			eval_data_yaml = _prepare_gamma_dataset(
				env_name=env,
				data_yaml=base_data_yaml,
				split=args.split,
				gamma=gamma,
				cache_root=cache_root,
			)
			illumination = "Raw" if abs(gamma - 1.0) < 1e-9 else f"Gamma_{gamma}"
			dataset_names = _dataset_names_from_yaml(eval_data_yaml)
			allowed_ids = set(dataset_names.keys()) if dataset_names else {0, 1, 2, 3}

			for imgsz in args.imgsz:
				for conf in args.conf:
					for iou in args.iou:
						run_name = (
							f"env_{env}_view_{viewpoint}_gamma{gamma}_"
							f"imgsz{imgsz}_conf{conf}_iou{iou}"
						)
						print(f"\n--- Starting Evaluation: {run_name} ---")

						run = wandb.init(
							project=args.project,
							name=run_name,
							group=f"{env}_{viewpoint}",
							job_type="validation",
							config={
								"environment": env,
								"viewpoint": viewpoint,
								"illumination": illumination,
								"gamma": gamma,
								"imgsz": imgsz,
								"conf": conf,
								"iou": iou,
								"split": args.split,
							},
						)

						try:
							results = model.val(
								data=str(eval_data_yaml),
								imgsz=imgsz,
								conf=conf,
								iou=iou,
								split=args.split,
								plots=args.plots,
								verbose=False,
							)

							metrics = _to_float_dict(getattr(results, "results_dict", {}) or {})
							speed = _to_float_dict(getattr(results, "speed", {}) or {})
							classwise = _classwise_metrics(
								results,
								dataset_names=dataset_names,
								allowed_class_ids=allowed_ids,
							)
							dashboard = _dashboard_metrics(metrics)
							dashboard.update(
								{
									"param/imgsz": float(imgsz),
									"param/conf": float(conf),
									"param/iou": float(iou),
									"param/gamma": float(gamma),
								}
							)

							if metrics:
								wandb.log(metrics)
								run.summary.update(metrics)
							if dashboard:
								wandb.log(dashboard)
								run.summary.update(dashboard)
							if classwise:
								wandb.log(classwise)
								run.summary.update(classwise)
							if speed:
								speed_metrics = {f"speed/{k}": v for k, v in speed.items()}
								wandb.log(speed_metrics)
								run.summary.update(speed_metrics)

							csv_row: dict[str, Any] = {
								"environment": env,
								"viewpoint": viewpoint,
								"illumination": illumination,
								"gamma": gamma,
								"imgsz": imgsz,
								"conf": conf,
								"iou": iou,
								"split": args.split,
							}
							csv_row.update(dashboard)
							csv_row.update(classwise)
							csv_row.update({f"speed_{k}": v for k, v in speed.items()})
							_write_results_csv(results_csv, csv_row)

							print(
								f"Logged {len(metrics)} raw metrics, {len(dashboard)} dashboard metrics, "
								f"{len(classwise)} class-wise metrics, "
								f"and {len(speed)} speed fields to W&B; CSV -> {results_csv.name}"
							)
						finally:
							run.finish()

	print("All automated tests completed. Check your W&B Dashboard!")


if __name__ == "__main__":
	main()
