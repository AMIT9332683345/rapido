import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { BookingModel, type BookingDocument } from '../models/Booking.js';
import type { FareConfiguration } from '../models/FareConfiguration.js';
import { RiderModel } from '../models/Rider.js';
import { PaymentModel } from '../models/Payment.js';
import { RideLocationModel } from '../models/RideLocation.js';
import { ACTIVE_RIDE_STATUSES, type RideStatus } from '../models/enums.js';
import { HttpError } from '../utils/httpError.js';
import { roundMoney, toGeoPoint, isValidLatLng } from '../utils/geo.js';
import { calculateFare, getFareConfig, type FareBreakdown } from './fareService.js';
import { assertBookablePoint, assertRouteInServiceArea } from './settingsService.js';
import { getRoadRoute, type RouteResult } from './routingService.js';
import { findNearbyRiders } from './geoService.js';
import { logRideActivity } from './activityService.js';
import { notifyAdmins, notifyRecipient } from './notificationService.js';
import { populateBooking, serializeBooking } from './serializers.js';
import { getIo, rooms } from '../sockets/registry.js';

export interface PlaceInput {
  label: string;
  address?: string | null;
  lat: number;
  lng: number;
}

export interface CreateBookingInput {
  customerId: string;
  pickup: PlaceInput;
  destination: PlaceInput;
  note?: string | null;
}

const CUSTOMER_FIELDS = 'name mobile photoUrl';
const RIDER_FIELDS =
  'name mobile photoUrl rating ratingCount totalRides currentLocation currentBooking';

function makeBookingCode(): string {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `FL-${stamp}-${random}`;
}

function placeDoc(place: PlaceInput) {
  if (!isValidLatLng(place.lat, place.lng)) {
    throw HttpError.badRequest('Invalid pickup or destination coordinates');
  }
  return {
    label: place.label?.trim() || 'Pinned location',
    address: place.address?.trim() || null,
    location: toGeoPoint(place.lat, place.lng),
  };
}

export async function getBookingDocument(id: string) {
  return populateBooking(BookingModel.findById(id));
}

export async function getBookingForActor(id: string, role: string, actorId: string) {
  const booking = await getBookingDocument(id);
  if (!booking) throw HttpError.notFound('Booking not found');

  const customerId = String((booking.customer as any)?._id ?? booking.customer);
  const riderId = String((booking.rider as any)?._id ?? booking.rider ?? '');
  if (role === 'customer' && customerId !== actorId) {
    throw HttpError.forbidden('This booking belongs to another customer');
  }
  if (role === 'rider' && riderId !== actorId) {
    throw HttpError.forbidden('This booking is assigned to another rider');
  }
  return serializeBooking(booking, role as 'customer' | 'rider' | 'admin');
}

export async function activeBookingForCustomer(customerId: string) {
  const booking = await populateBooking(
    BookingModel.findOne({
      customer: customerId,
      status: { $in: ACTIVE_RIDE_STATUSES },
    }).sort({ createdAt: -1 }),
  );
  return booking ? serializeBooking(booking, 'customer') : null;
}

export async function activeBookingForRider(riderId: string) {
  const booking = await populateBooking(
    BookingModel.findOne({
      rider: riderId,
      status: { $in: ACTIVE_RIDE_STATUSES },
    }).sort({ createdAt: -1 }),
  );
  return booking ? serializeBooking(booking, 'rider') : null;
}

export async function currentOfferForRider(riderId: string) {
  const booking = await populateBooking(
    BookingModel.findOne({
      status: 'SEARCHING',
      offerExpiresAt: { $gt: new Date() },
      offers: { $elemMatch: { rider: riderId, response: 'pending' } },
    }).sort({ createdAt: -1 }),
  );
  return booking ? serializeBooking(booking, 'rider') : null;
}

const DESTINATION_EDIT_STATUSES: RideStatus[] = [
  'SEARCHING', 'REQUESTED', 'ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED',
];
const DESTINATION_QUOTE_AUDIENCE = 'booking-destination-quote';
const DESTINATION_QUOTE_TTL_MS = 120_000;
const MAX_DESTINATION_QUOTES = 200;
const MAX_DESTINATION_QUOTE_BYTES = 16 * 1024 * 1024;

interface DestinationQuote {
  actorId: string;
  bookingId: string;
  revision: string;
  status: RideStatus;
  destination: ReturnType<typeof placeDoc>;
  route: RouteResult;
  fare: FareBreakdown;
  configFingerprint: string;
  expiresAt: number;
}

// Route geometry stays server-side; the signed token is only a short cache reference.
const destinationQuotes = new Map<string, { quote: DestinationQuote; bytes: number }>();
let destinationQuoteBytes = 0;

function removeDestinationQuote(id: string) {
  const entry = destinationQuotes.get(id);
  if (entry) destinationQuoteBytes -= entry.bytes;
  destinationQuotes.delete(id);
}

function fareConfigFingerprint(config: FareConfiguration): string {
  return createHash('sha256').update(JSON.stringify({
    id: String((config as { _id?: unknown })._id ?? ''),
    updatedAt: config.updatedAt,
    currency: config.currency,
    baseFare: config.baseFare,
    perKm: config.perKm,
    perMinute: config.perMinute,
    minimumFare: config.minimumFare,
    waitingFreeMinutes: config.waitingFreeMinutes,
    waitingPerMinute: config.waitingPerMinute,
    cancellationFee: config.cancellationFee,
    platformFee: config.platformFee,
    isActive: config.isActive,
  })).digest('hex');
}

function assertDestinationEditable(booking: BookingDocument, customerId: string) {
  if (String(booking.customer) !== customerId) {
    throw HttpError.forbidden('This booking belongs to another customer');
  }
  if (booking.status === 'IN_PROGRESS') {
    throw HttpError.conflict(
      'Destination changes during a ride require support. Contact support for help.',
      'RIDE_IN_PROGRESS',
    );
  }
  if (!DESTINATION_EDIT_STATUSES.includes(booking.status)) {
    throw HttpError.conflict('The destination can only be changed before the ride starts', 'INVALID_RIDE_STATE');
  }
}

