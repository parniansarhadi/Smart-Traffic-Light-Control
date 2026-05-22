from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse


VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".MOV", ".h264"}


def is_s3_uri(location: str) -> bool:
	return str(location).startswith("s3://")


def _safe_slug(value: str, default: str = "s3") -> str:
	text = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower())
	text = text.strip("_")
	return text or default


def _parse_s3_uri(s3_uri: str) -> tuple[str, str]:
	parsed = urlparse(s3_uri)
	if parsed.scheme != "s3" or not parsed.netloc:
		raise ValueError(f"Invalid S3 URI: {s3_uri}")
	return parsed.netloc, parsed.path.lstrip("/")


def _create_s3_client():
	try:
		import boto3
	except ModuleNotFoundError as exc:
		raise RuntimeError(
			'Missing dependency: boto3. Install with: pip install boto3'
		) from exc

	region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
	client_kwargs = {}
	if region:
		client_kwargs["region_name"] = region
	return boto3.client("s3", **client_kwargs)


def _is_video_file(name: str) -> bool:
	return Path(name).suffix in VIDEO_EXTENSIONS


def _should_skip_video(name: str) -> bool:
	return Path(name).name == "2026-04-11T08:29:30Z.mp4"


def discover_videos(location: str, project_root: str) -> list[str]:
	if is_s3_uri(location):
		return download_s3_videos(location)

	video_dir = Path(location).expanduser()
	if not video_dir.is_absolute():
		video_dir = Path(project_root) / video_dir
	if not video_dir.is_dir():
		return []

	videos = []
	for entry in sorted(video_dir.iterdir()):
		if entry.is_file() and _is_video_file(entry.name) and not _should_skip_video(entry.name):
			videos.append(str(entry))
	return videos


def download_s3_videos(s3_uri: str) -> list[str]:
	bucket, prefix = _parse_s3_uri(s3_uri)
	client = _create_s3_client()
	download_root = Path(
		tempfile.mkdtemp(prefix=f"video_process_aws_{_safe_slug(bucket)}_{_safe_slug(prefix)}_")
	)

	video_paths: list[str] = []
	paginator = client.get_paginator("list_objects_v2")
	for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
		for item in page.get("Contents", []):
			key = item.get("Key", "")
			if not key or key.endswith("/"):
				continue
			name = Path(key).name
			if not _is_video_file(name) or _should_skip_video(name):
				continue
			destination = download_root / name
			client.download_file(bucket, key, str(destination))
			video_paths.append(str(destination))

	return sorted(video_paths)