import json
import os


def load_json(path, default=None):
    if not os.path.exists(path):
        return {} if default is None else default
    with open(path, "r") as f:
        return json.load(f)


def write_json(path, payload, indent=2):
    with open(path, "w") as f:
        json.dump(payload, f, indent=indent)