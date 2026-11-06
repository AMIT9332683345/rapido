export const RIDE_STATUSES = [
  'SEARCHING',
  'REQUESTED',
  'ACCEPTED',
  'RIDER_ARRIVING',
  'RIDER_ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'SEARCHING',
  'REQUESTED',
  'ACCEPTED',
  'RIDER_ARRIVING',
  'RIDER_ARRIVED',
  'IN_PROGRESS',
];

export const RIDER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const DOCUMENT_KINDS = [
  'licence',
  'aadhaar',
  'rc',
  'insurance',
  'permit',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const PAYMENT_METHODS = ['cash', 'online'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
