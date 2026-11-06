import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { isProd } from '../config/env.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message || 'Invalid request data',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large. Maximum size is 5 MB.'
            : error.message,
      },
    });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: Object.values(error.errors)[0]?.message || 'Invalid data',
      },
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'The provided identifier is invalid' },
    });
    return;
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? {})[0] ?? 'field';
    res.status(409).json({
      error: {
        code: 'DUPLICATE',
        message:
          field === 'mobile'
            ? 'An account with this mobile number already exists'
            : `${field} already exists`,
      },
    });
    return;
  }

  console.error('[error]', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Something went wrong on our side' : String(error?.message ?? error),
    },
  });
};