export async function estimateBookingDestination(
  bookingId: string,
  customerId: string,
  destination: PlaceInput,
) {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) throw HttpError.notFound('Booking not found');
  assertDestinationEditable(booking, customerId);
  const destinationDoc = placeDoc(destination);
  const [pickupLng, pickupLat] = booking.pickup.location.coordinates;
  if (pickupLat === destination.lat && pickupLng === destination.lng) {
    throw HttpError.badRequest('Pickup and destination cannot be the same');
  }
  const [area] = await Promise.all([
    assertBookablePoint(pickupLat, pickupLng),
    assertBookablePoint(destination.lat, destination.lng),
  ]);
  const route = await getRoadRoute({ lat: pickupLat, lng: pickupLng }, destination);
  assertRouteInServiceArea(area, route);
  const config = await getFareConfig();
  const fare = calculateFare(config, route.distanceMeters, route.durationSeconds);
  const quote: DestinationQuote = {
    actorId: customerId,
    bookingId: String(booking._id),
    revision: booking.updatedAt.toISOString(),
    status: booking.status,
    destination: destinationDoc,
    route,
    fare,
    configFingerprint: fareConfigFingerprint(config),
    expiresAt: Date.now() + DESTINATION_QUOTE_TTL_MS,
  };
  const json = JSON.stringify(quote);
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_DESTINATION_QUOTE_BYTES) {
    throw HttpError.unavailable('This route is too large to quote safely. Please contact support.');
  }
  for (const [id, entry] of destinationQuotes) {
    if (entry.quote.expiresAt <= Date.now()) removeDestinationQuote(id);
  }
  while (destinationQuotes.size >= MAX_DESTINATION_QUOTES || destinationQuoteBytes + bytes > MAX_DESTINATION_QUOTE_BYTES) {
    removeDestinationQuote(destinationQuotes.keys().next().value!);
  }
  const id = randomBytes(32).toString('hex');
  const token = jwt.sign({
    type: DESTINATION_QUOTE_AUDIENCE,
    actorId: customerId,
    bookingId: quote.bookingId,
    revision: quote.revision,
  }, env.JWT_SECRET, {
    algorithm: 'HS256', audience: DESTINATION_QUOTE_AUDIENCE, jwtid: id, expiresIn: '2m',
  });
  destinationQuotes.set(id, { quote: JSON.parse(json) as DestinationQuote, bytes });
  destinationQuoteBytes += bytes;
  return { token, route, fare, currency: fare.currency };
}

export async function confirmBookingDestination(bookingId: string, customerId: string, quoteToken: string) {
  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(quoteToken, env.JWT_SECRET, {
      algorithms: ['HS256'], audience: DESTINATION_QUOTE_AUDIENCE,
    });
    if (typeof decoded === 'string' || decoded.type !== DESTINATION_QUOTE_AUDIENCE || !decoded.jti) {
      throw new Error('Invalid quote type');
    }
    claims = decoded;
  } catch {
    throw HttpError.conflict('Destination quote is invalid or expired. Request a new estimate.', 'QUOTE_EXPIRED');
  }
  const quoteId = claims.jti!;
  const quote = destinationQuotes.get(quoteId)?.quote;
  if (!quote || quote.expiresAt <= Date.now()) {
    removeDestinationQuote(quoteId);
    throw HttpError.conflict('Destination quote expired. Request a new estimate.', 'QUOTE_EXPIRED');
  }
  if (quote.actorId !== customerId || claims.actorId !== customerId ||
      quote.bookingId !== bookingId || claims.bookingId !== bookingId || claims.revision !== quote.revision) {
    throw HttpError.forbidden('This quote belongs to another customer or booking');
  }
  const booking = await BookingModel.findById(bookingId);
  if (!booking) throw HttpError.notFound('Booking not found');
  assertDestinationEditable(booking, customerId);
  if (booking.updatedAt.toISOString() !== quote.revision || booking.status !== quote.status) {
    throw HttpError.conflict('This ride changed. Request a new destination estimate.', 'QUOTE_STALE');
  }
  const [pickupLng, pickupLat] = booking.pickup.location.coordinates;
  const [destinationLng, destinationLat] = quote.destination.location.coordinates;
  const [area] = await Promise.all([
    assertBookablePoint(pickupLat, pickupLng),
    assertBookablePoint(destinationLat, destinationLng),
  ]);
  assertRouteInServiceArea(area, quote.route);
  const config = await getFareConfig();
  if (fareConfigFingerprint(config) !== quote.configFingerprint) {
    throw HttpError.conflict('Fare settings changed. Request a new destination estimate.', 'QUOTE_STALE');
  }
  if (quote.expiresAt <= Date.now()) {
    removeDestinationQuote(quoteId);
    throw HttpError.conflict('Destination quote expired. Request a new estimate.', 'QUOTE_EXPIRED');
  }
  const updated = await BookingModel.findOneAndUpdate({
    _id: bookingId,
    customer: customerId,
    status: quote.status,
    updatedAt: new Date(quote.revision),
  }, {
    $set: { destination: quote.destination, route: quote.route, fare: quote.fare },
  }, { new: true, runValidators: true });
  if (!updated) throw HttpError.conflict('This ride changed. Request a new destination estimate.', 'QUOTE_STALE');
  removeDestinationQuote(quoteId);
  await logRideActivity({
    bookingId,
    status: updated.status,
    actorRole: 'customer',
    actorId: customerId,
    note: 'Customer changed the destination before the ride started',
    meta: {
      from: {
        label: booking.destination.label,
        address: booking.destination.address ?? null,
        location: { type: 'Point', coordinates: booking.destination.location.coordinates },
      },
      to: quote.destination,
      oldFare: booking.fare.estimated,
      newFare: quote.fare.estimated,
    },
  });
  await pushBookingState(bookingId);
  if (updated.rider) {
    await notifyRecipient({
      recipientRole: 'rider',
      recipientId: String(updated.rider),
      title: 'Destination updated',
      body: `The customer changed the destination to ${updated.destination.label}. Estimated fare: ${quote.fare.currency} ${quote.fare.estimated}.`,
      type: 'destination_updated',
      data: { bookingId },
    });
  }
  return getBookingForActor(bookingId, 'customer', customerId);
}

