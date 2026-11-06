import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AdminModel } from '../models/Admin.js';
import { RiderModel } from '../models/Rider.js';
import { UserModel } from '../models/User.js';
import { VehicleModel } from '../models/Vehicle.js';
import { RiderDocumentModel } from '../models/RiderDocument.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { normalizeMobile } from '../utils/phone.js';
import { signAccessToken } from '../utils/jwt.js';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long');

const loginSchema = z.object({
  mobile: z.string().min(10, 'Enter your mobile number'),
  password: z.string().min(1, 'Enter your password'),
});

router.post(
  '/customer/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2, 'Enter your name').max(80),
        mobile: z.string().min(10),
        password: passwordSchema,
      })
      .parse(req.body);

    const mobile = normalizeMobile(body.mobile);
    const exists = await UserModel.exists({ mobile });
    if (exists) {
      throw HttpError.conflict(
        'An account with this mobile number already exists. Sign in instead.',
        'MOBILE_EXISTS',
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 11);
    const user = await UserModel.create({
      name: body.name,
      mobile,
      passwordHash,
      lastLoginAt: new Date(),
    });

    const token = signAccessToken({ sub: String(user._id), role: 'customer' });
    res.status(201).json({
      token,
      role: 'customer',
      user: {
        id: String(user._id),
        name: user.name,
        mobile: user.mobile,
        photoUrl: user.photoUrl ?? null,
      },
    });
  }),
);

router.post(
  '/customer/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const mobile = normalizeMobile(body.mobile);
    const user = await UserModel.findOne({ mobile }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw HttpError.unauthorized('Invalid mobile number or password');
    }
    if (user.isBlocked) {
      throw HttpError.forbidden('This account is blocked. Please contact support.');
    }
    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      token: signAccessToken({ sub: String(user._id), role: 'customer' }),
      role: 'customer',
      user: {
        id: String(user._id),
        name: user.name,
        mobile: user.mobile,
        photoUrl: user.photoUrl ?? null,
      },
    });
  }),
);

router.post(
  '/rider/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2, 'Enter your name').max(80),
        mobile: z.string().min(10),
        password: passwordSchema,
        vehicle: z.object({
          type: z.enum(['bike', 'scooter']).default('bike'),
          make: z.string().trim().min(2, 'Enter the vehicle make').max(60),
          model: z.string().trim().min(1, 'Enter the vehicle model').max(60),
          registrationNumber: z
            .string()
            .trim()
            .min(4, 'Enter the registration number')
            .max(16)
            .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
          color: z.string().trim().max(30).optional(),
          year: z.coerce.number().int().min(1980).max(2100).optional(),
        }),
      })
      .parse(req.body);

    const mobile = normalizeMobile(body.mobile);
    const [mobileExists, vehicleExists] = await Promise.all([
      RiderModel.exists({ mobile }),
      VehicleModel.exists({ registrationNumber: body.vehicle.registrationNumber }),
    ]);
    if (mobileExists) {
      throw HttpError.conflict(
        'A rider account with this mobile number already exists.',
        'MOBILE_EXISTS',
      );
    }
    if (vehicleExists) {
      throw HttpError.conflict(
        'This vehicle registration number is already registered.',
        'VEHICLE_EXISTS',
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 11);
    const rider = await RiderModel.create({
      name: body.name,
      mobile,
      passwordHash,
      status: 'pending',
      lastLoginAt: new Date(),
    });

    try {
      await VehicleModel.create({
        rider: rider._id,
        type: body.vehicle.type,
        make: body.vehicle.make,
        model: body.vehicle.model,
        registrationNumber: body.vehicle.registrationNumber,
        color: body.vehicle.color || null,
        year: body.vehicle.year || null,
      });
    } catch (error) {
      await RiderModel.deleteOne({ _id: rider._id });
      throw error;
    }

    res.status(201).json({
      token: signAccessToken({ sub: String(rider._id), role: 'rider' }),
      role: 'rider',
      user: {
        id: String(rider._id),
        name: rider.name,
        mobile: rider.mobile,
        photoUrl: rider.photoUrl ?? null,
        status: rider.status,
        isOnline: false,
        rating: rider.rating,
        totalRides: rider.totalRides,
        needsApproval: true,
      },
    });
  }),
);

