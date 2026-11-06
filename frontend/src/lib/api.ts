import { API_BASE } from '../config';
import { clearSession, getToken } from './session';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 0, code = 'REQUEST_FAILED', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  formData?: FormData;
  signal?: AbortSignal;
};

function extractMessage(payload: unknown, fallback: string): { message: string; code: string; details?: unknown } {
  const error = (payload as { error?: { message?: string; code?: string; details?: unknown } })?.error;
  if (error?.message) {
    return { message: error.message, code: error.code || 'REQUEST_FAILED', details: error.details };
  }
  return { message: fallback, code: 'REQUEST_FAILED' };
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = true, formData, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload,
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      'Cannot reach Amit right now. Check your internet connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const { message, code, details } = extractMessage(
      data,
      typeof data === 'string' && data ? data : `Request failed (${response.status})`,
    );
    if (response.status === 401 && auth && getToken()) {
      clearSession();
      window.dispatchEvent(new CustomEvent('amit:session-expired'));
    }
    throw new ApiError(message, response.status, code, details);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, options: Omit<Options, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: Omit<Options, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options: Omit<Options, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options: Omit<Options, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown, options: Omit<Options, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'DELETE', body }),
};

export async function uploadFile(file: File): Promise<{ url: string; absoluteUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ url: string; absoluteUrl: string }>('/uploads', {
    method: 'POST',
    formData,
  });
}

export async function downloadWithAuth(path: string, filename: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new ApiError('The report could not be downloaded.', response.status, 'DOWNLOAD_FAILED');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function fetchPrivateImage(path: string): Promise<string> {
  const token = getToken();
  const response = await fetch(
    /^https?:\/\//i.test(path) ? path : `${new URL(API_BASE, window.location.origin).origin}${path}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) throw new ApiError('Image could not be loaded', response.status);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
