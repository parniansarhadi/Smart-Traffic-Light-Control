# Video Processing Pipeline (S3 + YOLO + MongoDB)

This repository processes video files with a YOLO-based pipeline and can read videos from local folders or AWS S3, then optionally upload results to MongoDB Atlas.

Quick start
- Install dependencies: `pip install -r requirements.txt` (Python 3.10+ recommended).
- Prepare environment variables:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (for S3 access)
  - `MONGODB_URI` or `MONGODB_USERNAME` + `MONGODB_PASSWORD` (for Mongo uploads)
  - `YOLO_DEVICE` (optional: `cpu` or `cuda:0`)

Run locally (uses config in `data/<project>/config.json`):
- Example: `python main.py --config-dir data/polito_cross_02 --batch`

Config
- Each project config (`data/<project>/config.json`) supports a `video_source` block:
  - `local_dir`: path to local video files
  - `s3_uri`: optional `s3://bucket/prefix` to use S3 as the source (takes precedence)
  - `aws_region`: optional AWS region for S3

S3 behavior
- When `s3_uri` is set the code will list and download matching objects to a temporary folder and process them as local files.

MongoDB upload
- After processing, JSON output files under `output/` can be uploaded to MongoDB when `--upload-to-mongodb` is used or when `MONGODB_URI` is set.

Docker
- Build: `docker build -t video-pipeline .`
- Run (example):
  `docker run --env-file .env -v $(pwd)/data:/app/data -v $(pwd)/output:/app/output video-pipeline python main.py --config-dir data/polito_cross_02 --batch`

Notes
- This  is a demo for student project ， not a realtime system in production emvironment.
- Credentials are read from environment variables; this repository never stores secrets in files.

