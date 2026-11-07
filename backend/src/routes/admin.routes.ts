import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { BookingModel } from '../models/Booking.js';
import { RiderModel } from '../models/Rider.js';
import { UserModel } from '../models/User.js';
import { VehicleModel } from '../models/Vehicle.js';
import { RiderDocumentModel } from '../models/RiderDocument.js';
import { FareConfigurationModel } from '../models/FareConfiguration.js';
import { RideActivityLogModel } from '../models/RideActivityLog.js';
import { ServiceAreaModel } from '../models/ServiceArea.js';
import { MapNoteModel } from '../models/MapNote.js';
import { ACTIVE_RIDE_STATUSES, RIDE_STATUSES, RIDER_STATUSES } from '../models/enums.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { isValidLatLng, pointInGeoJson } from '../utils/geo.js';
import { IST_TIMEZONE, istDateKey, startOfIstDay } from '../utils/ist.js';
import { cancelBooking } from '../services/bookingService.js';
import { getFareConfig } from '../services/fareService.js';
import {
  getActiveServiceArea,
  invalidateServiceAreaCache,
} from '../services/settingsService.js';
import { notifyRecipient } from '../services/notificationService.js';
import {
  populateBooking,
  riderListItem,
  serializeBooking,
} from '../services/serializers.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

function paging(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const today = startOfToday();
    const [
      customers,
      riders,
      approvedRiders,
      onlineRiders,
      pendingRiders,
      suspendedRiders,
      activeRides,
      completedRides,
      cancelledRides,
      totalRides,
      revenueAgg,
      todayRevenueAgg,
      todayRides,
      todayCancelled,
    ] = await Promise.all([
      UserModel.countDocuments(),
      RiderModel.countDocuments(),
      RiderModel.countDocuments({ status: 'approved' }),
      RiderModel.countDocuments({ status: 'approved', isOnline: true }),
      RiderModel.countDocuments({ status: 'pending' }),
      RiderModel.countDocuments({ status: 'suspended' }),
      BookingModel.countDocuments({ status: { $in: ACTIVE_RIDE_STATUSES } }),
      BookingModel.countDocuments({ status: 'COMPLETED' }),
      BookingModel.countDocuments({ status: { $in: ['CANCELLED', 'EXPIRED'] } }),
      BookingModel.countDocuments(),
      BookingModel.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$fare.final' } } },
      ]),
      BookingModel.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            'statusTimestamps.completedAt': { $gte: today },
          },
        },
        { $group: { _id: null, total: { $sum: '$fare.final' }, rides: { $sum: 1 } } },
      ]),
      BookingModel.countDocuments({ createdAt: { $gte: today } }),
      BookingModel.countDocuments({
        status: { $in: ['CANCELLED', 'EXPIRED'] },
        createdAt: { $gte: today },
      }),
    ]);

    res.json({
      customers,
      riders,
      approvedRiders,
      onlineRiders,
      offlineRiders: Math.max(0, approvedRiders - onlineRiders),
      pendingRiders,
      suspendedRiders,
      activeRides,
      completedRides,
      cancelledRides,
      totalRides,
      revenueTotal: revenueAgg[0]?.total ?? 0,
      revenueToday: todayRevenueAgg[0]?.total ?? 0,
      completedToday: todayRevenueAgg[0]?.rides ?? 0,
      ridesToday: todayRides,
      cancelledToday: todayCancelled,
    });
  }),
);