router.post(
  '/rider/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const mobile = normalizeMobile(body.mobile);
    const rider = await RiderModel.findOne({ mobile }).select('+passwordHash');
    if (!rider || !(await bcrypt.compare(body.password, rider.passwordHash))) {
      throw HttpError.unauthorized('Invalid mobile number or password');
    }
    rider.lastLoginAt = new Date();
    await rider.save();

    res.json({
      token: signAccessToken({ sub: String(rider._id), role: 'rider' }),
      role: 'rider',
      user: {
        id: String(rider._id),
        name: rider.name,
        mobile: rider.mobile,
        photoUrl: rider.photoUrl ?? null,
        status: rider.status,
        isOnline: rider.isOnline,
        rating: rider.rating,
        totalRides: rider.totalRides,
        needsApproval: rider.status !== 'approved',
      },
    });
  }),
);

router.post(
  '/admin/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const mobile = normalizeMobile(body.mobile);
    const admin = await AdminModel.findOne({ mobile }).select('+passwordHash');
    if (!admin || !(await bcrypt.compare(body.password, admin.passwordHash))) {
      throw HttpError.unauthorized('Invalid admin credentials');
    }
    admin.lastLoginAt = new Date();
    await admin.save();

    res.json({
      token: signAccessToken({ sub: String(admin._id), role: 'admin' }),
      role: 'admin',
      user: {
        id: String(admin._id),
        name: admin.name,
        mobile: admin.mobile,
      },
    });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === 'customer') {
      const user = await UserModel.findById(auth.id).lean();
      if (!user) throw HttpError.unauthorized();
      res.json({
        role: 'customer',
        user: {
          id: String(user._id),
          name: user.name,
          mobile: user.mobile,
          photoUrl: user.photoUrl ?? null,
          isBlocked: user.isBlocked,
        },
      });
      return;
    }
    if (auth.role === 'rider') {
      const rider = await RiderModel.findById(auth.id).lean();
      if (!rider) throw HttpError.unauthorized();
      const [vehicle, documents] = await Promise.all([
        VehicleModel.findOne({ rider: auth.id }).lean(),
        RiderDocumentModel.find({ rider: auth.id })
          .select('kind number frontUrl backUrl status note reviewedAt updatedAt')
          .lean(),
      ]);
      res.json({
        role: 'rider',
        user: {
          id: String(rider._id),
          name: rider.name,
          mobile: rider.mobile,
          photoUrl: rider.photoUrl ?? null,
          status: rider.status,
          rejectionReason: rider.rejectionReason ?? null,
          suspendedReason: rider.suspendedReason ?? null,
          isOnline: rider.isOnline,
          rating: rider.rating,
          ratingCount: rider.ratingCount,
          totalRides: rider.totalRides,
          totalEarnings: rider.totalEarnings,
          needsApproval: rider.status !== 'approved',
          vehicle: vehicle
            ? {
                type: vehicle.type,
                make: vehicle.make,
                model: vehicle.model,
                registrationNumber: vehicle.registrationNumber,
                color: vehicle.color ?? null,
                year: vehicle.year ?? null,
                photoUrl: vehicle.photoUrl ?? null,
              }
            : null,
          documents: documents.map((doc) => ({
            id: String(doc._id),
            kind: doc.kind,
            number: doc.number,
            frontUrl: doc.frontUrl,
            backUrl: doc.backUrl,
            status: doc.status,
            note: doc.note,
            updatedAt: doc.updatedAt,
          })),
        },
      });
      return;
    }

    const admin = await AdminModel.findById(auth.id).lean();
    if (!admin) throw HttpError.unauthorized();
    res.json({
      role: 'admin',
      user: { id: String(admin._id), name: admin.name, mobile: admin.mobile },
    });
  }),
);

export default router;
