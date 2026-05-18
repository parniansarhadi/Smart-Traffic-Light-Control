
import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  success: true;
  data: T;
  timestamp: number;
};

export type ApiError = {
  success: false;
  error: string;
  code?: string;
  timestamp: number;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function successResponse<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: Date.now(),
    },
    { status: 200 }
  );
}

export function clientErrorResponse(
  error: string,
  code: string = "CLIENT_ERROR",
  status: number = 400
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      timestamp: Date.now(),
    },
    { status }
  );
}

export function serverErrorResponse(
  error: string,
  code: string = "SERVER_ERROR"
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      timestamp: Date.now(),
    },
    { status: 500 }
  );
}

export function notFoundResponse(
  resource: string = "Resource"
): NextResponse<ApiError> {
  return clientErrorResponse(`${resource} not found`, "NOT_FOUND", 404);
}

export async function tryCatch<T>(
  handler: () => Promise<NextResponse<T> | NextResponse<ApiError>>,
  fallbackMessage: string = "An error occurred"
): Promise<NextResponse<ApiError | T>> {
  try {
    return await handler();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : (String(err) ?? fallbackMessage);
    return serverErrorResponse(message, "INTERNAL_ERROR");
  }
}
