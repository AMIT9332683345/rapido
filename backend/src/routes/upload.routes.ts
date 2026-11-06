import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { RiderDocumentModel } from '../models/RiderDocument.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { upload, filePathFor } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';

const router = Router();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.post(
  '/uploads',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw HttpError.badRequest('Choose a file to upload');
    const url = `/api/files/${req.file.filename}`;
    res.status(201).json({
      url,
      absoluteUrl: `${(env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')}${url}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

router.get(
  '/files/:name',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const fullPath = filePathFor(req.params.name);
    if (!fullPath || !fs.existsSync(fullPath)) throw HttpError.notFound('File not found');

    const namePattern = new RegExp(`${escapeRegex(req.params.name)}$`);
    const isDocument = await RiderDocumentModel.exists({
      $or: [{ frontUrl: namePattern }, { backUrl: namePattern }],
    });

    if (isDocument) {
      const auth = req.auth;
      if (!auth) throw HttpError.unauthorized('Sign in to view this document');
      if (auth.role === 'rider') {
        const own = await RiderDocumentModel.exists({
          rider: auth.id,
          $or: [{ frontUrl: namePattern }, { backUrl: namePattern }],
        });
        if (!own) throw HttpError.forbidden('This document belongs to another rider');
      } else if (auth.role !== 'admin') {
        throw HttpError.forbidden('Identity documents are private');
      }
    }

    const ext = path.extname(fullPath).toLowerCase();
    const type =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader(
      'Cache-Control',
      isDocument ? 'private, max-age=3600' : 'public, max-age=604800, immutable',
    );
    res.sendFile(fullPath);
  }),
);

export default router;
