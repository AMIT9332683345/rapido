import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { BookingModel } from '../models/Booking.js';
import { RiderModel } from '../models/Rider.js';
import { RiderDocumentModel } from '../models/RiderDocument.js';
import { VehicleModel } from '../models/Vehicle.js';
import { ACTIVE_RIDE_STATUSES, DOCUMENT_KINDS } from '../models/enums.js';
import { authenticate, requireApprovedRider, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { isValidLatLng } from '../utils/geo.js';
import { IST_TIMEZONE, startOfIstDay } from '../utils/ist.js';
import {
  acceptBooking,
  activeBookingForRider,
  cancelBooking,
  completeBooking,
  currentOfferForRider,
  getBookingForActor,
  handleRiderLocation,
  markRiderArrived,
  markRiderArriving,
  rejectBooking,
  setRiderAvailability,
  startBooking,
} from '../services/bookingService.js';
import { populateBooking, serializeBooking } from '../services/serializers.js';
import { notifyRecipient } from '../services/notificationService.js';

const router = Router();
router.use(authenticate, requireRole('rider'));

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const rider = await RiderModel.findById(req.auth!.id).lean();
    if (!rider) throw HttpError.unauthorized();
    const [vehicle, documents, activeBooking] = await Promise.all([
      VehicleModel.findOne({ rider: rider._id }).lean(),
      RiderDocumentModel.find({ rider: rider._id }).lean(),
      BookingModel.findOne({
        rider: rider._id,
        status: { $in: ACTIVE_RIDE_STATUSES },
      }).select('_id'),
    ]);
    res.json({
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
      currentBooking: activeBooking ? String(activeBooking._id) : null,
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
    const rider = await RiderModel.findByIdAndUpdate(
      req.auth!.id,
      { $set: update },
      { new: true },
    );
    if (!rider) throw HttpError.unauthorized();
    res.json({ id: String(rider._id), name: rider.name, photoUrl: rider.photoUrl ?? null });
  }),
);

router.put(
  '/vehicle',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.enum(['bike', 'scooter']).default('bike'),
        make: z.string().trim().min(2).max(60),
        model: z.string().trim().min(1).max(60),
        registrationNumber: z
          .string()
          .trim()
          .min(4)
          .max(16)
          .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
        color: z.string().trim().max(30).optional().nullable(),
        year: z.coerce.number().int().min(1980).max(2100).optional().nullable(),
        photoUrl: z.string().trim().max(500).optional().nullable(),
      })
      .parse(req.body);

    const conflict = await VehicleModel.findOne({
      registrationNumber: body.registrationNumber,
      rider: { $ne: req.auth!.id },
    }).select('_id');
    if (conflict) {
      throw HttpError.conflict('This vehicle registration number is already registered');
    }

    const vehicle = await VehicleModel.findOneAndUpdate(
      { rider: req.auth!.id },
      {
        $set: {
          type: body.type,
          make: body.make,
          model: body.model,
          registrationNumber: body.registrationNumber,
          color: body.color || null,
          year: body.year || null,
          photoUrl: body.photoUrl || null,
        },
        $setOnInsert: { rider: req.auth!.id },
      },
      { new: true, upsert: true },
    );

    res.json({
      type: vehicle.type,
      make: vehicle.make,
      model: vehicle.model,
      registrationNumber: vehicle.registrationNumber,
      color: vehicle.color ?? null,
      year: vehicle.year ?? null,
      photoUrl: vehicle.photoUrl ?? null,
    });
  }),
);

router.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const docs = await RiderDocumentModel.find({ rider: req.auth!.id }).lean();
    res.json(
      docs.map((doc) => ({
        id: String(doc._id),
        kind: doc.kind,
        number: doc.number,
        frontUrl: doc.frontUrl,
        backUrl: doc.backUrl,
        status: doc.status,
        note: doc.note,
        updatedAt: doc.updatedAt,
      })),
    );
  }),
);

router.post(
  '/documents',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        kind: z.enum(DOCUMENT_KINDS),
        number: z.string().trim().max(40).optional().nullable(),
        frontUrl: z.string().trim().min(1, 'Upload the document image first').max(500),
        backUrl: z.string().trim().max(500).optional().nullable(),
      })
      .parse(req.body);

    const doc = await RiderDocumentModel.findOneAndUpdate(
      { rider: req.auth!.id, kind: body.kind },
      {
        $set: {
          number: body.number || null,
          frontUrl: body.frontUrl,
          backUrl: body.backUrl || null,
          status: 'pending',
          note: null,
          reviewedBy: null,
          reviewedAt: null,
        },
        $setOnInsert: { rider: req.auth!.id, kind: body.kind },
      },
      { new: true, upsert: true },
    );

    const rider = await RiderModel.findById(req.auth!.id).select('status');
    if (rider?.status === 'rejected') {
      rider.status = 'pending';
      rider.rejectionReason = null;
      await rider.save();
    }

    res.status(201).json({
      id: String(doc._id),
      kind: doc.kind,
      status: doc.status,
      frontUrl: doc.frontUrl,
      backUrl: doc.backUrl,
    });
  }),
);

