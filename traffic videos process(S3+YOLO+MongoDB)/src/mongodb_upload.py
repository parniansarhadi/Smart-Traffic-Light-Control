import argparse
import importlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus


MONGODB_HOST = "cluster0.epb2tkz.mongodb.net"
MONGODB_OPTIONS = "?appName=Cluster0"
DEFAULT_PASSWORD = "admin"
AVAILABLE_USERS = ("user_1", "user_2")


def create_mongo_client(uri: str):
	"""Create MongoDB client with a helpful message if dependency is missing."""
	try:
		pymongo_module = importlib.import_module("pymongo")
		server_api_module = importlib.import_module("pymongo.server_api")
	except ModuleNotFoundError as exc:
		raise RuntimeError(
			"Missing dependency: pymongo. Install with: pip install \"pymongo[srv]\""
		) from exc

	mongo_client_cls = getattr(pymongo_module, "MongoClient")
	server_api_cls = getattr(server_api_module, "ServerApi")
	return mongo_client_cls(uri, server_api=server_api_cls("1"))


def build_mongodb_uri(username: str, password: str) -> str:
	"""Build SRV URI and safely URL-encode credentials."""
	safe_user = quote_plus(username)
	safe_password = quote_plus(password)
	return (
		f"mongodb+srv://{safe_user}:{safe_password}@{MONGODB_HOST}/{MONGODB_OPTIONS}"
	)


def choose_username(cli_username: str | None) -> str:
	if cli_username:
		if cli_username not in AVAILABLE_USERS:
			raise ValueError(
				f"Invalid username: {cli_username}. Expected one of {AVAILABLE_USERS}."
			)
		return cli_username

	print("Choose MongoDB username:")
	for idx, user in enumerate(AVAILABLE_USERS, start=1):
		print(f"  {idx}. {user}")

	while True:
		choice = input("Enter number (1-2): ").strip()
		if choice in {"1", "2"}:
			return AVAILABLE_USERS[int(choice) - 1]
		print("Invalid choice, please enter 1 or 2.")


def discover_json_files(directory: Path) -> list[Path]:
	if not directory.exists() or not directory.is_dir():
		return []
	return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == ".json")


def choose_json_file(cli_file: str | None, default_dir: Path) -> Path:
	if cli_file:
		path = Path(cli_file).expanduser().resolve()
		if not path.exists() or not path.is_file() or path.suffix.lower() != ".json":
			raise FileNotFoundError(f"Invalid JSON file: {path}")
		return path

	candidates = discover_json_files(default_dir)
	if not candidates:
		raise FileNotFoundError(f"No JSON files found in: {default_dir}")

	print("\nSelect the JSON file to upload (manual upload mode):")
	for idx, path in enumerate(candidates, start=1):
		size_kb = path.stat().st_size / 1024.0
		print(f"  {idx}. {path.name} ({size_kb:.1f} KB)")

	while True:
		choice = input(f"Enter number (1-{len(candidates)}): ").strip()
		if choice.isdigit():
			i = int(choice)
			if 1 <= i <= len(candidates):
				return candidates[i - 1]
		print("Invalid choice, try again.")


def load_json_file(path: Path) -> object:
	with path.open("r", encoding="utf-8") as f:
		return json.load(f)


def print_payload_preview(payload: object) -> None:
	print("\nSelected JSON preview:")
	if isinstance(payload, dict):
		keys = list(payload.keys())
		print(f"  type: dict, top-level keys: {len(keys)}")
		print(f"  first keys: {keys[:10]}")
	elif isinstance(payload, list):
		print(f"  type: list, length: {len(payload)}")
		if payload:
			print(f"  first item type: {type(payload[0]).__name__}")
	else:
		print(f"  type: {type(payload).__name__}")


def require_upload_confirmation(path: Path) -> None:
	print("\nSafety confirmation")
	print(f"You are about to upload: {path}")
	print("Only upload validated, complete results.")
	answer = input("Type YES to continue: ").strip()
	if answer != "YES":
		raise RuntimeError("Upload cancelled by user.")


def main() -> None:
	project_root = Path(__file__).resolve().parents[1]
	default_output_dir = project_root / "output"

	parser = argparse.ArgumentParser(
		description="Manual JSON uploader to MongoDB (only uploads after explicit confirmation)."
	)
	parser.add_argument("--username", help="MongoDB username: user_1 or user_2")
	parser.add_argument(
		"--password",
		default=DEFAULT_PASSWORD,
		help="MongoDB password (default: admin)",
	)
	parser.add_argument("--file", help="Absolute/relative path of JSON file to upload")
	parser.add_argument(
		"--db",
		default="traffic_results",
		help="Target database name (default: traffic_results)",
	)
	parser.add_argument(
		"--collection",
		default="approved_uploads",
		help="Target collection name (default: approved_uploads)",
	)
	args = parser.parse_args()

	username = choose_username(args.username)
	json_file = choose_json_file(args.file, default_output_dir)
	payload = load_json_file(json_file)
	print_payload_preview(payload)
	require_upload_confirmation(json_file)

	uri = build_mongodb_uri(username, args.password)
	client = create_mongo_client(uri)

	try:
		client.admin.command("ping")
		print("\nMongoDB ping success.")

		document = {
			"source_file": str(json_file),
			"uploaded_at_utc": datetime.now(timezone.utc).isoformat(),
			"uploader_username": username,
			"status": "approved_manual_upload",
			"payload": payload,
		}

		result = client[args.db][args.collection].insert_one(document)
		print(f"Upload success. Inserted _id: {result.inserted_id}")
		print(f"Saved to: {args.db}.{args.collection}")
	finally:
		client.close()


if __name__ == "__main__":
	main()
