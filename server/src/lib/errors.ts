import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m, 'bad_request');
export const unauthorized = (m = 'Please sign in to continue') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first.path.length ? `${first.path.join('.')}: ` : '';
    throw new HttpError(400, `${where}${first.message}`, 'validation_error');
  }
  return result.data;
}
