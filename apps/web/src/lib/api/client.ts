const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured');
}

interface BackendErrorBody {
  message?: string | string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function safeErrorMessage(status: number, body: BackendErrorBody | null): string {
  if (Array.isArray(body?.message)) {
    return body.message.join('. ');
  }
  if (typeof body?.message === 'string') {
    return body.message;
  }
  if (status >= 500) {
    return 'The service is temporarily unavailable. Please try again.';
  }
  return 'Your request could not be completed. Please try again.';
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let body: BackendErrorBody | null = null;
    try {
      body = (await response.json()) as BackendErrorBody;
    } catch {
      // A safe generic message is used for non-JSON errors.
    }
    throw new ApiError(response.status, safeErrorMessage(response.status, body));
  }

  return (await response.json()) as T;
}