router.get(
  '/riders',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paging(req.query as Record<string, unknown>);
    const status = String(req.query.status ?? '').trim();
    const search = String(req.query.search ?? '').trim();

    const query: Record<string, unknown> = {};
    if (status && (RIDER_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: regex }, { mobile: regex }];
    }

    const [total, riders] = await Promise.all([
      RiderModel.countDocuments(query),
      RiderModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const docs = await RiderDocumentModel.find({
      rider: { $in: riders.map((r) => r._id) },
    })
      .select('rider kind status updatedAt')
      .lean();

    res.json({
      riders: riders.map((rider) => ({
        ...riderListItem(rider),
        documents: docs
          .filter((doc) => String(doc.rider) === String(rider._id))
          .map((doc) => ({ kind: doc.kind, status: doc.status, updatedAt: doc.updatedAt })),
      })),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  }),
);

router.get(
  '/riders/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw HttpError.badRequest('Invalid rider id');
    const rider = await RiderModel.findById(req.params.id).lean();
    if (!rider) throw HttpError.notFound('Rider not found');

    const [vehicle, documents, recentBookings, rideCount] = await Promise.all([
      VehicleModel.findOne({ rider: rider._id }).lean(),
      RiderDocumentModel.find({ rider: rider._id }).lean(),
      populateBooking(
        BookingModel.find({ rider: rider._id }).sort({ createdAt: -1 }).limit(15),
      ),
      BookingModel.countDocuments({ rider: rider._id }),
    ]);

    res.json({
      rider: riderListItem(rider),
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
        reviewedAt: doc.reviewedAt,
        updatedAt: doc.updatedAt,
      })),
      recentRides: await Promise.all(recentBookings.map((b) => serializeBooking(b, 'admin'))),
      totalBookings: rideCount,
    });
  }),
);

router.patch(
  '/riders/:id/status',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['approved', 'rejected', 'suspended']),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(req.body);

    if (!mongoose.isValidObjectId(req.params.id)) throw HttpError.badRequest('Invalid rider id');
    const rider = await RiderModel.findById(req.params.id);
    if (!rider) throw HttpError.notFound('Rider not found');

    if (body.status !== 'approved') {
      const active = await BookingModel.exists({
        rider: rider._id,
        status: { $in: ACTIVE_RIDE_STATUSES },
      });
      if (active) {
        throw HttpError.conflict(
          'This rider has an active ride. Cancel or complete it before changing the account status.',
        );
      }
    }

    rider.status = body.status;
    rider.isOnline = false;
    rider.currentBooking = null;
    if (body.status === 'approved') {
      rider.approvedAt = new Date();
      rider.rejectionReason = null;
      rider.suspendedReason = null;
    }
    if (body.status === 'rejected') {
      rider.rejectionReason = body.reason?.trim() || 'Documents did not meet our checks';
      rider.suspendedReason = null;
    }
    if (body.status === 'suspended') {
      rider.suspendedReason = body.reason?.trim() || 'Account suspended by support';
      rider.rejectionReason = null;
    }
    await rider.save();

    const titles: Record<string, string> = {
      approved: 'Rider account approved',
      rejected: 'Rider application needs attention',
      suspended: 'Rider account suspended',
    };
    await notifyRecipient({
      recipientRole: 'rider',
      recipientId: String(rider._id),
      title: titles[body.status],
      body:
        body.status === 'approved'
          ? 'You can go online and start accepting rides.'
          : body.reason?.trim() || 'Please contact support for details.',
      type: `account_${body.status}`,
      data: {},
    });

    res.json({ rider: riderListItem(rider) });
  }),
);

router.patch(
  '/riders/:riderId/documents/:docId',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['approved', 'rejected']),
        note: z.string().trim().max(300).optional(),
      })
      .parse(req.body);

    const doc = await RiderDocumentModel.findOneAndUpdate(
      { _id: req.params.docId, rider: req.params.riderId },
      {
        $set: {
          status: body.status,
          note: body.note?.trim() || null,
          reviewedBy: req.auth!.id,
          reviewedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!doc) throw HttpError.notFound('Document not found');

    await notifyRecipient({
      recipientRole: 'rider',
      recipientId: req.params.riderId,
      title: `Document ${body.status}`,
      body: `${doc.kind.toUpperCase()} was ${body.status}. ${body.note?.trim() || ''}`.trim(),
      type: 'document_review',
      data: {},
    });

    res.json({
      id: String(doc._id),
      kind: doc.kind,
      status: doc.status,
      note: doc.note,
    });
  }),
);