export async function createBooking(input: CreateBookingInput) {
  const pickup = placeDoc(input.pickup);
  const destination = placeDoc(input.destination);

  const [area] = await Promise.all([
    assertBookablePoint(input.pickup.lat, input.pickup.lng),
    assertBookablePoint(input.destination.lat, input.destination.lng),
  ]);

  const existing = await BookingModel.findOne({
    customer: input.customerId,
    status: { $in: ACTIVE_RIDE_STATUSES },
  }).select('_id');
  if (existing) {
    throw HttpError.conflict(
      'You already have an active ride. Complete or cancel it before booking another.',
      'ACTIVE_BOOKING_EXISTS',
    );
  }

  const route = await getRoadRoute(
    { lat: input.pickup.lat, lng: input.pickup.lng },
    { lat: input.destination.lat, lng: input.destination.lng },
  );
  assertRouteInServiceArea(area, route);

  const config = await getFareConfig();
  const fare = calculateFare(config, route.distanceMeters, route.durationSeconds);
  const now = new Date();
  const searchMinutes = env.BOOKING_SEARCH_MINUTES;

  const booking = await BookingModel.create({
    bookingCode: makeBookingCode(),
    customer: input.customerId,
    status: 'SEARCHING' as RideStatus,
    pickup,
    destination,
    route,
    fare,
    payment: { method: 'cash', status: 'pending' },
    statusTimestamps: { searchingAt: now },
    searchDeadlineAt: new Date(now.getTime() + searchMinutes * 60_000),
    offerExpiresAt: now,
    offerRound: 0,
    customerNote: input.note?.trim() || null,
  });

  await logRideActivity({
    bookingId: booking._id,
    status: 'SEARCHING',
    actorRole: 'customer',
    actorId: input.customerId,
    note: 'Ride requested',
    meta: {
      distanceMeters: route.distanceMeters,
      estimatedFare: fare.estimated,
      routing: route.provider,
    },
  });

  await notifyAdmins('admin:booking', {
    id: String(booking._id),
    code: booking.bookingCode,
    status: booking.status,
  });

  try {
    await offerToRiders(String(booking._id), 1);
  } catch (error) {
    console.error('[booking] initial dispatch failed:', (error as Error).message);
  }

  const fresh = await getBookingDocument(String(booking._id));
  return serializeBooking(fresh, 'customer');
}

async function closeOffersForRiders(
  offers: { rider?: unknown; response?: string }[],
  exceptRiderId?: string,
) {
  const io = getIo();
  if (!io) return;
  for (const offer of offers) {
    const id = String((offer.rider as any)?._id ?? offer.rider);
    if (!id || id === exceptRiderId) continue;
    io.to(rooms.rider(id)).emit('ride:request:closed', {});
  }
}

// Evaluate against the stored array, never a read-time copy: concurrent responses survive.
function expirePendingOffers(now: Date) {
  return {
    $map: {
      input: { $ifNull: ['$offers', []] },
      as: 'offer',
      in: {
        $cond: [
          { $eq: ['$$offer.response', 'pending'] },
          { $mergeObjects: ['$$offer', { response: 'expired', respondedAt: now }] },
          '$$offer',
        ],
      },
    },
  };
}

export async function offerToRiders(bookingId: string, round: number) {
  const booking = await BookingModel.findOne({ _id: bookingId, status: 'SEARCHING', rider: null });
  if (!booking || round !== (booking.offerRound ?? 0) + 1) return;

  const now = new Date();
  const pending = (booking.offers ?? []).some((offer) => offer.response === 'pending');
  if (pending && booking.offerExpiresAt && booking.offerExpiresAt > now) return;
  if (
    !booking.searchDeadlineAt ||
    booking.searchDeadlineAt <= now ||
    round > env.RIDE_REQUEST_MAX_ROUNDS
  ) {
    await expireBooking(bookingId, booking.offerRound ?? 0);
    return;
  }

  const coords = booking.pickup.location.coordinates as [number, number];
  const nearby = await findNearbyRiders(
    { lat: coords[1], lng: coords[0] },
    env.RIDE_REQUEST_RADIUS_KM * 1000,
  );
  const declined = new Set((booking.declinedRiders ?? []).map(String));
  const candidates = nearby.filter((rider) => !declined.has(rider.id));
  const dispatchedAt = new Date();
  if (booking.searchDeadlineAt <= dispatchedAt) {
    await expireBooking(bookingId, booking.offerRound ?? 0);
    return;
  }
  const offerExpiresAt = new Date(Math.min(
    dispatchedAt.getTime() + (candidates.length ? env.BOOKING_OFFER_SECONDS * 1000 : 15_000),
    booking.searchDeadlineAt.getTime(),
  ));
  const offers = candidates.map((rider) => ({
    rider: new Types.ObjectId(rider.id),
    offeredAt: dispatchedAt,
    respondedAt: null,
    response: 'pending',
    round,
  }));

  const updated = await BookingModel.findOneAndUpdate(
    {
      _id: bookingId,
      status: 'SEARCHING',
      rider: null,
      offerRound: booking.offerRound ?? 0,
      updatedAt: booking.updatedAt,
      $or: [
        { offerExpiresAt: null },
        { offerExpiresAt: { $lte: dispatchedAt } },
        { offers: { $not: { $elemMatch: { response: 'pending' } } } },
      ],
    },
    [{
      $set: {
        offers: { $concatArrays: [expirePendingOffers(dispatchedAt), { $literal: offers }] },
        nearbyRiderCount: new Set(nearby.map((rider) => rider.id)).size,
        offerRound: round,
        offerExpiresAt,
      },
    }],
    { new: true },
  );
  if (!updated) return;

  await closeOffersForRiders(booking.offers ?? []);
  await pushBookingState(bookingId);
  if (!candidates.length) return;

  const populated = await getBookingDocument(bookingId);
  if (!populated || populated.status !== 'SEARCHING' || populated.offerRound !== round) return;
  const riderView = await serializeBooking(populated, 'rider');

  const io = getIo();
  for (const rider of candidates) {
    io?.to(rooms.rider(rider.id)).emit('booking:new', {
      ...riderView,
      offerExpiresAt,
    });
    await notifyRecipient({
      recipientRole: 'rider',
      recipientId: rider.id,
      title: 'New ride request',
      body: `${updated.pickup.label} → ${updated.destination.label} · ₹${updated.fare?.estimated ?? 0}`,
      type: 'ride_request',
      data: { bookingId },
    });
  }
}

