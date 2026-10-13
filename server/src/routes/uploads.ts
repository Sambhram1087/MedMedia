import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import { badRequest, parse } from '../lib/errors';
import { newKey, presignUpload, Purpose, publicUrl, RULES, uploadRoot } from '../lib/storage';
import { requireAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/limits';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const purposeSchema = z.enum(['post', 'clip', 'avatar', 'verification']);

uploadsRouter.get('/config', (_req, res) => {
  res.json({ driver: config.STORAGE_DRIVER, rules: RULES });
});

/** S3 mode: the browser uploads directly to the bucket with this short-lived URL. */
uploadsRouter.post('/presign', uploadLimiter, async (req, res) => {
  if (config.STORAGE_DRIVER !== 's3') throw badRequest('Direct uploads are not enabled. Use POST /api/uploads.');
  const d = parse(z.object({ purpose: purposeSchema, contentType: z.string(), size: z.number().int().positive() }), req.body);
  const rule = RULES[d.purpose];
  if (!rule.types.includes(d.contentType)) throw badRequest(`Unsupported file type. Allowed: ${rule.types.join(', ')}`);
  if (d.size > rule.maxBytes) throw badRequest(`File is too large. Maximum is ${Math.round(rule.maxBytes / 1048576)} MB`);
  const key = newKey(d.purpose, d.contentType);
  const uploadUrl = await presignUpload(key, d.contentType);
  res.json({ uploadUrl, key, url: rule.isPrivate ? null : publicUrl(key), headers: { 'Content-Type': d.contentType } });
});

// ---- Local disk mode ------------------------------------------------------
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 4).toString() === '%PDF',
  'video/mp4': (b) => b.subarray(4, 8).toString() === 'ftyp',
  'video/webm': (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
};

function uploaderFor(purpose: Purpose) {
  const rule = RULES[purpose];
  return multer({
    limits: { fileSize: rule.maxBytes, files: 1 },
    fileFilter: (_req, file, cb) =>
      rule.types.includes(file.mimetype) ? cb(null, true) : cb(badRequest(`Unsupported file type. Allowed: ${rule.types.join(', ')}`)),
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const key = newKey(purpose, file.mimetype);
        (req as any).uploadKey = key;
        const dir = path.join(uploadRoot, path.dirname(key));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, _file, cb) => cb(null, path.basename((req as any).uploadKey)),
    }),
  }).single('file');
}

const uploaders = Object.fromEntries(purposeSchema.options.map((p) => [p, uploaderFor(p)])) as Record<Purpose, ReturnType<typeof uploaderFor>>;

uploadsRouter.post('/', uploadLimiter, (req, res, next) => {
  if (config.STORAGE_DRIVER !== 'local') return next(badRequest('Use /api/uploads/presign with S3 storage.'));
  const purpose = purposeSchema.safeParse(req.query.purpose);
  if (!purpose.success) return next(badRequest('Missing or invalid purpose'));
  uploaders[purpose.data](req, res, (err: unknown) => {
    if (err) {
      if ((err as any).code === 'LIMIT_FILE_SIZE') return next(badRequest('File is too large'));
      return next(err);
    }
    const file = req.file;
    if (!file) return next(badRequest('No file received'));
    const head = Buffer.alloc(16);
    const fd = fs.openSync(file.path, 'r');
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    if (!MAGIC[file.mimetype]?.(head)) {
      fs.unlink(file.path, () => undefined);
      return next(badRequest('The file contents do not match its type'));
    }
    const key = (req as any).uploadKey as string;
    res.status(201).json({ key, url: RULES[purpose.data].isPrivate ? null : publicUrl(key) });
  });
});