router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paging(req.query as Record<string, unknown>);
    const search = String(req.query.search ?? '').trim();
    const blocked = String(req.query.blocked ?? '').trim();

    const query: Record<string, unknown> = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: regex }, { mobile: regex }];
    }
    if (blocked === 'true' || blocked === 'false') query.isBlocked = blocked === 'true';

    const [total, customers] = await Promise.all([
      UserModel.countDocuments(query),
      UserModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const counts = await BookingModel.aggregate([
      { $match: { customer: { $in: customers.map((c) => c._id) } } },
      {
        $group: {
          _id: '$customer',
          rides: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
          },
          spent: {
            $sum: {
              $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$fare.final', 0],
            },
          },
        },
      },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    res.json({
      customers: customers.map((customer) => {
        const stat = countMap.get(String(customer._id));
        return {
          id: String(customer._id),
          name: customer.name,
          mobile: customer.mobile,
          photoUrl: customer.photoUrl ?? null,
          isBlocked: customer.isBlocked,
          rides: stat?.rides ?? 0,
          completed: stat?.completed ?? 0,
          spent: stat?.spent ?? 0,
          createdAt: customer.createdAt,
        };
      }),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  }),
);

router.patch(
  '/customers/:id/block',
  asyncHandler(async (req, res) => {
    const body = z.object({ blocked: z.boolean() }).parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) throw HttpError.badRequest('Invalid customer id');
    const customer = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked: body.blocked } },
      { new: true },
    );
    if (!customer) throw HttpError.notFound('Customer not found');

    await notifyRecipient({
      recipientRole: 'customer',
      recipientId: String(customer._id),
      title: body.blocked ? 'Account blocked' : 'Account reactivated',
      body: body.blocked
        ? 'Your account has been blocked. Contact support for help.'
        : 'Your account is active again. You can book rides.',
      type: body.blocked ? 'account_blocked' : 'account_active',
      data: {},
    });

    res.json({ id: String(customer._id), isBlocked: customer.isBlocked });
  }),
);

async function bookingQueryFromFilters(queryParams: Record<string, unknown>) {
  const query: Record<string, unknown> = {};

  const statusParam = String(queryParams.status ?? '').trim();
  if (statusParam) {
    const statuses = statusParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => (RIDE_STATUSES as readonly string[]).includes(s));
    if (statuses.length) query.status = { $in: statuses };
  }

  const from = String(queryParams.from ?? '').trim();
  const to = String(queryParams.to ?? '').trim();
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) {
      const date = new Date(from);
      if (!Number.isNaN(date.getTime())) range.$gte = date;
    }
    if (to) {
      const date = new Date(to);
      if (!Number.isNaN(date.getTime())) {
        date.setHours(23, 59, 59, 999);
        range.$lte = date;
      }
    }
    if (Object.keys(range).length) query.createdAt = range;
  }

  const search = String(queryParams.search ?? '').trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const [users, riders] = await Promise.all([
      UserModel.find({ $or: [{ name: regex }, { mobile: regex }] }).select('_id').limit(50).lean(),
      RiderModel.find({ $or: [{ name: regex }, { mobile: regex }] })
        .select('_id')
        .limit(50)
        .lean(),
    ]);
    query.$or = [
      { bookingCode: regex },
      { customer: { $in: users.map((u) => u._id) } },
      { rider: { $in: riders.map((r) => r._id) } },
    ];
  }

  return query;
}

router.get(
  '/bookings/export.csv',
  asyncHandler(async (req, res) => {
    const query = await bookingQueryFromFilters(req.query as Record<string, unknown>);
    const bookings = await populateBooking(
      BookingModel.find(query).sort({ createdAt: -1 }).limit(5000),
    );

    const rows = await Promise.all(
      bookings.map(async (booking: any) => {
        const view: any = await serializeBooking(booking, 'admin');
        return [
          view.id,
          view.code,
          view.createdAt ? new Date(view.createdAt).toISOString() : '',
          view.status,
          view.customer?.name ?? '',
          view.customer?.mobile ?? '',
          view.rider?.name ?? '',
          view.rider?.mobile ?? '',
          view.pickup?.label ?? '',
          view.destination?.label ?? '',
          (view.route.distanceMeters / 1000).toFixed(2),
          (view.route.durationSeconds / 60).toFixed(0),
          view.fare.estimated,
          view.fare.final ?? '',
          view.fare.total,
          view.payment?.status ?? '',
          view.payment?.method ?? '',
          view.cancellation?.byRole ?? '',
          view.fare.cancellationFee ?? 0,
          view.timestamps?.completedAt
            ? new Date(view.timestamps.completedAt).toISOString()
            : '',
        ];
      }),
    );

    const header = [
      'Booking ID',
      'Code',
      'Created at',
      'Status',
      'Customer',
      'Customer mobile',
      'Rider',
      'Rider mobile',
      'Pickup',
      'Destination',
      'Distance (km)',
      'Duration (min)',
      'Estimated fare',
      'Final fare',
      'Charged total',
      'Payment status',
      'Payment method',
      'Cancelled by',
      'Cancellation fee',
      'Completed at',
    ];

    const escapeCsv = (value: unknown) => {
      let text = value === null || value === undefined ? '' : String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="flash-bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(`\uFEFF${csv}`);
  }),
);

router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paging(req.query as Record<string, unknown>);
    const query = await bookingQueryFromFilters(req.query as Record<string, unknown>);
    const [total, bookings] = await Promise.all([
      BookingModel.countDocuments(query),
      populateBooking(
        BookingModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ),
    ]);
    const rides = await Promise.all(bookings.map((b) => serializeBooking(b, 'admin')));
    res.json({ rides, total, page, pages: Math.ceil(total / limit) || 1 });
  }),
);