export async function expireBooking(bookingId: string, expectedRound?: number) {
  const now = new Date();
  const booking = await BookingModel.findOneAndUpdate(
    {
      _id: bookingId,
      status: 'SEARCHING',
      rider: null,
      ...(expectedRound !== undefined ? { offerRound: expectedRound } : {}),
      $or: [
        { searchDeadlineAt: null },
        { searchDeadlineAt: { $lte: now } },
        {
          offerRound: { $gte: env.RIDE_REQUEST_MAX_ROUNDS },
          $or: [
            { offerExpiresAt: null },
            { offerExpiresAt: { $lte: now } },
            { offers: { $not: { $elemMatch: { response: 'pending' } } } },
          ],
        },
      ],
    },
    [{
      $set: {
        status: 'EXPIRED',
        offerExpiresAt: null,
        offers: expirePendingOffers(now),
        'statusTimestamps.expiredAt': now,
      },
    }],
    { new: true },
  );
  if (!booking) return;

  await logRideActivity({
    bookingId,
    status: 'EXPIRED',
    actorRole: 'system',
    note: 'No rider accepted before the search window ended',
  });

  await notifyRecipient({
    recipientRole: 'customer',
    recipientId: String(booking.customer),
    title: 'No riders available',
    body: 'We could not find a rider nearby in time. Please try again in a few minutes.',
    type: 'ride_expired',
    data: { bookingId },
  });

  await closeOffersForRiders(booking.offers ?? []);
  await pushBookingState(bookingId);
  await notifyAdmins('admin:booking', { id: bookingId, status: 'EXPIRED' });
}

export async function rejectBooking(bookingId: string, riderId: string, reason?: string) {
  const now = new Date();
  const booking = await BookingModel.findOneAndUpdate(
    {
      _id: bookingId,
      status: 'SEARCHING',
      rider: null,
      offerExpiresAt: { $gt: now },
      searchDeadlineAt: { $gt: now },
      offers: { $elemMatch: { rider: riderId, response: 'pending' } },
    },
    {
      $set: { 'offers.$.response': 'rejected', 'offers.$.respondedAt': now },
      $addToSet: { declinedRiders: riderId },
    },
    { new: true },
  );
  if (!booking) {
    throw HttpError.conflict('This offer has expired, was answered, or was not offered to you', 'OFFER_UNAVAILABLE');
  }

  await pushBookingState(bookingId);
  await logRideActivity({
    bookingId,
    status: 'SEARCHING',
    actorRole: 'rider',
    actorId: riderId,
    note: reason?.trim() ? `Rider declined: ${reason.trim()}` : 'Rider declined the request',
  });

  if (!(booking.offers ?? []).some((offer) => offer.response === 'pending')) {
    await offerToRiders(bookingId, (booking.offerRound ?? 0) + 1).catch((error) =>
      console.error('[booking] redispatch after rejection failed:', error.message),
    );
  }
}

