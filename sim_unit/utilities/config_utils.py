"""Utilities for safe configuration parameter extraction and type conversions."""


def safe_int(value, default=0):

    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_float(value, default=0.0):

    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_bool(value, default=False):
    
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("true", "yes", "1", "on")
    try:
        return bool(int(value))
    except (ValueError, TypeError):
        return default


def safe_str(value, default=""):

    try:
        return str(value) if value is not None else default
    except Exception:
        return default


def extract_config_value(config, key, value_type=str, default=None):

    if key not in config:
        return default
    
    value = config[key]
    
    if value_type == int:
        return safe_int(value, default if default is not None else 0)
    elif value_type == float:
        return safe_float(value, default if default is not None else 0.0)
    elif value_type == bool:
        return safe_bool(value, default if default is not None else False)
    elif value_type == dict:
        return value if isinstance(value, dict) else (default if default is not None else {})
    else:
        return safe_str(value, default if default is not None else "")


def extract_config_params(config, param_schema):

    result = {}
    for param_name, (param_type, default) in param_schema.items():
        result[param_name] = extract_config_value(config, param_name, param_type, default)
    return result


def get_nested_value(config, path, default=None):

    parts = path.split(".")
    current = config
    
    for part in parts:
        if isinstance(current, dict):
            if part in current:
                current = current[part]
            else:
                return default
        elif isinstance(current, list):
            try:
                idx = int(part)
                current = current[idx]
            except (ValueError, IndexError):
                return default
        else:
            return default
    
    return current