router.get(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw HttpError.badRequest('Invalid booking id');
    const booking = await populateBooking(BookingModel.findById(req.params.id));
    if (!booking) throw HttpError.notFound('Booking not found');
    const logs = await RideActivityLogModel.find({ booking: req.params.id })
      .sort({ createdAt: 1 })
      .lean();
    res.json({
      booking: await serializeBooking(booking, 'admin'),
      activity: logs.map((log) => ({
        id: String(log._id),
        status: log.status,
        actorRole: log.actorRole,
        note: log.note,
        createdAt: log.createdAt,
      })),
    });
  }),
);

router.post(
  '/bookings/:id/cancel',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ reason: z.string().trim().max(300).optional() })
      .parse(req.body ?? {});
    const booking = await cancelBooking(req.params.id, {
      role: 'admin',
      id: req.auth!.id,
      reason: body.reason || 'Cancelled by support',
    });
    res.json({ booking });
  }),
);

router.get(
  '/live',
  asyncHandler(async (_req, res) => {
    const [bookings, riders] = await Promise.all([
      populateBooking(
        BookingModel.find({ status: { $in: ACTIVE_RIDE_STATUSES } }).sort({ createdAt: -1 }),
      ),
      RiderModel.find({
        status: 'approved',
        isOnline: true,
        currentLocation: { $ne: null },
      })
        .select(
          'name mobile photoUrl rating totalRides status isOnline currentLocation currentBooking lastLocationAt createdAt',
        )
        .lean(),
    ]);

    res.json({
      serverTime: new Date(),
      rides: await Promise.all(bookings.map((b) => serializeBooking(b, 'admin'))),
      riders: riders.map(riderListItem),
    });
  }),
);

router.get(
  '/fare-config',
  asyncHandler(async (_req, res) => {
    const config = await getFareConfig();
    res.json(config);
  }),
);

router.put(
  '/fare-config',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().max(80).optional(),
        baseFare: z.number().min(0).max(10000),
        perKm: z.number().min(0).max(1000),
        perMinute: z.number().min(0).max(1000),
        minimumFare: z.number().min(0).max(100000),
        waitingFreeMinutes: z.number().min(0).max(120),
        waitingPerMinute: z.number().min(0).max(1000),
        cancellationFee: z.number().min(0).max(10000),
        platformFee: z.number().min(0).max(10000),
      })
      .parse(req.body);

    if (body.minimumFare < body.baseFare) {
      throw HttpError.badRequest('Minimum fare cannot be lower than the base fare');
    }

    const current = await FareConfigurationModel.findOne({ isActive: true }).sort({
      updatedAt: -1,
    });
    let config;
    if (current) {
      config = await FareConfigurationModel.findByIdAndUpdate(
        current._id,
        { $set: { ...body, currency: 'INR', isActive: true, updatedBy: req.auth!.id } },
        { new: true },
      );
    } else {
      config = await FareConfigurationModel.create({
        ...body,
        currency: 'INR',
        isActive: true,
        updatedBy: req.auth!.id,
      });
    }

    res.json(config);
  }),
);

