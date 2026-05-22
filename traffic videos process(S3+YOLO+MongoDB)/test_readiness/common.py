from pathlib import Path
from typing import Any


def resolve_path(path_str: str, project_root: Path) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path
    return (project_root / path).resolve()


def parse_list(raw: str, cast_fn):
    values = []
    for token in str(raw).split(","):
        item = token.strip()
        if item:
            values.append(cast_fn(item))
    if not values:
        raise ValueError(f"Invalid list value: {raw}")
    return values


def safe_metric(metrics_obj: Any, attr_name: str):
    value = getattr(metrics_obj, attr_name, None)
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None
