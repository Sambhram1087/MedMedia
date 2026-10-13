import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

export type Purpose = 'post' | 'clip' | 'avatar' | 'verification';

const IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO = ['video/mp4', 'video/webm'];

export const RULES: Record<Purpose, { types: string[]; maxBytes: number; isPrivate: boolean }> = {
  post: { types: IMAGE, maxBytes: 8 * 1024 * 1024, isPrivate: false },
  avatar: { types: IMAGE, maxBytes: 3 * 1024 * 1024, isPrivate: false },
  clip: { types: VIDEO, maxBytes: 80 * 1024 * 1024, isPrivate: false },
  // Credential documents are never publicly reachable.
  verification: { types: [...IMAGE, 'application/pdf'], maxBytes: 10 * 1024 * 1024, isPrivate: true },
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf',
};

export function newKey(purpose: Purpose, contentType: string): string {
  const prefix = RULES[purpose].isPrivate ? 'private' : 'public';
  const day = new Date().toISOString().slice(0, 10);
  return `${prefix}/${purpose}/${day}/${crypto.randomUUID()}.${EXT[contentType] ?? 'bin'}`;
}

export const uploadRoot = path.resolve(config.UPLOAD_DIR);
export const publicRoot = path.join(uploadRoot, 'public');
export const privateRoot = path.join(uploadRoot, 'private');

if (config.STORAGE_DRIVER === 'local') {
  fs.mkdirSync(publicRoot, { recursive: true });
  fs.mkdirSync(privateRoot, { recursive: true });
}

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: !!config.S3_ENDPOINT,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    });
  }
  return s3;
}

/** Credential documents live in their own bucket so enabling public access for media can never expose them. */
const bucketFor = (key: string) => (key.startsWith('private/') ? config.S3_PRIVATE_BUCKET : config.S3_BUCKET);

/** URL a browser can use to read a public object. */
export function publicUrl(key: string): string {
  if (config.STORAGE_DRIVER === 's3') return `${config.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  return `/media/${key.replace(/^public\//, '')}`;
}

/** Browser uploads straight to the bucket, so large videos never pass through Node. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucketFor(key), Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
}

export async function presignPrivateRead(key: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: config.S3_PRIVATE_BUCKET, Key: key }), { expiresIn: 120 });
}

/** Only keys we minted ourselves are accepted back from the client. */
export function isValidKey(key: string, purpose: Purpose): boolean {
  const prefix = RULES[purpose].isPrivate ? 'private' : 'public';
  return new RegExp(`^${prefix}/${purpose}/\\d{4}-\\d{2}-\\d{2}/[0-9a-f-]{36}\\.[a-z0-9]+$`).test(key);
}