function validateBoundary(boundary: {
  type: 'Polygon' | 'MultiPolygon';
  coordinates?: unknown;
}) {
  const isRing = (ring: unknown) =>
    Array.isArray(ring) &&
    ring.length >= 4 &&
    ring.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === 'number' &&
        typeof pair[1] === 'number' &&
        Math.abs(pair[0]) <= 180 &&
        Math.abs(pair[1]) <= 90,
    );

  if (boundary.type === 'Polygon') {
    return (
      Array.isArray(boundary.coordinates) &&
      boundary.coordinates.length >= 1 &&
      boundary.coordinates.every(isRing)
    );
  }
  if (boundary.type === 'MultiPolygon') {
    return (
      Array.isArray(boundary.coordinates) &&
      boundary.coordinates.length >= 1 &&
      boundary.coordinates.every(
        (polygon) => Array.isArray(polygon) && polygon.length >= 1 && polygon.every(isRing),
      )
    );
  }
  return false;
}

router.get(
  '/service-area',
  asyncHandler(async (_req, res) => {
    const area = await getActiveServiceArea();
    res.json(area);
  }),
);

router.put(
  '/service-area',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(3).max(120).optional(),
        description: z.string().trim().max(300).nullable().optional(),
        boundary: z
          .object({
            type: z.enum(['Polygon', 'MultiPolygon']),
            coordinates: z.unknown(),
          })
          .optional(),
        center: z
          .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
          })
          .optional(),
        isAvailable: z.boolean().optional(),
        unavailableMessage: z.string().trim().max(300).optional(),
      })
      .parse(req.body);

    if (body.boundary && !validateBoundary(body.boundary)) {
      throw HttpError.badRequest('The service area boundary is not valid GeoJSON');
    }

    const area = await ServiceAreaModel.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!area) throw HttpError.notFound('No active service area configured');

    const nextBoundary = (body.boundary ?? area.boundary) as {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: unknown;
    } | null;
    if (!nextBoundary) throw HttpError.badRequest('The service area has no boundary');
    const nextCenter = body.center
      ? { lat: body.center.lat, lng: body.center.lng }
      : { lat: area.center!.coordinates[1], lng: area.center!.coordinates[0] };

    if (!isValidLatLng(nextCenter.lat, nextCenter.lng)) {
      throw HttpError.badRequest('Invalid centre point');
    }
    if (!pointInGeoJson([nextCenter.lng, nextCenter.lat], nextBoundary)) {
      throw HttpError.badRequest('The centre point must be inside the service area boundary');
    }

    if (body.name !== undefined) area.name = body.name;
    if (body.description !== undefined) area.description = body.description;
    if (body.isAvailable !== undefined) area.isAvailable = body.isAvailable;
    if (body.unavailableMessage !== undefined) {
      area.unavailableMessage = body.unavailableMessage;
    }
    if (body.boundary) {
      area.boundary = nextBoundary as typeof area.boundary;
    }
    area.center = {
      type: 'Point',
      coordinates: [nextCenter.lng, nextCenter.lat],
    };
    await area.save();
    invalidateServiceAreaCache();

    res.json(area);
  }),
);

const MAP_NOTE_TYPES = ['landmark', 'road', 'closure', 'other'] as const;

function serializeMapNote(note: any) {
  return {
    id: String(note._id),
    label: note.label,
    description: note.description ?? null,
    type: note.type,
    lat: note.location?.coordinates?.[1] ?? 0,
    lng: note.location?.coordinates?.[0] ?? 0,
    isActive: note.isActive,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

router.get(
  '/map-notes',
  asyncHandler(async (req, res) => {
    const type = String(req.query.type ?? '').trim();
    const search = String(req.query.search ?? '').trim();
    const query: Record<string, unknown> = {};
    if ((MAP_NOTE_TYPES as readonly string[]).includes(type)) query.type = type;
    if (search) query.label = new RegExp(escapeRegex(search), 'i');

    const notes = await MapNoteModel.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ notes: notes.map(serializeMapNote) });
  }),
);

