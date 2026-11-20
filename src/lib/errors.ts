/** An error that is safe to show to API clients. `code` is a stable machine key (also an i18n key suffix). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const notFound = () => new ApiError(404, 'not_found', 'Not found');
export const forbidden = () => new ApiError(403, 'forbidden', 'Forbidden');
