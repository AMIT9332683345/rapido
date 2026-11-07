import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  Clock3,
  Flag,
  MapPin,
  Navigation,
  Phone,
  Play,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import MapView, { type MapMarker } from '../../components/MapView';
import NotificationsButton from '../../components/NotificationsButton';
import { MapTopBar } from '../../components/layout';
import { CounterpartCard, FareSummary, RideTimeline, RouteStats } from '../../components/ride';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FullPageLoader,
  Spinner,
  StatusPill,
} from '../../components/ui';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { dateTime, km, minutes, money } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useRiderGps } from '../../lib/useRiderGps';
import { useNavigation } from '../../lib/useNavigation';
import { accurateFix, maneuverDistance } from '../../lib/navigation';
import type { Booking } from '../../types';

export default function RiderRide() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { joinBooking, leaveBooking } = useSocket();

  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const query = useQuery<{ booking: Booking }>(
    (signal) => api.get<{ booking: Booking }>(`/rider/bookings/${id}`, { signal }),
    [id],
  );
  const booking = query.data?.booking.id === id ? query.data.booking : null;
  const active = Boolean(booking && ['ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED', 'IN_PROGRESS'].includes(booking.status));
  const gps = useRiderGps({ tracking: active, broadcast: active });
  const navigation = useNavigation(booking, gps.error ? null : gps.position);

  useEffect(() => {
    if (!id) return;
    joinBooking(id);
    return () => leaveBooking(id);
  }, [id, joinBooking, leaveBooking]);

  useSocketEvent<Booking>('booking:update', (payload) => {
    if (payload?.id === id) query.setData({ booking: payload });
  });

  const act = useCallback(
    async (action: 'arriving' | 'arrive' | 'start' | 'complete', success: string) => {
      setBusy(action);
      try {
        const result = await api.post<{ booking: Booking }>(`/rider/bookings/${id}/${action}`);
        query.setData({ booking: result.booking });
        toast.success(success);
      } catch (error) {
        toast.error(errorMessage(error), 'Action failed');
      } finally {
        setBusy(null);
      }
    },
    [id, query, toast],
  );

  const release = async (reason: string) => {
    setBusy('release');
    try {
      await api.post(`/rider/bookings/${id}/release`, { reason });
      setCancelOpen(false);
      toast.info('Ride released. It is back with nearby riders.');
      navigate('/rider');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not release the ride');
    } finally {
      setBusy(null);
    }
  };

  const markers = useMemo<MapMarker[]>(() => {
    if (!booking) return [];
    const items: MapMarker[] = [
      { id: 'pickup', kind: 'pickup', lat: booking.pickup.lat, lng: booking.pickup.lng, label: 'Pickup' },
      {
        id: 'destination',
        kind: 'destination',
        lat: booking.destination.lat,
        lng: booking.destination.lng,
        label: 'Drop',
      },
    ];
    if (gps.position) {
      items.push({
        id: 'self',
        kind: 'rider',
        lat: gps.position.lat,
        lng: gps.position.lng,
        label: 'You',
      });
    }
    return items;
  }, [booking, gps.position?.lat, gps.position?.lng]);

  if (query.loading && !booking) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-cream">
        <FullPageLoader label="Loading ride…" />
      </div>
    );
  }

  if (query.error || !booking) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-cream px-5">
        <EmptyState
          icon={<CircleAlert size={22} />}
          title="Ride unavailable"
          body={query.error ?? 'This ride is not assigned to you.'}
          action={
            <Button variant="outline" onClick={() => navigate('/rider')}>
              Back to dashboard
            </Button>
          }
        />
      </div>
    );
  }

  const completed = booking.status === 'COMPLETED';
  const cancelled = booking.status === 'CANCELLED' || booking.status === 'EXPIRED';
  const heading =
    completed
      ? 'Ride completed'
      : cancelled
        ? 'Ride cancelled'
        : booking.status === 'ACCEPTED'
          ? 'Head to the pickup'
          : booking.status === 'RIDER_ARRIVING'
            ? 'You are on the way'
            : booking.status === 'RIDER_ARRIVED'
              ? 'Customer is at the pickup'
              : booking.status === 'IN_PROGRESS'
                ? 'On the way to the drop'
                : 'Ride request';

  return (
    <div className="relative flex h-[100dvh] flex-col bg-cream">
      <div className="relative h-[36%] min-h-[210px] shrink-0">
        <MapView
          center={gps.position ?? (booking.status === 'IN_PROGRESS' ? booking.destination : booking.pickup)}
          markers={markers}
          route={navigation.route?.geometry ?? booking.route.geometry}
          self={gps.position ? { lat: gps.position.lat, lng: gps.position.lng } : null}
          fit="auto"
          fitKey={`${booking.status}-${gps.position ? 'gps' : 'static'}`}
          padding={{ top: 90, bottom: 40, left: 40, right: 40 }}
          showBoundary={false}
        />
        <MapTopBar role="rider" trailing={<NotificationsButton />} />
        <button
          type="button"
          onClick={() => navigate('/rider')}
          className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-line bg-cream/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-lift backdrop-blur"
        >
          <ArrowLeft size={15} /> Dashboard
        </button>
      </div>

      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-lg space-y-3 px-4 pb-6 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={booking.status} />
                <span className="font-mono text-[10.5px] text-muted">{booking.code}</span>
              </div>
              <h1 className="mt-2 font-display text-[22px] font-semibold leading-tight text-ink">
                {heading}
              </h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {completed
                  ? `Completed ${dateTime(booking.timestamps.completedAt ?? booking.updatedAt)}. Collect the fare in cash.`
                  : cancelled
                    ? 'This ride is no longer active.'
                    : booking.status === 'IN_PROGRESS'
                      ? `About ${minutes(booking.route.durationSeconds)} to the drop point.`
                      : `${km(booking.route.distanceMeters)} total · pickup at ${booking.pickup.label}`}
              </p>
            </div>
            <Badge tone="teal">
              <Wallet size={10} /> {money(
                completed ? booking.fare.final ?? booking.fare.estimated : booking.fare.estimated,
              )}
            </Badge>
          </div>

          <CounterpartCard booking={booking} role="rider" />

          {gps.error ? (
            <p className="rounded-2xl bg-danger-100 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-danger">
              {gps.error} Live location is paused.
            </p>
          ) : null}

          {navigation.target ? (
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Route to {navigation.target.label}
                </p>
                {navigation.voiceSupported ? (
                  <button
                    type="button"
                    onClick={navigation.toggleVoice}
                    aria-pressed={navigation.voiceEnabled}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink"
                  >
                    {navigation.voiceEnabled ? (
                      <Volume2 size={14} className="text-teal" />
                    ) : (
                      <VolumeX size={14} className="text-muted" />
                    )}
                    Voice {navigation.voiceEnabled ? 'on' : 'off'}
                  </button>
                ) : null}
              </div>

              {navigation.loading ? (
                <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted">
                  <Spinner size={15} /> Finding the road route…
                </p>
              ) : navigation.error ? (
                <div className="space-y-2">
                  <p role="alert" className="rounded-2xl bg-danger-100 px-3 py-2 text-[12px] leading-relaxed text-danger">
                    {navigation.error}
                  </p>
                  <Button variant="outline" size="sm" onClick={navigation.retry}>
                    Reload directions
                  </Button>
                </div>
              ) : navigation.progress ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-mango-600">
                    {maneuverDistance(navigation.progress.distanceToManeuverMeters)}
                  </p>
                  <p className="text-[15px] font-semibold leading-snug text-ink">
                    {navigation.progress.nextStep.instruction}
                  </p>
                  <p className="text-[12px] text-muted">
                    {km(navigation.progress.remainingMeters)} left · about{' '}
                    {minutes(navigation.progress.remainingSeconds)}
                  </p>
                  {navigation.progress.deviationMeters >= 60 ? (
                    <p className="rounded-2xl bg-danger-100 px-3 py-2 text-[12px] leading-relaxed text-danger">
                      Off route by {Math.round(navigation.progress.deviationMeters)} m. Directions
                      recalculate once your position updates.
                    </p>
                  ) : null}
                </div>
              ) : gps.position && !accurateFix(gps.position) ? (
                <p className="text-[12px] leading-relaxed text-muted">
                  Your GPS is too rough for turn directions. Move somewhere open and this updates by
                  itself.
                </p>
              ) : (
                <p className="text-[12px] leading-relaxed text-muted">
                  Turn directions start as soon as your location updates.
                </p>
              )}
            </Card>
          ) : null}

          {!completed && !cancelled ? (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Next step
                </p>
                <RouteStats
                  distanceMeters={booking.route.distanceMeters}
                  durationSeconds={booking.route.durationSeconds}
                  isEstimate={booking.route.isEstimate}
                />
              </div>

              {booking.status === 'ACCEPTED' ? (
                <Button
                  block
                  size="lg"
                  loading={busy === 'arriving'}
                  onClick={() => void act('arriving', 'Customer notified that you are on the way.')}
                  icon={<Navigation size={18} />}
                >
                  I am on the way
                </Button>
              ) : null}

              {booking.status === 'RIDER_ARRIVING' ? (
                <Button
                  block
                  size="lg"
                  loading={busy === 'arrive'}
                  onClick={() => void act('arrive', 'Marked as arrived. The customer has been notified.')}
                  icon={<MapPin size={18} />}
                >
                  I have arrived at pickup
                </Button>
              ) : null}

              {booking.status === 'RIDER_ARRIVED' ? (
                <Button
                  block
                  size="lg"
                  loading={busy === 'start'}
                  onClick={() => void act('start', 'Ride started. Take care on the road.')}
                  icon={<Play size={18} />}
                >
                  Start the ride
                </Button>
              ) : null}

              {booking.status === 'IN_PROGRESS' ? (
                <Button
                  block
                  size="lg"
                  loading={busy === 'complete'}
                  onClick={() => void act('complete', 'Ride completed. Collect the fare in cash.')}
                  icon={<Flag size={18} />}
                >
                  Complete ride
                </Button>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                {booking.customer?.mobile ? (
                  <a
                    href={`tel:${booking.customer.mobile}`}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-cream text-[12px] font-semibold text-ink"
                  >
                    <Phone size={14} className="text-teal" /> Call customer
                  </a>
                ) : (
                  <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-cream text-[11px] text-muted">
                    Contact appears after acceptance
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  icon={<XCircle size={14} />}
                >
                  Release ride
                </Button>
              </div>

              <p className="text-center text-[10.5px] leading-relaxed text-muted">
                Only start the ride once the customer is seated. The fare is calculated when you
                complete the trip.
              </p>
            </Card>
          ) : completed ? (
            <Card className="flex items-center gap-3 bg-success-100">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-success">
                <BadgeCheck size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-success">Fare collected in cash</p>
                <p className="text-[11.5px] text-success/80">
                  {money(booking.fare.final ?? booking.fare.estimated)} for{' '}
                  {km(booking.finalDistanceMeters ?? booking.route.distanceMeters)}.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/rider/earnings')}>
                Earnings
              </Button>
            </Card>
          ) : null}

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                Trip
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <Clock3 size={12} /> {minutes(booking.route.durationSeconds)}
              </span>
            </div>
            <div className="flex gap-3">
              <div className="flex w-3 flex-col items-center pt-1">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-cream" />
                <span className="my-1 w-px flex-1 border-l border-dashed border-ink/25" />
                <span className="h-2.5 w-2.5 rounded-[3px] bg-mango" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Pickup</p>
                  <p className="text-[13px] font-semibold leading-snug text-ink">{booking.pickup.label}</p>
                  {booking.pickup.address ? (
                    <p className="text-[11.5px] leading-snug text-muted">{booking.pickup.address}</p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Drop</p>
                  <p className="text-[13px] font-semibold leading-snug text-ink">
                    {booking.destination.label}
                  </p>
                  {booking.destination.address ? (
                    <p className="text-[11.5px] leading-snug text-muted">
                      {booking.destination.address}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {booking.customerNote ? (
              <p className="rounded-xl bg-cream px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                Customer note: {booking.customerNote}
              </p>
            ) : null}
          </Card>

          <FareSummary
            fare={booking.fare}
            title={completed ? 'Receipt' : 'Fare estimate'}
            collapsible
            mode={completed ? 'receipt' : 'estimate'}
          />

          <Card className="py-3">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
              Timeline
            </p>
            <RideTimeline ride={booking} />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Release this ride?"
        body="The customer will be notified and the ride returns to the dispatch queue. Repeated releases can affect your account."
        confirmLabel="Release ride"
        cancelLabel="Keep ride"
        tone="danger"
        loading={busy === 'release'}
        onConfirm={() => void release('Released by rider')}
      />
    </div>
  );
}