const mapNoteCreateSchema = z.object({
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  type: z.enum(MAP_NOTE_TYPES).default('landmark'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isActive: z.boolean().optional(),
});

router.post(
  '/map-notes',
  asyncHandler(async (req, res) => {
    const body = mapNoteCreateSchema.parse(req.body);
    if (!isValidLatLng(body.lat, body.lng)) throw HttpError.badRequest('Invalid coordinates');

    const note = await MapNoteModel.create({
      label: body.label,
      description: body.description?.trim() || null,
      type: body.type,
      location: { type: 'Point', coordinates: [body.lng, body.lat] },
      isActive: body.isActive ?? true,
      createdBy: req.auth!.id,
    });

    res.status(201).json({ note: serializeMapNote(note) });
  }),
);

router.patch(
  '/map-notes/:id',
  asyncHandler(async (req, res) => {
    const body = mapNoteCreateSchema
      .extend({ label: z.string().trim().min(2).max(120).optional() })
      .partial()
      .parse(req.body);

    if ((body.lat === undefined) !== (body.lng === undefined)) {
      throw HttpError.badRequest('Send both latitude and longitude');
    }

    const update: Record<string, unknown> = {};
    if (body.label !== undefined) update.label = body.label;
    if (body.description !== undefined) update.description = body.description?.trim() || null;
    if (body.type !== undefined) update.type = body.type;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.lat !== undefined && body.lng !== undefined) {
      if (!isValidLatLng(body.lat, body.lng)) throw HttpError.badRequest('Invalid coordinates');
      update.location = { type: 'Point', coordinates: [body.lng, body.lat] };
    }
    if (Object.keys(update).length === 0) throw HttpError.badRequest('Nothing to update');

    if (!mongoose.isValidObjectId(req.params.id)) throw HttpError.badRequest('Invalid note id');
    const note = await MapNoteModel.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!note) throw HttpError.notFound('Map note not found');

    res.json({ note: serializeMapNote(note) });
  }),
);

router.delete(
  '/map-notes/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw HttpError.badRequest('Invalid note id');
    const note = await MapNoteModel.findByIdAndDelete(req.params.id);
    if (!note) throw HttpError.notFound('Map note not found');
    res.json({ id: String(note._id), deleted: true });
  }),
);

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const from = startOfIstDay(new Date(Date.now() - (days - 1) * 86_400_000));

    const [created, completed] = await Promise.all([
      BookingModel.aggregate([
        { $match: { createdAt: { $gte: from } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: IST_TIMEZONE },
            },
            bookings: { $sum: 1 },
            cancelled: {
              $sum: {
                $cond: [{ $in: ['$status', ['CANCELLED', 'EXPIRED']] }, 1, 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      BookingModel.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            'statusTimestamps.completedAt': { $gte: from },
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
            revenue: { $sum: '$fare.final' },
            distanceMeters: { $sum: '$route.distanceMeters' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const createdMap = new Map(created.map((row) => [row._id, row]));
    const completedMap = new Map(completed.map((row) => [row._id, row]));
    const series: {
      date: string;
      bookings: number;
      cancelled: number;
      completed: number;
      revenue: number;
      distanceKm: number;
    }[] = [];

    for (let i = 0; i < days; i += 1) {
      const key = istDateKey(new Date(from.getTime() + i * 86_400_000));
      const createdRow = createdMap.get(key);
      const completedRow = completedMap.get(key);
      series.push({
        date: key,
        bookings: createdRow?.bookings ?? 0,
        cancelled: createdRow?.cancelled ?? 0,
        completed: completedRow?.rides ?? 0,
        revenue: completedRow?.revenue ?? 0,
        distanceKm: Math.round(((completedRow?.distanceMeters ?? 0) / 1000) * 10) / 10,
      });
    }

    res.json({
      days,
      series,
      totals: {
        bookings: series.reduce((sum, row) => sum + row.bookings, 0),
        completed: series.reduce((sum, row) => sum + row.completed, 0),
        cancelled: series.reduce((sum, row) => sum + row.cancelled, 0),
        revenue: series.reduce((sum, row) => sum + row.revenue, 0),
        distanceKm: Math.round(series.reduce((sum, row) => sum + row.distanceKm, 0) * 10) / 10,
      },
    });
  }),
);

export default router;