export async function acceptBooking(bookingId: string, riderId: string) {
  const rider = await RiderModel.findById(riderId);
  if (!rider) throw HttpError.unauthorized();
  if (rider.status !== 'approved') {
    throw HttpError.forbidden('Your rider account is not approved yet');
  }
  if (!rider.isOnline) {
    throw HttpError.conflict('Go online before accepting rides', 'RIDER_OFFLINE');
  }

  const before = await BookingModel.findOne({
    _id: bookingId,
    status: 'SEARCHING',
    rider: null,
    offerExpiresAt: { $gt: new Date() },
    searchDeadlineAt: { $gt: new Date() },
    offers: { $elemMatch: { rider: riderId, response: 'pending' } },
  }).select('offers pickup destination customer fare offerRound');
  if (!before) {
    throw HttpError.conflict('This offer has expired, was answered, or was not offered to you', 'OFFER_UNAVAILABLE');
  }
  const active = await BookingModel.findOne({
    rider: riderId,
    status: { $in: ACTIVE_RIDE_STATUSES },
  }).select('_id');
  if (active) throw HttpError.conflict('You already have an active ride', 'RIDER_BUSY');

  const claimed = await RiderModel.findOneAndUpdate(
    { _id: riderId, status: 'approved', isOnline: true, currentBooking: null },
    { $set: { currentBooking: bookingId } },
    { new: true },
  );
  if (!claimed) {
    throw HttpError.conflict('You already have an active ride', 'RIDER_BUSY');
  }

  let booking;
  try {
    const now = new Date();
    const riderObjectId = new Types.ObjectId(riderId);
    booking = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'SEARCHING',
        rider: null,
        offerRound: before.offerRound,
        offerExpiresAt: { $gt: now },
        searchDeadlineAt: { $gt: now },
        offers: { $elemMatch: { rider: riderId, response: 'pending', round: before.offerRound } },
      },
      [{
        $set: {
          status: 'ACCEPTED',
          rider: riderObjectId,
          offers: {
            $map: {
              input: { $ifNull: ['$offers', []] },
              as: 'offer',
              in: {
                $cond: [
                  { $eq: ['$$offer.response', 'pending'] },
                  {
                    $mergeObjects: ['$$offer', {
                      response: {
                        $cond: [{ $eq: ['$$offer.rider', riderObjectId] }, 'accepted', 'expired'],
                      },
                      respondedAt: now,
                    }],
                  },
                  '$$offer',
                ],
              },
            },
          },
          offerExpiresAt: null,
          'statusTimestamps.acceptedAt': now,
        },
      }],
      { new: true },
    );
  } catch (error) {
    await RiderModel.updateOne(
      { _id: riderId, currentBooking: bookingId },
      { $set: { currentBooking: null } },
    );
    throw error;
  }

  if (!booking) {
    await RiderModel.updateOne(
      { _id: riderId, currentBooking: bookingId },
      { $set: { currentBooking: null } },
    );
    throw HttpError.conflict('Another rider already accepted this ride', 'RIDE_TAKEN');
  }

  await logRideActivity({
    bookingId,
    status: 'ACCEPTED',
    actorRole: 'rider',
    actorId: riderId,
    note: `${rider.name} accepted the ride`,
  });

  await notifyRecipient({
    recipientRole: 'customer',
    recipientId: String(booking.customer),
    title: 'Rider assigned',
    body: `${rider.name} is on the way to ${before.pickup.label}.`,
    type: 'ride_accepted',
    data: { bookingId },
  });

  await notifyRecipient({
    recipientRole: 'rider',
    recipientId: riderId,
    title: 'Ride accepted',
    body: `Head to ${before.pickup.label} to pick up your customer.`,
    type: 'ride_assigned',
    data: { bookingId },
  });

  await closeOffersForRiders(booking.offers ?? [], riderId);
  await pushBookingState(bookingId);
  await notifyAdmins('admin:booking', { id: bookingId, status: 'ACCEPTED', riderId });

  const view = await getBookingForActor(bookingId, 'rider', riderId);
  return view;
}

async function riderTransition(
  bookingId: string,
  riderId: string,
  allowed: RideStatus[],
  next: RideStatus,
  timestampField: string,
  note: string,
) {
  const set: Record<string, unknown> = {
    status: next,
    [`statusTimestamps.${timestampField}`]: new Date(),
  };
  if (next === 'RIDER_ARRIVING') set['statusTimestamps.riderArrivingAt'] = new Date();

  const booking = await BookingModel.findOneAndUpdate(
    { _id: bookingId, rider: riderId, status: { $in: allowed } },
    { $set: set },
    { new: true },
  );
  if (!booking) {
    throw HttpError.conflict(
      `This ride cannot move to ${next} from its current state`,
      'INVALID_RIDE_STATE',
    );
  }

  await logRideActivity({
    bookingId,
    status: next,
    actorRole: 'rider',
    actorId: riderId,
    note,
  });

  await pushBookingState(bookingId);
  await notifyAdmins('admin:booking', { id: bookingId, status: next });
  return booking;
}

export async function markRiderArriving(bookingId: string, riderId: string) {
  const existing = await BookingModel.findOne({ _id: bookingId, rider: riderId });
  if (existing?.status === 'RIDER_ARRIVING') {
    return getBookingForActor(bookingId, 'rider', riderId);
  }
  await riderTransition(
    bookingId,
    riderId,
    ['ACCEPTED'],
    'RIDER_ARRIVING',
    'riderArrivingAt',
    'Rider started moving to the pickup point',
  );
  await notifyRecipient({
    recipientRole: 'customer',
    recipientId: String((await BookingModel.findById(bookingId))?.customer),
    title: 'Rider is on the way',
    body: 'You can follow your rider live on the map.',
    type: 'ride_arriving',
    data: { bookingId },
    push: false,
  });
  return getBookingForActor(bookingId, 'rider', riderId);
}

export async function markRiderArrived(bookingId: string, riderId: string) {
  await riderTransition(
    bookingId,
    riderId,
    ['ACCEPTED', 'RIDER_ARRIVING'],
    'RIDER_ARRIVED',
    'arrivedAt',
    'Rider reached the pickup point',
  );
  const booking = await BookingModel.findById(bookingId);
  if (booking) {
    await notifyRecipient({
      recipientRole: 'customer',
      recipientId: String(booking.customer),
      title: 'Your rider has arrived',
      body: 'Meet your rider at the pickup point.',
      type: 'ride_arrived',
      data: { bookingId },
    });
    await notifyRecipient({
      recipientRole: 'rider',
      recipientId: riderId,
      title: 'Waiting at pickup',
      body: 'Waiting charges apply after the free waiting window.',
      type: 'waiting',
      data: { bookingId },
      push: false,
    });
  }
  return getBookingForActor(bookingId, 'rider', riderId);
}

export async function startBooking(bookingId: string, riderId: string) {
  const booking = await BookingModel.findOneAndUpdate(
    { _id: bookingId, rider: riderId, status: 'RIDER_ARRIVED' },
    { $set: { status: 'IN_PROGRESS', 'statusTimestamps.startedAt': new Date() } },
    { new: true },
  );
  if (!booking) {
    throw HttpError.conflict('The ride can start only after you mark yourself arrived', 'INVALID_RIDE_STATE');
  }

  await logRideActivity({
    bookingId,
    status: 'IN_PROGRESS',
    actorRole: 'rider',
    actorId: riderId,
    note: 'Ride started',
  });

  await notifyRecipient({
    recipientRole: 'customer',
    recipientId: String(booking.customer),
    title: 'Ride started',
    body: 'Enjoy your trip. Share the live route with family if you like.',
    type: 'ride_started',
    data: { bookingId },
    push: false,
  });

  await pushBookingState(bookingId);
  await notifyAdmins('admin:booking', { id: bookingId, status: 'IN_PROGRESS' });
  return getBookingForActor(bookingId, 'rider', riderId);
}

