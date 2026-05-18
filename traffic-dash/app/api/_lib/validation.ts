

export type ValidatorResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

export function parseJson<T>(
  json: unknown,
  schema?: (data: unknown) => T
): ValidatorResult<T> {
  if (json === null || json === undefined) {
    return { valid: false, error: "Data is null or undefined" };
  }

  if (schema) {
    try {
      const validated = schema(json);
      return { valid: true, data: validated };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Validation failed";
      return { valid: false, error: message };
    }
  }

  return { valid: true, data: json as T };
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function requireString(
  obj: Record<string, unknown>,
  key: string
): ValidatorResult<string> {
  const value = obj[key];
  if (!isString(value)) {
    return { valid: false, error: `${key} must be a string` };
  }
  return { valid: true, data: value };
}

export function requireNumber(
  obj: Record<string, unknown>,
  key: string
): ValidatorResult<number> {
  const value = obj[key];
  if (!isNumber(value)) {
    return { valid: false, error: `${key} must be a number` };
  }
  return { valid: true, data: value };
}

export function optionalString(
  obj: Record<string, unknown>,
  key: string,
  defaultValue?: string
): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return isString(value) ? value : defaultValue;
}

export function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
  defaultValue?: number
): number | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return isNumber(value) ? value : defaultValue;
}

export function validateEnum<T extends string | number>(
  value: unknown,
  allowed: readonly T[]
): ValidatorResult<T> {
  if (!allowed.includes(value as T)) {
    return {
      valid: false,
      error: `Value must be one of: ${allowed.join(", ")}`,
    };
  }
  return { valid: true, data: value as T };
}

export function validateArrayItems<T>(
  value: unknown,
  validator: (item: unknown) => ValidatorResult<T>
): ValidatorResult<T[]> {
  if (!isArray(value)) {
    return { valid: false, error: "Value must be an array" };
  }

  const results: T[] = [];
  for (let i = 0; i < value.length; i++) {
    const result = validator(value[i]);
    if (!result.valid) {
      return {
        valid: false,
        error: `Array item ${i}: ${(result as { valid: false; error: string }).error}`,
      };
    }
    results.push(result.data);
  }

  return { valid: true, data: results };
}