router.patch(
  '/availability',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        isOnline: z.boolean(),
        location: z
          .object({ lat: latSchema, lng: lngSchema })
          .optional(),
      })
      .parse(req.body);
    const result = await setRiderAvailability(req.auth!.id, body.isOnline, body.location);
    res.json(result);
  }),
);

router.put(
  '/location',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        lat: latSchema,
        lng: lngSchema,
        heading: z.number().optional().nullable(),
        speed: z.number().optional().nullable(),
        accuracy: z.number().optional().nullable(),
      })
      .parse(req.body);
    await handleRiderLocation(req.auth!.id, body);
    res.json({ ok: true });
  }),
);

router.get(
  '/requests/current',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const booking = await currentOfferForRider(req.auth!.id);
    res.json({ booking });
  }),
);

router.get(
  '/bookings/active',
  asyncHandler(async (req, res) => {
    const booking = await activeBookingForRider(req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings/:id/accept',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const booking = await acceptBooking(req.params.id, req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings/:id/reject',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ reason: z.string().trim().max(300).optional() })
      .parse(req.body ?? {});
    await rejectBooking(req.params.id, req.auth!.id, body.reason);
    res.json({ ok: true });
  }),
);

router.post(
  '/bookings/:id/arriving',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const booking = await markRiderArriving(req.params.id, req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings/:id/arrive',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const booking = await markRiderArrived(req.params.id, req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings/:id/start',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const booking = await startBooking(req.params.id, req.auth!.id);
    res.json({ booking });
  }),
);

router.post(
  '/bookings/:id/complete',
  requireApprovedRider,
  asyncHandler(async (req, res) => {
    const booking = await completeBooking(req.params.id, req.auth!.id);
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
      role: 'rider',
      id: req.auth!.id,
      reason: body.reason,
    });
    res.json({ booking });
  }),
);

router.get(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    const booking = await getBookingForActor(req.params.id, 'rider', req.auth!.id);
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
    const query: Record<string, unknown> = { rider: req.auth!.id };
    if (filter === 'active') query.status = { $in: ACTIVE_RIDE_STATUSES };
    if (filter === 'completed') query.status = 'COMPLETED';
    if (filter === 'cancelled') query.status = { $in: ['CANCELLED', 'EXPIRED'] };

    const bookings = await populateBooking(
      BookingModel.find(query).sort({ createdAt: -1 }).limit(50),
    );
    const rides = await Promise.all(bookings.map((b) => serializeBooking(b, 'rider')));
    res.json({ rides });
  }),
);

router.get(
  '/earnings',
  asyncHandler(async (req, res) => {
    const range = z.enum(['today', 'week', 'month']).catch('today').parse(req.query.range);
    const now = new Date();
    const daysBack = range === 'today' ? 0 : range === 'week' ? 6 : 29;
    const from = startOfIstDay(new Date(now.getTime() - daysBack * 86_400_000));
    const chartFrom = startOfIstDay(new Date(now.getTime() - 6 * 86_400_000));

    const riderId = new mongoose.Types.ObjectId(req.auth!.id);
    const [summary] = await BookingModel.aggregate([
      {
        $match: {
          rider: riderId,
          status: 'COMPLETED',
          'statusTimestamps.completedAt': { $gte: from },
        },
      },
      {
        $group: {
          _id: null,
          rides: { $sum: 1 },
          amount: { $sum: '$fare.final' },
          distanceMeters: { $sum: '$route.distanceMeters' },
        },
      },
    ]);

    const daily = await BookingModel.aggregate([
      {
        $match: {
          rider: riderId,
          status: 'COMPLETED',
          'statusTimestamps.completedAt': { $gte: chartFrom },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$statusTimestamps.completedAt',
              timezone: IST_TIMEZONE,
            },
          },
          rides: { $sum: 1 },
          amount: { $sum: '$fare.final' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      range,
      rides: summary?.rides ?? 0,
      amount: summary?.amount ?? 0,
      distanceMeters: summary?.distanceMeters ?? 0,
      daily: daily.map((d) => ({ date: d._id, rides: d.rides, amount: d.amount })),
    });
  }),
);

router.patch(
  '/push-token',
  asyncHandler(async (req, res) => {
    const body = z.object({ token: z.string().min(10).max(500) }).parse(req.body);
    await RiderModel.updateOne(
      { _id: req.auth!.id },
      { $addToSet: { pushTokens: body.token } },
    );
    res.json({ ok: true });
  }),
);

export default router;