export async function completeBooking(bookingId: string, riderId: string) {
  const booking = await BookingModel.findOne({
    _id: bookingId,
    rider: riderId,
    status: 'IN_PROGRESS',
  });
  if (!booking) {
    throw HttpError.conflict('Only an in-progress ride can be completed', 'INVALID_RIDE_STATE');
  }

  const config = await getFareConfig();
  const arrivedAt = booking.statusTimestamps?.arrivedAt;
  const startedAt = booking.statusTimestamps?.startedAt;
  const waitingMinutes =
    arrivedAt && startedAt
      ? Math.max(0, Math.floor((startedAt.getTime() - arrivedAt.getTime()) / 60_000))
      : 0;
  const billableWaiting = Math.max(0, waitingMinutes - config.waitingFreeMinutes);
  const waitingCharges = roundMoney(billableWaiting * config.waitingPerMinute);
  const subtotal =
    booking.fare.baseFare +
    booking.fare.distanceFare +
    booking.fare.timeFare +
    config.platformFee +
    waitingCharges;
  const finalFare = roundMoney(Math.max(config.minimumFare, subtotal));
  const minimumAdjustment = Math.max(0, finalFare - subtotal);
  const now = new Date();
  const transactionRef = `CASH-${booking.bookingCode}`;

  const completed = await BookingModel.findOneAndUpdate(
    { _id: bookingId, status: 'IN_PROGRESS', rider: riderId },
    {
      $set: {
        status: 'COMPLETED',
        'statusTimestamps.completedAt': now,
        'fare.final': finalFare,
        'fare.waitingCharges': waitingCharges,
        'fare.platformFee': config.platformFee,
        'fare.minimumAdjustment': minimumAdjustment,
        'fare.cancellationFee': 0,
        'payment.status': 'paid',
        'payment.amount': finalFare,
        'payment.method': 'cash',
        'payment.paidAt': now,
        'payment.transactionRef': transactionRef,
        waitingMinutes,
        finalDistanceMeters: booking.route.distanceMeters,
      },
    },
    { new: true },
  );
  if (!completed) {
    throw HttpError.conflict('This ride was already completed or cancelled', 'INVALID_RIDE_STATE');
  }

  await RiderModel.updateOne(
    { _id: riderId, currentBooking: bookingId },
    {
      $set: { currentBooking: null },
      $inc: { totalRides: 1, totalEarnings: finalFare },
    },
  );

  await PaymentModel.updateOne(
    { booking: bookingId, type: 'ride' },
    {
      $set: {
        customer: completed.customer,
        rider: riderId,
        amount: finalFare,
        method: 'cash',
        status: 'paid',
        transactionRef,
        collectedBy: 'rider',
        paidAt: now,
      },
    },
    { upsert: true },
  );

  await logRideActivity({
    bookingId,
    status: 'COMPLETED',
    actorRole: 'rider',
    actorId: riderId,
    note: 'Ride completed and cash collected',
    meta: { finalFare, waitingMinutes, distanceMeters: booking.route.distanceMeters },
  });

  await notifyRecipient({
    recipientRole: 'customer',
    recipientId: String(completed.customer),
    title: 'Trip completed',
    body: `Your fare is ₹${finalFare}. Thanks for riding with ${env.APP_NAME}.`,
    type: 'ride_completed',
    data: { bookingId, amount: String(finalFare) },
  });

  await notifyRecipient({
    recipientRole: 'rider',
    recipientId: riderId,
    title: 'Trip completed',
    body: `₹${finalFare} added to your earnings.`,
    type: 'ride_completed',
    data: { bookingId, amount: String(finalFare) },
    push: false,
  });

  await pushBookingState(bookingId);
  await notifyAdmins('admin:booking', { id: bookingId, status: 'COMPLETED' });

  return getBookingForActor(bookingId, 'rider', riderId);
}

export interface CancelActor {
  role: 'customer' | 'rider' | 'admin';
  id: string;
  reason?: string;
  expectedFee?: number;
  revision?: string;
}

function assertCancellationAllowed(booking: BookingDocument, actor: CancelActor) {
  if (actor.role === 'customer' && String(booking.customer) !== actor.id) {
    throw HttpError.forbidden('This booking belongs to another customer');
  }
  if (actor.role === 'rider' && String(booking.rider) !== actor.id) {
    throw HttpError.forbidden('This booking is assigned to another rider');
  }
  if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(booking.status)) {
    throw HttpError.conflict('This ride is already finished', 'RIDE_FINISHED');
  }
  if (actor.role !== 'admin' && booking.status === 'IN_PROGRESS') {
    throw HttpError.conflict(
      'A ride in progress can only be cancelled by support.',
      'RIDE_IN_PROGRESS',
    );
  }

}

function cancellationFee(booking: BookingDocument, actor: CancelActor, config: FareConfiguration) {
  const riderAssigned = Boolean(booking.rider);
  const riderOnWay = ['ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED'].includes(booking.status);
  return actor.role === 'customer' && riderAssigned && riderOnWay ? config.cancellationFee : 0;
}

export async function estimateBookingCancellation(bookingId: string, customerId: string) {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) throw HttpError.notFound('Booking not found');
  const actor: CancelActor = { role: 'customer', id: customerId };
  assertCancellationAllowed(booking, actor);
  const config = await getFareConfig();
  return {
    fee: cancellationFee(booking, actor, config),
    currency: config.currency || 'INR',
    status: booking.status,
    revision: booking.updatedAt.toISOString(),
  };
}

