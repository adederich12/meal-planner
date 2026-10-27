import type { z } from 'zod';
import { ApiErrorSchema } from '@meal-planner/shared';

/** Thrown for any failed API call. Carries the server's error code when available. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientOptions {
  /** Empty in the browser (same origin); set to an absolute URL in tests. */
  baseUrl?: string;
}

export function createApiClient({ baseUrl = '' }: ApiClientOptions = {}) {
  async function request<T extends z.ZodType>(
    schema: T,
    path: string,
    init?: RequestInit,
  ): Promise<z.infer<T>> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
    const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(body);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiRequestError(message, res.status, code, details);
      }
      throw new ApiRequestError(
        `Request failed with status ${res.status}`,
        res.status,
        'HTTP_ERROR',
      );
    }

    // Validate responses at the boundary, so a contract mismatch fails loudly here.
    return schema.parse(body);
  }

  const withJson = (method: string, json: unknown): RequestInit =>
    json === undefined
      ? { method }
      : { method, body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } };

  return {
    get: <T extends z.ZodType>(schema: T, path: string) => request(schema, path),
    post: <T extends z.ZodType>(schema: T, path: string, json?: unknown) =>
      request(schema, path, withJson('POST', json)),
    patch: <T extends z.ZodType>(schema: T, path: string, json: unknown) =>
      request(schema, path, withJson('PATCH', json)),
    del: <T extends z.ZodType>(schema: T, path: string) =>
      request(schema, path, { method: 'DELETE' }),
    /** multipart/form-data upload. The browser sets the Content-Type boundary itself. */
    postForm: <T extends z.ZodType>(schema: T, path: string, form: FormData) =>
      request(schema, path, { method: 'POST', body: form }),
    /** For links the browser loads directly (PDF previews, downloads). */
    url: (path: string) => `${baseUrl}${path}`,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const apiClient = createApiClient();
