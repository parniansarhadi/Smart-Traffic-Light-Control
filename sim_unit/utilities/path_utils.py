from functools import lru_cache
from pathlib import Path


def _candidate_roots(start: Path):
    current = start
    yield current
    for parent in current.parents:
        yield parent


@lru_cache(maxsize=1)
def find_workspace_root(start_path: str | None = None) -> Path:
    start = Path(start_path or __file__).resolve()
    if start.is_file():
        start = start.parent

    for candidate in _candidate_roots(start):
        config_file = candidate / "input_data" / "sys_config" / "system_param_config.json"
        if config_file.exists():
            return candidate

    raise FileNotFoundError(f"Could not locate workspace root from {start}")


def get_workspace_root(start_path: str | None = None) -> str:
    return str(find_workspace_root(start_path))


def get_sumo_config_dir(start_path: str | None = None) -> str:
    return str(find_workspace_root(start_path) / "sumo_config")


def get_sys_output_dir(start_path: str | None = None) -> str:
    return str(find_workspace_root(start_path) / "sys_output")