export async function cancelBooking(bookingId: string, actor: CancelActor) {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) throw HttpError.notFound('Booking not found');
  assertCancellationAllowed(booking, actor);
  const config = await getFareConfig();
  const fee = cancellationFee(booking, actor, config);
  if (actor.role === 'customer' && (actor.expectedFee !== undefined || actor.revision !== undefined)) {
    if (!Number.isFinite(actor.expectedFee) || actor.expectedFee !== fee ||
        actor.revision !== booking.updatedAt.toISOString()) {
      throw HttpError.conflict('The cancellation fee or ride state changed. Review a new estimate.', 'CANCELLATION_CHANGED');
    }
  }
  const now = new Date();

  const cancelled = await BookingModel.findOneAndUpdate(
    {
      _id: bookingId,
      status: booking.status,
      updatedAt: booking.updatedAt,
      rider: booking.rider ?? null,
      ...(actor.role === 'customer' ? { customer: actor.id } : {}),
    },
    {
      $set: {
        status: 'CANCELLED',
        'statusTimestamps.cancelledAt': now,
        'fare.cancellationFee': fee,
        cancellation: {
          byRole: actor.role,
          byId: actor.id,
          reason: actor.reason?.trim() || null,
          fee,
          at: now,
        },
        ...(fee > 0 ? { 'payment.amount': fee, 'payment.status': 'pending' } : {}),
      },
    },
    { new: true },
  );
  if (!cancelled) {
    throw HttpError.conflict('The ride state changed. Review a new cancellation estimate.', 'CANCELLATION_CHANGED');
  }

  if (booking.rider) {
    await RiderModel.updateOne(
      { _id: booking.rider, currentBooking: bookingId },
      { $set: { currentBooking: null } },
    );
  }

  if (fee > 0) {
    await PaymentModel.updateOne(
      { booking: bookingId, type: 'cancellation' },
      {
        $set: {
          customer: cancelled.customer,
          rider: cancelled.rider,
          amount: fee,
          method: 'cash',
          status: 'pending',
          collectedBy: 'rider',
        },
      },
      { upsert: true },
    );
  }

  await logRideActivity({
    bookingId,
    status: 'CANCELLED',
    actorRole: actor.role,
    actorId: actor.id,
    note: actor.reason?.trim() || `Cancelled by ${actor.role}`,
    meta: { fee },
  });

  const otherParty =
    actor.role === 'customer'
      ? cancelled.rider
        ? { role: 'rider' as const, id: String(cancelled.rider) }
        : null
      : { role: 'customer' as const, id: String(cancelled.customer) };

  if (otherParty && otherParty.id !== 'null') {
    await notifyRecipient({
      recipientRole: otherParty.role,
      recipientId: otherParty.id,
      title: 'Ride cancelled',
      body:
        actor.role === 'admin'
          ? 'Support cancelled this ride. Please check your bookings.'
          : `The ${actor.role === 'customer' ? 'customer' : 'rider'} cancelled this ride.`,
      type: 'ride_cancelled',
      data: { bookingId },
    });
  }

  await pushBookingState(bookingId);
  await notifyAdmins('admin:booking', { id: bookingId, status: 'CANCELLED' });

  return serializeBooking(await getBookingDocument(bookingId), actor.role);
}

/**
 * Returns an accepted ride to the dispatch queue instead of cancelling it, so the
 * customer keeps waiting for a bike rather than losing the booking.
 */
export async function releaseBooking(bookingId: string, riderId: string, reason?: string) {
  const now = new Date();
  const riderObjectId = new Types.ObjectId(riderId);
  const booking = await BookingModel.findOneAndUpdate(
    {
      _id: bookingId,
      rider: riderId,
      status: { $in: ['ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED'] },
    },
    [{
      $set: {
        rider: null,
        status: 'SEARCHING',
        offerRound: 0,
        offerExpiresAt: null,
        searchDeadlineAt: new Date(now.getTime() + env.BOOKING_SEARCH_MINUTES * 60_000),
        'statusTimestamps.searchingAt': now,
        'statusTimestamps.acceptedAt': null,
        'statusTimestamps.riderArrivingAt': null,
        'statusTimestamps.arrivedAt': null,
        declinedRiders: {
          $setUnion: [{ $ifNull: ['$declinedRiders', []] }, [riderObjectId]],
        },
        offers: {
          $map: {
            input: { $ifNull: ['$offers', []] },
            as: 'offer',
            in: {
              $cond: [
                { $in: ['$$offer.response', ['pending', 'accepted']] },
                { $mergeObjects: ['$$offer', { response: 'expired', respondedAt: now }] },
                '$$offer',
              ],
            },
          },
        },
      },
    }],
    { new: true },
  );
  if (!booking) {
    throw HttpError.conflict(
      'This ride has already started or is no longer assigned to you.',
      'RIDE_UNAVAILABLE',
    );
  }

  await RiderModel.updateOne(
    { _id: riderId, currentBooking: bookingId },
    { $set: { currentBooking: null } },
  );

  await logRideActivity({
    bookingId,
    status: 'SEARCHING',
    actorRole: 'rider',
    actorId: riderId,
    note: reason?.trim()
      ? `Rider released the ride: ${reason.trim()}`
      : 'Rider released the ride back to the queue',
  });

  await notifyRecipient({
    recipientRole: 'customer',
    recipientId: String(booking.customer),
    title: 'Finding you another rider',
    body: 'Your rider could not take this ride, so we are asking nearby riders again. Your booking is still active.',
    type: 'ride_redispatched',
    data: { bookingId },
  });

  await pushBookingState(bookingId);
  await offerToRiders(bookingId, 1).catch((error) =>
    console.error('[booking] redispatch after rider release failed:', error.message),
  );

  return serializeBooking(await getBookingDocument(bookingId), 'rider');
}

