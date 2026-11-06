import type { Query } from 'mongoose';
import { VehicleModel } from '../models/Vehicle.js';

type Role = 'customer' | 'rider' | 'admin';

const CUSTOMER_SELECT = 'name mobile photoUrl createdAt';
const RIDER_SELECT =
  'name mobile photoUrl rating ratingCount totalRides status isOnline currentLocation currentBooking createdAt';

export function populateBooking<T extends Query<unknown, unknown>>(query: T): T {
  return query
    .populate('customer', CUSTOMER_SELECT)
    .populate('rider', RIDER_SELECT) as T;
}

function placeView(place: {
  label?: string;
  address?: string | null;
  location?: { coordinates?: number[] };
}) {
  const coords = place?.location?.coordinates ?? [0, 0];
  return {
    label: place?.label ?? '',
    address: place?.address ?? null,
    lat: coords[1],
    lng: coords[0],
  };
}

function customerView(customer: any, includeMobile: boolean) {
  if (!customer) return null;
  return {
    id: String(customer._id ?? customer),
    name: customer.name ?? '',
    photoUrl: customer.photoUrl ?? null,
    mobile: includeMobile ? (customer.mobile ?? null) : null,
  };
}

function riderView(rider: any, includeMobile: boolean) {
  if (!rider) return null;
  const coords = rider.currentLocation?.coordinates;
  return {
    id: String(rider._id ?? rider),
    name: rider.name ?? '',
    photoUrl: rider.photoUrl ?? null,
    rating: rider.rating ?? 5,
    ratingCount: rider.ratingCount ?? 0,
    totalRides: rider.totalRides ?? 0,
    status: rider.status,
    isOnline: rider.isOnline ?? false,
    mobile: includeMobile ? (rider.mobile ?? null) : null,
    location:
      Array.isArray(coords) && coords.length === 2
        ? { lat: coords[1], lng: coords[0] }
        : null,
    vehicle: null as null | Record<string, unknown>,
  };
}

export async function vehicleForRider(riderId: unknown) {
  if (!riderId) return null;
  return VehicleModel.findOne({ rider: riderId }).lean();
}

export async function serializeBooking(booking: any, role: Role) {
  const riderRaw = booking.rider;
  const riderId = riderRaw?._id ?? riderRaw;
  const vehicle = riderId ? await vehicleForRider(riderId) : null;

  const rider = riderView(riderRaw, true);
  if (rider) {
    rider.vehicle = vehicle
      ? {
          type: vehicle.type,
          make: vehicle.make,
          model: vehicle.model,
          registrationNumber: vehicle.registrationNumber,
          color: vehicle.color ?? null,
          photoUrl: vehicle.photoUrl ?? null,
        }
      : null;
  }

  const showCustomerMobile =
    role === 'admin' ||
    role === 'customer' ||
    (role === 'rider' &&
      Boolean(booking.rider) &&
      !['SEARCHING', 'REQUESTED'].includes(booking.status));
  const customer = customerView(booking.customer, showCustomerMobile);
  const fare = booking.fare ?? {};
  const total =
    booking.status === 'COMPLETED'
      ? fare.final ?? fare.estimated ?? 0
      : booking.status === 'CANCELLED'
        ? fare.cancellationFee ?? 0
        : fare.estimated ?? 0;

  const view: Record<string, unknown> = {
    id: String(booking._id),
    code: booking.bookingCode,
    status: booking.status,
    customer,
    rider,
    pickup: placeView(booking.pickup),
    destination: placeView(booking.destination),
    route: {
      distanceMeters: booking.route?.distanceMeters ?? 0,
      durationSeconds: booking.route?.durationSeconds ?? 0,
      geometry: booking.route?.geometry ?? null,
      provider: booking.route?.provider ?? null,
      isEstimate: booking.route?.isEstimate ?? false,
    },
    fare: {
      estimated: fare.estimated ?? 0,
      final: fare.final ?? null,
      cancellationFee: fare.cancellationFee ?? 0,
      waitingCharges: fare.waitingCharges ?? 0,
      baseFare: fare.baseFare ?? 0,
      distanceFare: fare.distanceFare ?? 0,
      timeFare: fare.timeFare ?? 0,
      platformFee: fare.platformFee ?? 0,
      minimumAdjustment: fare.minimumAdjustment ?? 0,
      total,
      currency: fare.currency ?? 'INR',
    },
    payment: {
      method: booking.payment?.method ?? 'cash',
      status: booking.payment?.status ?? 'pending',
      amount: booking.payment?.amount ?? null,
      transactionRef: booking.payment?.transactionRef ?? null,
      paidAt: booking.payment?.paidAt ?? null,
    },
    timestamps: booking.statusTimestamps ?? {},
    cancellation: booking.cancellation ?? null,
    waitingMinutes: booking.waitingMinutes ?? 0,
    searchDeadlineAt: booking.searchDeadlineAt ?? null,
    offerExpiresAt: booking.offerExpiresAt ?? null,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };

  if (role === 'admin') {
    view.offers = (booking.offers ?? []).map((offer: any) => ({
      rider: String(offer.rider?._id ?? offer.rider),
      response: offer.response,
      offeredAt: offer.offeredAt,
      respondedAt: offer.respondedAt,
      round: offer.round,
    }));
    view.declinedRiders = (booking.declinedRiders ?? []).map(String);
    view.finalDistanceMeters = booking.finalDistanceMeters ?? null;
    view.customerNote = booking.customerNote ?? null;
  }

  if (role === 'rider') {
    view.payment = {
      method: booking.payment?.method ?? 'cash',
      status: booking.payment?.status ?? 'pending',
      amount: booking.payment?.amount ?? null,
    };
  }

  return view;
}

export function riderListItem(rider: any) {
  const coords = rider.currentLocation?.coordinates;
  return {
    id: String(rider._id),
    name: rider.name,
    mobile: rider.mobile,
    photoUrl: rider.photoUrl ?? null,
    status: rider.status,
    isOnline: rider.isOnline ?? false,
    rejectionReason: rider.rejectionReason ?? null,
    suspendedReason: rider.suspendedReason ?? null,
    rating: rider.rating ?? 5,
    ratingCount: rider.ratingCount ?? 0,
    totalRides: rider.totalRides ?? 0,
    totalEarnings: rider.totalEarnings ?? 0,
    currentBooking: rider.currentBooking ? String(rider.currentBooking) : null,
    location:
      Array.isArray(coords) && coords.length === 2
        ? { lat: coords[1], lng: coords[0] }
        : null,
    lastLocationAt: rider.lastLocationAt ?? null,
    createdAt: rider.createdAt,
  };
}

export function nearbyRiderView(rider: any, distanceMeters: number) {
  const coords = rider.currentLocation?.coordinates ?? [0, 0];
  return {
    id: String(rider._id),
    name: rider.name,
    photoUrl: rider.photoUrl ?? null,
    rating: rider.rating ?? 5,
    totalRides: rider.totalRides ?? 0,
    lat: coords[1],
    lng: coords[0],
    distanceMeters,
  };
}
