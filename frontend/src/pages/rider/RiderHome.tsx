import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  ClipboardCheck,
  Clock3,
  FileWarning,
  LocateFixed,
  MapPin,
  Navigation,
  Power,
  RefreshCw,
  ShieldAlert,
  Star,
  Timer,
  Wallet,
  X,
} from 'lucide-react';
import MapView, { type MapMarker } from '../../components/MapView';
import NotificationsButton from '../../components/NotificationsButton';
import { MapTopBar } from '../../components/layout';
import { RouteStats } from '../../components/ride';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FullPageLoader,
  StatusPill,
  Switch,
  cn,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { km, minutes, money, relativeTime } from '../../lib/format';
import { useCountdown, useQuery } from '../../lib/useQuery';
import { useRiderGps } from '../../lib/useRiderGps';
import type { Booking, EarningsSummary, RiderDocument, RiderStatus, Vehicle } from '../../types';

interface RiderProfile {
  id: string;
  name: string;
  mobile: string;
  photoUrl: string | null;
  status: RiderStatus;
  rejectionReason: string | null;
  suspendedReason: string | null;
  isOnline: boolean;
  rating: number;
  ratingCount: number;
  totalRides: number;
  totalEarnings: number;
  currentBooking: string | null;
  vehicle: Vehicle | null;
  documents: RiderDocument[];
}

const REQUIRED_DOCS = ['licence', 'aadhaar', 'rc'] as const;

