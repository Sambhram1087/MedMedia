import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CORS_ORIGINS: z.string().default(''),
  ADMIN_EMAILS: z.string().default(''),

  DB_SSL: bool.default('false'),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  RUN_MIGRATIONS: bool.default('true'),
  // Defaults to true in production. Set false ONLY to try the production build over plain http://localhost.
  COOKIE_SECURE: bool.optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  S3_BUCKET: z.string().default(''), // PUBLIC media bucket (images, clips)
  S3_PRIVATE_BUCKET: z.string().default(''), // PRIVATE bucket for credential documents. Must never be public.
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_PUBLIC_BASE_URL: z.string().default(''),

  RATE_LIMIT_PER_MIN: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_PER_15MIN: z.coerce.number().int().default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

const env = parsed.data;

if (env.STORAGE_DRIVER === 's3') {
  const missing = ['S3_BUCKET', 'S3_PRIVATE_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'].filter(
    (k) => !(env as Record<string, unknown>)[k],
  );
  if (missing.length) {
    console.error(`STORAGE_DRIVER=s3 requires: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (env.S3_BUCKET === env.S3_PRIVATE_BUCKET) {
    console.error('S3_BUCKET and S3_PRIVATE_BUCKET must be different buckets, or credential documents could become public.');
    process.exit(1);
  }
}

export const config = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  httpsOnly: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  adminEmails: env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
};
