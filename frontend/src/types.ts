export type Role = 'customer' | 'rider' | 'admin';

export type RideStatus =
  | 'SEARCHING'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'RIDER_ARRIVING'
  | 'RIDER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type RiderStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type DocumentKind = 'licence' | 'aadhaar' | 'rc' | 'insurance' | 'permit' | 'other';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  label: string;
  address?: string | null;
}

export interface LineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface GeoBoundary {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface UserProfile {
  id: string;
  name: string;
  mobile: string;
  photoUrl: string | null;
  role?: Role;
  status?: RiderStatus;
  rejectionReason?: string | null;
  suspendedReason?: string | null;
  isOnline?: boolean;
  isBlocked?: boolean;
  rating?: number;
  ratingCount?: number;
  totalRides?: number;
  totalEarnings?: number;
  needsApproval?: boolean;
  vehicle?: Vehicle | null;
  documents?: RiderDocument[];
  stats?: { rides: number; completed: number; active: number };
  createdAt?: string;
}

export interface Session {
  token: string;
  role: Role;
  user: UserProfile;
}

export interface Vehicle {
  type: 'bike' | 'scooter';
  make: string;
  model: string;
  registrationNumber: string;
  color?: string | null;
  year?: number | null;
  photoUrl?: string | null;
}

export interface RiderDocument {
  id: string;
  kind: DocumentKind;
  number?: string | null;
  frontUrl: string;
  backUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  note?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string;
}

export interface RiderSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  rating: number;
  ratingCount: number;
  totalRides: number;
  status?: RiderStatus;
  isOnline?: boolean;
  mobile: string | null;
  location?: LatLng | null;
  vehicle?: Vehicle | null;
}

export interface CustomerSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  mobile: string | null;
}

export interface FareBreakdown {
  estimated: number;
  final: number | null;
  cancellationFee: number;
  waitingCharges: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  platformFee: number;
  minimumAdjustment: number;
  total: number;
  currency: string;
}

export interface Booking {
  id: string;
  code: string;
  status: RideStatus;
  customer: CustomerSummary | null;
  rider: RiderSummary | null;
  pickup: Place;
  destination: Place;
  route: {
    distanceMeters: number;
    durationSeconds: number;
    geometry: LineString | null;
    provider: string | null;
    isEstimate: boolean;
  };
  fare: FareBreakdown;
  payment: {
    method: 'cash' | 'online';
    status: 'pending' | 'paid' | 'failed' | 'refunded';
    amount?: number | null;
    transactionRef?: string | null;
    paidAt?: string | null;
  };
  timestamps: Partial<
    Record<
      | 'searchingAt'
      | 'acceptedAt'
      | 'riderArrivingAt'
      | 'arrivedAt'
      | 'startedAt'
      | 'completedAt'
      | 'cancelledAt'
      | 'expiredAt',
      string | null
    >
  >;
  cancellation: {
    byRole: Role;
    reason?: string | null;
    fee: number;
    at: string;
  } | null;
  waitingMinutes: number;
  searchDeadlineAt: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  offers?: { rider: string; response: string; offeredAt: string; respondedAt: string | null; round: number }[];
  declinedRiders?: string[];
  finalDistanceMeters?: number | null;
  customerNote?: string | null;
}

export interface NearbyRider {
  id: string;
  name: string;
  photoUrl: string | null;
  rating: number;
  totalRides: number;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export interface RouteEstimate {
  route: {
    distanceMeters: number;
    durationSeconds: number;
    geometry: LineString;
    provider: string;
    isEstimate: boolean;
  };
  fare: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    waitingCharges: number;
    platformFee: number;
    subtotal: number;
    minimumAdjustment: number;
    estimated: number;
    currency: string;
  };
  currency: string;
  paymentMethod: string;
}

export interface PlaceResult extends LatLng {
  label: string;
  address: string;
  type: string;
  insideServiceArea: boolean;
}

export interface SavedLocation extends Place {
  id: string;
}

export interface PublicConfig {
  app: {
    name: string;
    currency: string;
    supportPhone: string | null;
    supportEmail: string;
  };
  fare: {
    baseFare: number;
    perKm: number;
    perMinute: number;
    minimumFare: number;
    waitingFreeMinutes: number;
    waitingPerMinute: number;
    cancellationFee: number;
    platformFee: number;
    currency: string;
  };
  serviceArea: {
    name: string;
    center: LatLng;
    isAvailable: boolean;
    unavailableMessage: string | null;
  };
  map: { styleUrl: string | null; pmtilesUrl: string | null };
  routing: { selfHosted: boolean };
}

export interface ServiceAreaInfo {
  name: string;
  description: string | null;
  boundary: GeoBoundary;
  center: LatLng;
  isAvailable: boolean;
  unavailableMessage: string | null;
  source: string;
  sourceUrl: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
}

export interface AdminStats {
  customers: number;
  riders: number;
  approvedRiders: number;
  onlineRiders: number;
  offlineRiders: number;
  pendingRiders: number;
  suspendedRiders: number;
  activeRides: number;
  completedRides: number;
  cancelledRides: number;
  totalRides: number;
  revenueTotal: number;
  revenueToday: number;
  completedToday: number;
  ridesToday: number;
  cancelledToday: number;
}

export interface AdminRiderListItem {
  id: string;
  name: string;
  mobile: string;
  photoUrl: string | null;
  status: RiderStatus;
  isOnline: boolean;
  rejectionReason?: string | null;
  suspendedReason?: string | null;
  rating: number;
  ratingCount: number;
  totalRides: number;
  totalEarnings: number;
  currentBooking: string | null;
  location: LatLng | null;
  lastLocationAt: string | null;
  createdAt: string;
  documents: { kind: DocumentKind; status: string; updatedAt: string }[];
}

export interface AdminRiderDetail {
  rider: AdminRiderListItem;
  vehicle: Vehicle | null;
  documents: RiderDocument[];
  recentRides: Booking[];
  totalBookings: number;
}

export interface AdminCustomer {
  id: string;
  name: string;
  mobile: string;
  photoUrl: string | null;
  isBlocked: boolean;
  rides: number;
  completed: number;
  spent: number;
  createdAt: string;
}

export interface Paged<T> {
  total: number;
  page: number;
  pages: number;
  rides?: T[];
  riders?: T[];
  customers?: T[];
}

export interface FareConfig {
  _id?: string;
  name?: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  waitingFreeMinutes: number;
  waitingPerMinute: number;
  cancellationFee: number;
  platformFee: number;
  currency: string;
  isActive?: boolean;
  updatedAt?: string;
}

export interface EarningsSummary {
  range: 'today' | 'week' | 'month';
  rides: number;
  amount: number;
  distanceMeters: number;
  daily: { date: string; rides: number; amount: number }[];
}

export interface ReportSeries {
  days: number;
  series: {
    date: string;
    bookings: number;
    cancelled: number;
    completed: number;
    revenue: number;
    distanceKm: number;
  }[];
  totals: {
    bookings: number;
    completed: number;
    cancelled: number;
    revenue: number;
    distanceKm: number;
  };
}

export interface LiveSnapshot {
  serverTime: string;
  rides: Booking[];
  riders: AdminRiderListItem[];
}

export interface ActivityLog {
  id: string;
  status: RideStatus;
  actorRole: Role;
  note: string | null;
  createdAt: string;
}

export type MapNoteType = 'landmark' | 'road' | 'closure' | 'other';

export interface MapNote extends LatLng {
  id: string;
  label: string;
  description: string | null;
  type: MapNoteType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