export default function RiderHome() {
  const { user, mergeUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const profileQuery = useQuery<RiderProfile>(
    (signal) => api.get<RiderProfile>('/rider/profile', { signal }),
    [],
  );
  const profile = profileQuery.data;

  const activeQuery = useQuery<{ booking: Booking | null }>(
    (signal) => api.get<{ booking: Booking | null }>('/rider/bookings/active', { signal }),
    [],
  );
  const active = activeQuery.data?.booking ?? null;

  const earningsQuery = useQuery<EarningsSummary>(
    (signal) => api.get<EarningsSummary>('/rider/earnings?range=today', { signal }),
    [],
  );

  const online = Boolean(profile?.isOnline);
  const approved = profile?.status === 'approved';
  const hasActiveRide = Boolean(active);

  const gps = useRiderGps({
    tracking: online || hasActiveRide,
    broadcast: online || hasActiveRide,
  });

  const [request, setRequest] = useState<Booking | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const requestQuery = useQuery<{ booking: Booking | null }>(
    (signal) => api.get<{ booking: Booking | null }>('/rider/requests/current', { signal }),
    [online, approved],
    { enabled: Boolean(online && approved && !active) },
  );

  useEffect(() => {
    if (requestQuery.data?.booking) setRequest(requestQuery.data.booking);
  }, [requestQuery.data]);

  useEffect(() => {
    if (!online || !approved || active) {
      setRequest(null);
      return;
    }
    const timer = window.setInterval(requestQuery.reload, 12000);
    return () => window.clearInterval(timer);
  }, [online, approved, active?.id]);

  useSocketEvent<Booking>('booking:new', (payload) => {
    if (payload?.id && !active) setRequest(payload);
  });

  useSocketEvent<Booking>('booking:update', (payload) => {
    if (!payload?.id) return;
    if (active && payload.id === active.id) activeQuery.setData({ booking: payload });
    if (payload.status === 'CANCELLED' || payload.status === 'EXPIRED' || payload.status === 'COMPLETED') {
      activeQuery.reload();
      profileQuery.reload();
      earningsQuery.reload();
    }
    if (['ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED', 'IN_PROGRESS'].includes(payload.status)) {
      activeQuery.reload();
    }
    if (request && payload.id === request.id && payload.status !== 'SEARCHING') {
      setRequest(null);
    }
  });

  useEffect(() => {
    if (gps.error) toast.warning(gps.error, 'Location');
    // Only surface a new error once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.error]);

  const offerCountdown = useCountdown(request?.offerExpiresAt ?? null);

  useEffect(() => {
    if (request && request.offerExpiresAt && offerCountdown <= 0) {
      setRequest(null);
    }
  }, [offerCountdown, request]);

  const toggleOnline = async (next: boolean) => {
    if (!profile) return;
    if (profile.status !== 'approved') {
      toast.warning('Your rider account must be approved before going online.', 'Approval pending');
      return;
    }
    if (!gps.position && next) {
      try {
        const coords = await gps.refresh();
        if (!coords) return;
      } catch (error) {
        toast.error(errorMessage(error), 'Location needed');
        return;
      }
    }
    setToggling(true);
    try {
      const coords = gps.position ?? (await gps.refresh());
      await api.patch('/rider/availability', {
        isOnline: next,
        location: coords ? { lat: coords.lat, lng: coords.lng } : undefined,
      });
      profileQuery.reload();
      mergeUser({ isOnline: next });
      toast.success(
        next ? 'You are online. Nearby requests will appear here.' : 'You are offline. No new requests.',
        next ? 'Online' : 'Offline',
      );
      if (next) requestQuery.reload();
    } catch (error) {
      toast.error(errorMessage(error), 'Could not change availability');
    } finally {
      setToggling(false);
    }
  };

  const accept = async () => {
    if (!request) return;
    setAccepting(true);
    try {
      const result = await api.post<{ booking: Booking }>(`/rider/bookings/${request.id}/accept`);
      setRequest(null);
      toast.success('Ride accepted. Head to the pickup point.', 'You got it');
      navigate(`/rider/ride/${result.booking.id}`);
    } catch (error) {
      toast.error(errorMessage(error), 'Could not accept');
      setRequest(null);
      requestQuery.reload();
    } finally {
      setAccepting(false);
    }
  };

  const reject = async () => {
    if (!request) return;
    setRejecting(true);
    try {
      await api.post(`/rider/bookings/${request.id}/reject`, { reason: 'Not available' });
      setRequest(null);
      toast.info('Request declined. It will be offered to another rider.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not decline');
    } finally {
      setRejecting(false);
    }
  };

  const verificationDocs = useMemo(() => {
    const docs = profile?.documents ?? [];
    return REQUIRED_DOCS.map((kind) => {
      const doc = docs.find((item) => item.kind === kind);
      return { kind, status: doc?.status ?? 'missing' as const };
    });
  }, [profile?.documents]);

  const markers = useMemo<MapMarker[]>(() => {
    const items: MapMarker[] = [];
    if (gps.position) {
      items.push({
        id: 'self',
        kind: 'rider',
        lat: gps.position.lat,
        lng: gps.position.lng,
        label: 'You',
      });
    }
    const focus = active ?? request;
    if (focus) {
      items.push({
        id: 'pickup',
        kind: 'pickup',
        lat: focus.pickup.lat,
        lng: focus.pickup.lng,
        label: 'Pickup',
      });
      items.push({
        id: 'destination',
        kind: 'destination',
        lat: focus.destination.lat,
        lng: focus.destination.lng,
        label: 'Drop',
      });
    }
    return items;
  }, [gps.position?.lat, gps.position?.lng, active?.id, request?.id]);

  if (profileQuery.loading && !profile) {
    return (
      <div className="grid h-full place-items-center">
        <FullPageLoader label="Loading rider dashboard…" />
      </div>
    );
  }

  if (profileQuery.error || !profile) {
    return (
      <div className="grid h-full place-items-center px-5">
        <EmptyState
          icon={<FileWarning size={22} />}
          title="Could not load your rider account"
          body={profileQuery.error ?? 'Try signing in again.'}
          action={
            <Button variant="outline" onClick={profileQuery.reload}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const showMap = approved;

  return (
    <div className="relative h-full overflow-hidden">
      {showMap ? (
        <MapView
          center={gps.position ?? active?.pickup ?? request?.pickup ?? undefined}
          markers={markers}
          route={active?.route.geometry ?? null}
          self={gps.position ? { lat: gps.position.lat, lng: gps.position.lng } : null}
          fit={active || request ? 'auto' : 'none'}
          fitKey={active?.id ?? request?.id ?? 'self'}
          padding={{ top: 120, bottom: 300, left: 40, right: 40 }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink">
          <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_20%,#1f7f71_0,transparent_45%),radial-gradient(circle_at_75%_70%,#ffb020_0,transparent_35%)]" />
        </div>
      )}

      <MapTopBar
        role="rider"
        trailing={<NotificationsButton />}
      />

      {showMap ? (
        <div className="absolute inset-x-3 top-[70px] z-20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-full border border-line bg-cream/95 px-2 py-1.5 shadow-lift backdrop-blur">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                online ? 'bg-success' : 'bg-ink/25',
              )}
            />
            <span className="text-[11.5px] font-semibold text-ink">
              {online ? 'Online · receiving requests' : 'Offline'}
            </span>
            <Switch
              checked={online}
              onChange={(next) => void toggleOnline(next)}
              disabled={toggling || !approved}
              label="Go online"
            />
          </div>
          <button
            type="button"
            onClick={() => void gps.refresh().catch(() => undefined)}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-cream/95 text-teal shadow-lift backdrop-blur"
            aria-label="Refresh GPS"
          >
            <LocateFixed size={17} />
          </button>
        </div>
      ) : null}

      {!showMap ? (
        <div className="absolute inset-x-0 bottom-0 top-[64px] overflow-y-auto px-4 pb-[92px] pt-4">
          <div className="mx-auto max-w-lg space-y-3">
            <div className="rounded-3xl border border-cream/15 bg-white/5 p-5 text-cream backdrop-blur">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-cream/70">
                {profile.status === 'pending' ? (
                  <>
                    <Clock3 size={12} className="text-mango" /> Verification in progress
                  </>
                ) : profile.status === 'rejected' ? (
                  <>
                    <FileWarning size={12} className="text-danger" /> Action needed
                  </>
                ) : (
                  <>
                    <ShieldAlert size={12} className="text-mango" /> Account suspended
                  </>
                )}
              </span>
              <h1 className="mt-3 font-display text-[24px] font-semibold leading-tight">
                {profile.status === 'pending'
                  ? 'Your documents are being checked.'
                  : profile.status === 'rejected'
                    ? 'A document needs your attention.'
                    : 'Your rider account is suspended.'}
              </h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-cream/65">
                {profile.status === 'pending'
                  ? 'An admin reviews licences, Aadhaar and RC before you can go online. Upload any missing document now to avoid delays.'
                  : profile.status === 'rejected'
                    ? profile.rejectionReason ||
                      'One of your documents did not pass review. Re-upload a clearer copy and the team will check again.'
                    : profile.suspendedReason ||
                      'Contact support to understand what is needed to restore your account.'}
              </p>
              <Button
                className="mt-4"
                onClick={() => navigate('/rider/profile')}
                icon={<ArrowRight size={17} />}
              >
                Manage documents
              </Button>
            </div>

            <Card className="space-y-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                Required documents
              </p>
              {verificationDocs.map((item) => (
                <div key={item.kind} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-full',
                      item.status === 'approved'
                        ? 'bg-success-100 text-success'
                        : item.status === 'pending'
                          ? 'bg-mango-100 text-[#8a5c00]'
                          : 'bg-danger-100 text-danger',
                    )}
                  >
                    {item.status === 'approved' ? <BadgeCheck size={15} /> : <ClipboardCheck size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold capitalize text-ink">
                      {item.kind === 'rc' ? 'Registration certificate' : item.kind}
                    </p>
                    <p className="text-[11px] capitalize text-muted">{item.status}</p>
                  </div>
                </div>
              ))}
              {profile.vehicle ? (
                <div className="rounded-2xl bg-cream px-3 py-2.5 text-[11.5px] text-muted">
                  Vehicle on file: {profile.vehicle.make} {profile.vehicle.model} ·{' '}
                  <span className="font-semibold text-ink">{profile.vehicle.registrationNumber}</span>
                </div>
              ) : null}
            </Card>

            <Card className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-cream text-teal">
                <Star size={18} />
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-ink">
                  {profile.rating.toFixed(1)} rating · {profile.totalRides} rides
                </p>
                <p className="text-[11px] text-muted">
                  {profile.totalRides ? 'Keep the streak going.' : 'Your first rides will build this.'}
                </p>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-30 max-h-[64%] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-line/70 bg-cream shadow-[0_-18px_40px_-24px_rgba(8,33,31,0.35)]">
          <div className="above-nav mx-auto w-full max-w-lg px-4 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />

            {request ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="mango">
                    <Timer size={11} /> New request · {offerCountdown || 0}s
                  </Badge>
                  <span className="font-mono text-[10.5px] text-muted">{request.code}</span>
                </div>
                <div>
                  <h1 className="font-display text-[21px] font-semibold leading-tight text-ink">
                    {money(request.fare.estimated, request.fare.currency)} ·{' '}
                    {km(request.route.distanceMeters)}
                  </h1>
                  <p className="text-[12px] text-muted">
                    {minutes(request.route.durationSeconds)} trip · cash payment
                  </p>
                </div>

                <Card className="p-3.5">
                  <div className="flex gap-3">
                    <div className="flex w-3 flex-col items-center pt-1">
                      <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-cream" />
                      <span className="my-1 w-px flex-1 border-l border-dashed border-ink/25" />
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-mango" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Pickup</p>
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {request.pickup.label}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Drop</p>
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {request.destination.label}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                    <span className="text-[11.5px] text-muted">
                      {request.customer?.name ?? 'Customer'} · {request.createdAt ? relativeTime(request.createdAt) : ''}
                    </span>
                    <RouteStats
                      distanceMeters={request.route.distanceMeters}
                      durationSeconds={request.route.durationSeconds}
                    />
                  </div>
                </Card>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    block
                    onClick={() => void reject()}
                    loading={rejecting}
                    icon={<X size={17} />}
                  >
                    Decline
                  </Button>
                  <Button
                    block
                    size="lg"
                    onClick={() => void accept()}
                    loading={accepting}
                    icon={<ArrowRight size={18} />}
                  >
                    Accept ride
                  </Button>
                </div>
                <p className="text-center text-[10.5px] text-muted">
                  Accepting assigns this ride to you. Head to the pickup point and mark yourself
                  arriving.
                </p>
              </div>
            ) : active ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={active.status} />
                  <span className="font-mono text-[10.5px] text-muted">{active.code}</span>
                </div>
                <div>
                  <h1 className="font-display text-[21px] font-semibold leading-tight text-ink">
                    {active.status === 'ACCEPTED'
                      ? 'Head to the pickup'
                      : active.status === 'RIDER_ARRIVING'
                        ? 'Rider arriving at pickup'
                        : active.status === 'RIDER_ARRIVED'
                          ? 'Customer is waiting'
                          : 'Ride in progress'}
                  </h1>
                  <p className="text-[12px] text-muted">
                    {active.customer?.name ?? 'Customer'} ·{' '}
                    {active.status === 'IN_PROGRESS'
                      ? `${minutes(active.route.durationSeconds)} remaining`
                      : km(active.route.distanceMeters)}
                  </p>
                </div>
                <Card className="p-3.5">
                  <div className="flex gap-3">
                    <div className="flex w-3 flex-col items-center pt-1">
                      <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-cream" />
                      <span className="my-1 w-px flex-1 border-l border-dashed border-ink/25" />
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-mango" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Pickup</p>
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {active.pickup.label}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Drop</p>
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {active.destination.label}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                    <span className="font-display text-[16px] font-semibold text-ink">
                      {money(active.fare.estimated, active.fare.currency)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal">
                      <MapPin size={13} /> Open ride controls
                    </span>
                  </div>
                </Card>
                <Button
                  size="lg"
                  block
                  onClick={() => navigate(`/rider/ride/${active.id}`)}
                  icon={<Navigation size={18} />}
                >
                  Open active ride
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="font-display text-[21px] font-semibold leading-tight text-ink">
                      {online ? 'Waiting for a ping' : 'You are offline'}
                    </h1>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {online
                        ? 'Keep the app open. Requests appear here first.'
                        : 'Go online to receive nearby bookings.'}
                    </p>
                  </div>
                  <Badge tone={online ? 'success' : 'muted'}>
                    <Power size={10} /> {online ? 'Online' : 'Offline'}
                  </Badge>
                </div>

                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">
                      Today
                    </p>
                    <p className="font-display text-[22px] font-semibold text-ink">
                      {money(earningsQuery.data?.amount ?? 0)}
                    </p>
                    <p className="text-[11px] text-muted">
                      {earningsQuery.data?.rides ?? 0} completed ·{' '}
                      {km(earningsQuery.data?.distanceMeters ?? 0)}
                    </p>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cream text-teal">
                    <Wallet size={20} />
                  </span>
                </Card>

                <Card className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-cream text-teal">
                    <Bike size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">
                      {profile.vehicle
                        ? `${profile.vehicle.make} ${profile.vehicle.model}`
                        : 'Vehicle not set'}
                    </p>
                    <p className="text-[11px] text-muted">
                      {profile.vehicle
                        ? profile.vehicle.registrationNumber
                        : 'Add your vehicle from the profile'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/rider/profile')}
                    className="text-[11.5px] font-semibold text-teal"
                  >
                    Manage
                  </button>
                </Card>

                {gps.error ? (
                  <p className="rounded-2xl bg-danger-100 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-danger">
                    {gps.error}
                  </p>
                ) : null}

                <Button
                  variant="outline"
                  block
                  onClick={() => void requestQuery.reload()}
                  icon={<RefreshCw size={16} />}
                >
                  Check for requests
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
