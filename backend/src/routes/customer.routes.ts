import { Router } from 'express';
import { z } from 'zod';
import { BookingModel } from '../models/Booking.js';
import { SavedLocationModel } from '../models/SavedLocation.js';
import { UserModel } from '../models/User.js';
import { ACTIVE_RIDE_STATUSES } from '../models/enums.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { isValidLatLng, toGeoPoint } from '../utils/geo.js';
import {
  activeBookingForCustomer,
  cancelBooking,
  createBooking,
  getBookingForActor,
  pushBookingState,
} from '../services/bookingService.js';
import { populateBooking, serializeBooking } from '../services/serializers.js';

const router = Router();
router.use(authenticate, requireRole('customer'));

const placeSchema = z.object({
  label: z.string().trim().min(1, 'Choose a pickup and destination').max(140),
  address: z.string().trim().max(240).optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.auth!.id).lean();
    if (!user) throw HttpError.unauthorized();
    const [rides, completed, active] = await Promise.all([
      BookingModel.countDocuments({ customer: user._id }),
      BookingModel.countDocuments({ customer: user._id, status: 'COMPLETED' }),
      BookingModel.countDocuments({
        customer: user._id,
        status: { $in: ACTIVE_RIDE_STATUSES },
      }),
    ]);
    res.json({
      id: String(user._id),
      name: user.name,
      mobile: user.mobile,
      photoUrl: user.photoUrl ?? null,
      createdAt: user.createdAt,
      stats: { rides, completed, active },
    });
  }),
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        photoUrl: z.string().trim().max(500).nullable().optional(),
      })
      .parse(req.body);

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.photoUrl !== undefined) update.photoUrl = body.photoUrl || null;

    const user = await UserModel.findByIdAndUpdate(req.auth!.id, { $set: update }, { new: true });
    if (!user) throw HttpError.unauthorized();
    res.json({
      id: String(user._id),
      name: user.name,
      mobile: user.mobile,
      photoUrl: user.photoUrl ?? null,
    });
  }),
);

router.get(
  '/saved-locations',
  asyncHandler(async (req, res) => {
    const places = await SavedLocationModel.find({ customer: req.auth!.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(
      places.map((place) => ({
        id: String(place._id),
        label: place.label,
        address: place.address ?? null,
        lat: place.location!.coordinates[1],
        lng: place.location!.coordinates[0],
      })),
    );
  }),
);

router.post(
  '/saved-locations',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        label: z.string().trim().min(1).max(40),
        address: z.string().trim().max(240).optional().nullable(),
        lat: z.number(),
        lng: z.number(),
      })
      .parse(req.body);

    if (!isValidLatLng(body.lat, body.lng)) {
      throw HttpError.badRequest('Invalid saved location coordinates');
    }

    const place = await SavedLocationModel.findOneAndUpdate(
      { customer: req.auth!.id, label: body.label },
      {
        $set: {
          address: body.address || null,
          location: toGeoPoint(body.lat, body.lng),
        },
        $setOnInsert: { customer: req.auth!.id },
      },
      { new: true, upsert: true },
    );

    res.status(201).json({
      id: String(place._id),
      label: place.label,
      address: place.address ?? null,
      lat: place.location!.coordinates[1],
      lng: place.location!.coordinates[0],
    });
  }),
);

router.delete(
  '/saved-locations/:id',
  asyncHandler(async (req, res) => {
    const result = await SavedLocationModel.deleteOne({
      _id: req.params.id,
      customer: req.auth!.id,
    });
    if (!result.deletedCount) throw HttpError.notFound('Saved location not found');
    res.json({ ok: true });
  }),
);

router.get(
  '/bookings/active',
  asyncHandler(async (req, res) => {
    const booking = await activeBookingForCustomer(req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings',
  bookingLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        pickup: placeSchema,
        destination: placeSchema,
        note: z.string().trim().max(300).optional().nullable(),
      })
      .parse(req.body);

    if (body.pickup.lat === body.destination.lat && body.pickup.lng === body.destination.lng) {
      throw HttpError.badRequest('Pickup and destination cannot be the same');
    }

    const booking = await createBooking({
      customerId: req.auth!.id,
      pickup: body.pickup,
      destination: body.destination,
      note: body.note,
    });
    res.status(201).json({ booking });
  }),
);

router.get(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    const booking = await getBookingForActor(req.params.id, 'customer', req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings/:id/cancel',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ reason: z.string().trim().max(300).optional() })
      .parse(req.body ?? {});
    const booking = await cancelBooking(req.params.id, {
      role: 'customer',
      id: req.auth!.id,
      reason: body.reason,
    });
    res.json({ booking });
  }),
);

router.get(
  '/rides',
  asyncHandler(async (req, res) => {
    const filter = z
      .enum(['all', 'active', 'completed', 'cancelled'])
      .catch('all')
      .parse(req.query.filter);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const query: Record<string, unknown> = { customer: req.auth!.id };
    if (filter === 'active') query.status = { $in: ACTIVE_RIDE_STATUSES };
    if (filter === 'completed') query.status = 'COMPLETED';
    if (filter === 'cancelled') query.status = { $in: ['CANCELLED', 'EXPIRED'] };

    const [total, bookings] = await Promise.all([
      BookingModel.countDocuments(query),
      populateBooking(
        BookingModel.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
      ),
    ]);

    const rides = await Promise.all(bookings.map((b) => serializeBooking(b, 'customer')));
    res.json({ rides, total, page, pages: Math.ceil(total / limit) || 1 });
  }),
);

export default router;
