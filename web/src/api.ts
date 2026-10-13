import { useInfiniteQuery } from '@tanstack/react-query';
import type { Page } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Please try again.');
  return data as T;
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T,>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T,>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Cursor-paginated list. Pages are fetched on demand, which keeps both the API and the browser light. */
export function useInfinite<T>(key: unknown[], path: string, params: Record<string, string | number | undefined | null> = {}, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<Page<T>>(`${path}${qs({ ...params, cursor: pageParam })}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...query, items };
}

// ---- Uploads ---------------------------------------------------------------
export type UploadPurpose = 'post' | 'clip' | 'avatar' | 'verification';
let uploadConfig: Promise<{ driver: 'local' | 's3'; rules: Record<UploadPurpose, { types: string[]; maxBytes: number }> }> | null = null;

export async function uploadFile(file: File, purpose: UploadPurpose): Promise<{ key: string; url: string | null }> {
  uploadConfig ??= api.get('/api/uploads/config');
  const cfg = await uploadConfig;
  const rule = cfg.rules[purpose];
  if (!rule.types.includes(file.type)) throw new ApiError(400, 'That file type is not supported.');
  if (file.size > rule.maxBytes) throw new ApiError(400, `That file is too large (max ${Math.round(rule.maxBytes / 1048576)} MB).`);

  if (cfg.driver === 's3') {
    const signed = await api.post<{ uploadUrl: string; key: string; url: string | null; headers: Record<string, string> }>(
      '/api/uploads/presign',
      { purpose, contentType: file.type, size: file.size },
    );
    // Straight to the bucket: large videos never pass through the app server.
    const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: file });
    if (!put.ok) throw new ApiError(502, 'Upload failed. Please try again.');
    return { key: signed.key, url: signed.url };
  }
  const form = new FormData();
  form.append('file', file);
  return request('POST', `/api/uploads?purpose=${purpose}`, undefined, form);
}
