/**
 * Throw from a route handler to short-circuit with a specific status code.
 * The global error handler in src/index.ts converts these to the standard
 * { data: null, error: { message, code } } response shape.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
