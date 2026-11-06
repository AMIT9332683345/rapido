import type { RequestHandler } from 'express';
import { AdminModel } from '../models/Admin.js';
import { RiderModel } from '../models/Rider.js';
import { UserModel } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { verifyAccessToken, type Role } from '../utils/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { id: string; role: Role };
    }
  }
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw HttpError.unauthorized();
    }
    const payload = verifyAccessToken(header.slice(7));

    if (payload.role === 'customer') {
      const user = await UserModel.findById(payload.sub).select('isBlocked').lean();
      if (!user) throw HttpError.unauthorized('Account not found');
      if (user.isBlocked) throw HttpError.forbidden('This account is blocked. Contact support.');
    } else if (payload.role === 'rider') {
      const rider = await RiderModel.findById(payload.sub).select('status').lean();
      if (!rider) throw HttpError.unauthorized('Rider account not found');
    } else if (payload.role === 'admin') {
      const admin = await AdminModel.findById(payload.sub).select('_id').lean();
      if (!admin) throw HttpError.unauthorized('Admin account not found');
    } else {
      throw HttpError.unauthorized('Unknown role');
    }

    req.auth = { id: payload.sub, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.auth = { id: payload.sub, role: payload.role };
  } catch {
    // Invalid tokens are treated as anonymous; private routes still reject them.
  }
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(HttpError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(HttpError.forbidden());
    return next();
  };

export const requireApprovedRider: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth || req.auth.role !== 'rider') throw HttpError.unauthorized();
    const rider = await RiderModel.findById(req.auth.id).select('status').lean();
    if (!rider) throw HttpError.unauthorized();
    if (rider.status !== 'approved') {
      throw HttpError.forbidden('Your rider account must be approved before doing this');
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function requireSelf(paramName = 'id'): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(HttpError.unauthorized());
    if (req.auth.role === 'admin') return next();
    if (String(req.params[paramName]) !== req.auth.id) return next(HttpError.forbidden());
    return next();
  };
}