export async function pushBookingState(bookingId: string) {
  try {
    const booking = await getBookingDocument(bookingId);
    if (!booking) return;
    const [customerView, riderView, adminView] = await Promise.all([
      serializeBooking(booking, 'customer'),
      serializeBooking(booking, 'rider'),
      serializeBooking(booking, 'admin'),
    ]);
    const io = getIo();
    if (!io) return;
    const customerId = String((booking.customer as any)?._id ?? booking.customer);
    io.to(rooms.customer(customerId))
      .to(rooms.booking(bookingId))
      .emit('booking:update', customerView);
    if (booking.rider) {
      const riderId = String((booking.rider as any)?._id ?? booking.rider);
      io.to(rooms.rider(riderId)).emit('booking:update', riderView);
    }
    io.to(rooms.admin).emit('booking:update', adminView);
    io.to(rooms.admin).emit('admin:booking', { id: bookingId, status: booking.status });
  } catch (error) {
    console.error('[booking] failed to broadcast state:', (error as Error).message);
  }
}

export async function setRiderAvailability(
  riderId: string,
  isOnline: boolean,
  location?: { lat: number; lng: number },
) {
  const rider = await RiderModel.findById(riderId);
  if (!rider) throw HttpError.unauthorized();
  if (rider.status !== 'approved') {
    throw HttpError.forbidden('Your account must be approved before going online');
  }

  if (isOnline) {
    const coords = location
      ? toGeoPoint(location.lat, location.lng)
      : (rider.currentLocation as { coordinates?: number[] } | null);
    if (!coords?.coordinates?.length) {
      throw HttpError.badRequest('Share your GPS location before going online');
    }
    await assertBookablePoint(coords.coordinates[1], coords.coordinates[0]);
    rider.currentLocation = coords as typeof rider.currentLocation;
    rider.lastLocationAt = new Date();
  } else if (rider.currentBooking) {
    throw HttpError.conflict(
      'Finish or cancel your active ride before going offline',
      'ACTIVE_RIDE_EXISTS',
    );
  }

  rider.isOnline = isOnline;
  await rider.save();

  const io = getIo();
  io?.to(rooms.admin).emit('admin:rider-availability', {
    riderId,
    isOnline,
  });

  return {
    id: String(rider._id),
    isOnline: rider.isOnline,
    status: rider.status,
    currentLocation: rider.currentLocation
      ? {
          lat: (rider.currentLocation as any).coordinates[1],
          lng: (rider.currentLocation as any).coordinates[0],
        }
      : null,
  };
}

export interface LocationInput {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

export async function handleRiderLocation(riderId: string, input: LocationInput) {
  if (!isValidLatLng(input.lat, input.lng)) {
    throw HttpError.badRequest('Invalid GPS coordinates');
  }
  const rider = await RiderModel.findById(riderId).select(
    'status isOnline currentBooking currentLocation',
  );
  if (!rider) throw HttpError.unauthorized();
  if (!rider.isOnline && !rider.currentBooking) return null;

  const now = new Date();
  await RiderModel.updateOne(
    { _id: riderId },
    {
      $set: {
        currentLocation: toGeoPoint(input.lat, input.lng),
        lastLocationAt: now,
      },
    },
  );

  const io = getIo();
  let bookingId: string | null = null;
  if (rider.currentBooking) {
    const booking = await BookingModel.findOne({
      _id: rider.currentBooking,
      rider: riderId,
      status: { $in: ['ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED', 'IN_PROGRESS'] },
    }).select('customer status');
    if (booking) {
      bookingId = String(booking._id);
      await RideLocationModel.create({
        booking: booking._id,
        rider: riderId,
        location: toGeoPoint(input.lat, input.lng),
        heading: input.heading ?? null,
        speed: input.speed ?? null,
        accuracy: input.accuracy ?? null,
        recordedAt: now,
      });
      const payload = {
        bookingId,
        riderId,
        lat: input.lat,
        lng: input.lng,
        heading: input.heading ?? null,
        speed: input.speed ?? null,
        recordedAt: now,
      };
      io?.to(rooms.booking(bookingId))
        .to(rooms.customer(String(booking.customer)))
        .to(rooms.admin)
        .emit('rider:location', payload);
    }
  }

  io?.to(rooms.admin).emit('admin:rider-location', {
    riderId,
    lat: input.lat,
    lng: input.lng,
    bookingId,
    recordedAt: now,
  });
  return { bookingId };
}

let sweeper: NodeJS.Timeout | null = null;

export async function runDispatchSweep() {
  const now = new Date();
  const due = await BookingModel.find({
    status: 'SEARCHING',
    $or: [{ offerExpiresAt: null }, { offerExpiresAt: { $lte: now } }],
  })
    .select('_id offerRound searchDeadlineAt')
    .limit(50);

  for (const booking of due) {
    if (!booking.searchDeadlineAt || booking.searchDeadlineAt <= now) {
      await expireBooking(String(booking._id), booking.offerRound ?? 0);
      continue;
    }
    if ((booking.offerRound ?? 0) >= env.RIDE_REQUEST_MAX_ROUNDS) {
      await expireBooking(String(booking._id), booking.offerRound ?? 0);
      continue;
    }
    try {
      await offerToRiders(String(booking._id), (booking.offerRound ?? 0) + 1);
    } catch (error) {
      console.error('[booking] sweep dispatch failed:', (error as Error).message);
    }
  }
}

export function startDispatchSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    runDispatchSweep().catch((error) =>
      console.error('[booking] dispatch sweep failed:', error.message),
    );
  }, 10_000);
  sweeper.unref?.();
  void runDispatchSweep().catch((error) =>
    console.error('[booking] initial dispatch sweep failed:', error.message),
  );
}

export function stopDispatchSweeper() {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
