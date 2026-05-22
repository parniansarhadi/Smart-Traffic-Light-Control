import importlib
from typing import Any


class WandbTracker:
    def __init__(self, project: str, run_name: str | None, config: dict[str, Any]):
        self._wandb = importlib.import_module("wandb")
        self._run = self._wandb.init(project=project, name=run_name, config=config)

    def log(self, payload: dict[str, Any]) -> None:
        self._wandb.log(payload)

    def finish(self) -> None:
        self._run.finish()
