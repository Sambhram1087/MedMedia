import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config';
import { HttpError } from './lib/errors';
import { publicRoot } from './lib/storage';
import { authLimiter, globalLimiter } from './middleware/limits';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { clipsRouter } from './routes/clips';
import { healthRouter } from './routes/health';
import { opportunitiesRouter } from './routes/opportunities';
import { postsRouter } from './routes/posts';
import { searchRouter } from './routes/search';
import { uploadsRouter } from './routes/uploads';
import { usersRouter } from './routes/users';
import { logger } from './logger';

function origin(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

/** Where browsers are allowed to load media from / upload files to. */
function storageOrigins(): string[] {
  if (config.STORAGE_DRIVER !== 's3') return [];
  const out = new Set<string>();
  const cdn = origin(config.S3_PUBLIC_BASE_URL);
  if (cdn) out.add(cdn);
  for (const bucket of [config.S3_BUCKET, config.S3_PRIVATE_BUCKET]) {
    if (config.S3_ENDPOINT) {
      const host = new URL(config.S3_ENDPOINT).host;
      out.add(`https://${host}`); // path-style
      out.add(`https://${bucket}.${host}`); // virtual-hosted style
    } else {
      out.add(`https://${bucket}.s3.${config.S3_REGION}.amazonaws.com`);
    }
  }
  return [...out];
}

export function createApp() {
  const app = express();
  const web = path.resolve(__dirname, '../../web/dist');
  const extra = storageOrigins();

  // Behind Railway/Render/Fly/nginx there is exactly one proxy hop. Needed for rate limiting and secure cookies.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url.startsWith('/media/') },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  // Health check first: no rate limiting, no auth, no DB.
  app.use(healthRouter);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', ...extra],
          mediaSrc: ["'self'", 'blob:', ...extra],
          connectSrc: ["'self'", ...extra],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.httpsOnly ? [] : null,
        },
      },
    }),
  );
  app.use(compression());
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }));

  if (config.STORAGE_DRIVER === 'local') {
    // Only the public/ subfolder is exposed. private/ (credential documents) is never served.
    app.use('/media', express.static(publicRoot, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
  }

  app.use('/api', globalLimiter);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/clips', clipsRouter);
  app.use('/api/opportunities', opportunitiesRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Built web app (same origin as the API, so no CORS and cookies just work).
  if (fs.existsSync(path.join(web, 'index.html'))) {
    app.use('/assets', express.static(path.join(web, 'assets'), { maxAge: '1y', immutable: true, index: false }));
    app.use(express.static(web, { maxAge: '1h', index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      // Missing files and media must be real 404s, not index.html. Only app routes fall back to the SPA.
      if (req.path.startsWith('/media/') || req.path.startsWith('/assets/') || path.extname(req.path)) {
        return void res.status(404).type('text/plain').send('Not found');
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(web, 'index.html'));
    });
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, code: err.code });
    if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Invalid JSON body' });
    if (err?.type === 'entity.too.large') return void res.status(413).json({ error: 'Request body is too large' });
    if (err?.code === '23505') return void res.status(409).json({ error: 'That already exists' });
    if (err?.code === '22P02') return void res.status(400).json({ error: 'Invalid identifier' });
    if (err?.name === 'MulterError') return void res.status(400).json({ error: err.message });
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return app;
}
