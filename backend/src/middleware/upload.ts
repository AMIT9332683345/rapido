import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';

export const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const allowed = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = allowed.get(file.mimetype) ?? path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, WebP images or PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export function filePathFor(name: string): string | null {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/i.test(name)) return null;
  const full = path.join(uploadDir, name);
  if (!full.startsWith(uploadDir)) return null;
  return full;
}
