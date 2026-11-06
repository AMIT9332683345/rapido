import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  MapPin,
  Navigation,
  RefreshCw,
  Share2,
  Star,
  Timer,
  XCircle,
} from 'lucide-react';
import MapView, { type MapMarker } from '../../components/MapView';
import NotificationsButton from '../../components/NotificationsButton';
import { MapTopBar } from '../../components/layout';
import { FareSummary, RideTimeline, RouteStats, CounterpartCard } from '../../components/ride';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FullPageLoader,
  StatusPill,
} from '../../components/ui';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { dateTime, km, minutes, money, statusLabel } from '../../lib/format';
import { useQuery, useCountdown } from '../../lib/useQuery';
import type { Booking } from '../../types';

interface RiderLocation {
  bookingId: string;
  riderId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  recordedAt: string;
}

export default function CustomerRide() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { joinBooking, leaveBooking } = useSocket();

  const [live, setLive] = useState<{ lat: number; lng: number } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const query = useQuery<{ booking: Booking }>(
    (signal) => api.get<{ booking: Booking }>(`/customer/bookings/${id}`, { signal }),
    [id],
  );

  const booking = query.data?.booking ?? null;

  useEffect(() => {
    if (!id) return;
    joinBooking(id);
    return () => leaveBooking(id);
  }, [id, joinBooking, leaveBooking]);

  useSocketEvent<Booking>('booking:update', (payload) => {
    if (payload?.id === id) query.setData({ booking: payload });
  });

  useSocketEvent<RiderLocation>('rider:location', (payload) => {
    if (payload?.bookingId === id) setLive({ lat: payload.lat, lng: payload.lng });
  });

  useEffect(() => {
    if (!booking || !['SEARCHING', 'REQUESTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED'].includes(booking.status)) {
      return;
    }
    const timer = window.setInterval(query.reload, 20000);
    return () => window.clearInterval(timer);
  }, [booking?.status, query.reload]);

  const countdown = useCountdown(booking?.searchDeadlineAt ?? null);
  const offerCountdown = useCountdown(booking?.offerExpiresAt ?? null);

  const ridersPosition = booking?.rider?.location ?? null;
  const riderPoint = live ?? ridersPosition;

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
    if (riderPoint) {
      items.push({
        id: 'rider',
        kind: 'rider',
        lat: riderPoint.lat,
        lng: riderPoint.lng,
        label: 'Your rider',
      });
    }
    return items;
  }, [booking, riderPoint?.lat, riderPoint?.lng]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      const result = await api.post<{ booking: Booking }>(`/customer/bookings/${id}/cancel`, {
        reason: reason.trim() || undefined,
      });
      query.setData({ booking: result.booking });
      setCancelOpen(false);
      setReason('');
      toast.success(
        result.booking.fare.cancellationFee > 0
          ? `Ride cancelled. A cancellation fee of ${money(result.booking.fare.cancellationFee)} applies.`
          : 'Ride cancelled. No charge was applied.',
      );
    } catch (error) {
      toast.error(errorMessage(error), 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  }, [id, reason, query, toast]);

  const copyCode = async () => {
    if (!booking) return;
    try {
      await navigator.clipboard.writeText(booking.code);
      toast.info('Booking code copied.', 'Copied');
    } catch {
      toast.error('Your browser blocked clipboard access.', 'Copy failed');
    }
  };

  const share = async () => {
    if (!booking) return;
    const text = `Amit ride ${booking.code}: ${booking.pickup.label} → ${booking.destination.label}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Amit ride', text });
      else {
        await navigator.clipboard.writeText(text);
        toast.info('Ride summary copied.', 'Ready to share');
      }
    } catch {
      // Sharing is optional.
    }
  };

  if (query.loading && !booking) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-cream">
        <FullPageLoader label="Loading your ride…" />
      </div>
    );
  }

  if (query.error || !booking) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-cream px-5">
        <EmptyState
          icon={<CircleAlert size={22} />}
          title="Ride not found"
          body={query.error ?? 'This ride may belong to another account, or it has been removed.'}
          action={
            <Button variant="outline" onClick={() => navigate('/app/rides')}>
              Back to my rides
            </Button>
          }
        />
      </div>
    );
  }

  const finished = booking.status === 'COMPLETED';
  const cancelled = booking.status === 'CANCELLED' || booking.status === 'EXPIRED';
  const awaitingRider = booking.status === 'SEARCHING' || booking.status === 'REQUESTED';
  const atPickup = booking.status === 'RIDER_ARRIVED';
  const inProgress = booking.status === 'IN_PROGRESS';
  const riderOnWay =
    booking.status === 'ACCEPTED' || booking.status === 'RIDER_ARRIVING' || atPickup;
  const cancelFeeApplies = Boolean(booking.rider) && !['SEARCHING', 'REQUESTED'].includes(booking.status);

  const headline = finished
    ? 'Ride completed'
    : cancelled
      ? booking.status === 'EXPIRED'
        ? 'No rider found'
        : 'Ride cancelled'
      : awaitingRider
        ? 'Finding your rider'
        : inProgress
          ? 'On the way to your drop'
          : atPickup
            ? 'Your rider has arrived'
            : riderOnWay
              ? 'Rider is on the way'
              : statusLabel(booking.status);

  return (
    <div className="relative flex h-[100dvh] flex-col bg-cream">
      <div className="relative h-[38%] min-h-[220px] shrink-0">
        <MapView
          center={riderPoint ?? booking.pickup}
          markers={markers}
          route={booking.route.geometry}
          routeIsEstimate={booking.route.isEstimate}
          fitKey={`${booking.status}-${booking.route.geometry?.coordinates.length ?? 0}`}
          fit="auto"
          padding={{ top: 90, bottom: 40, left: 40, right: 40 }}
          showBoundary={false}
        />
        <MapTopBar role="customer" trailing={<NotificationsButton />} />
        <button
          type="button"
          onClick={() => navigate('/app/rides')}
          className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-line bg-cream/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-lift backdrop-blur"
        >
          <ArrowLeft size={15} /> My rides
        </button>
      </div>

      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-lg space-y-3 px-4 pb-6 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={booking.status} />
                <span className="font-mono text-[10.5px] tracking-wide text-muted">{booking.code}</span>
              </div>
              <h1 className="mt-2 font-display text-[22px] font-semibold leading-tight text-ink">
                {headline}
              </h1>
              {awaitingRider ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  We are offering this ride to approved riders around {booking.pickup.label}.
                  {offerCountdown > 0 ? ` Next check in ${offerCountdown}s.` : ''}
                  {countdown > 0 ? ` Search closes in ${countdown}s.` : ''}
                </p>
              ) : atPickup ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  Meet your rider at the pickup point. The ride starts when they mark it started.
                </p>
              ) : inProgress ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  Track the bike live. Pay the final fare in cash after you arrive.
                </p>
              ) : finished ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  Completed {dateTime(booking.timestamps.completedAt ?? booking.updatedAt)}.
                </p>
              ) : cancelled ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  {booking.status === 'EXPIRED'
                    ? 'No rider accepted in time. You can try again with a wider area.'
                    : `${booking.cancellation?.byRole === 'admin' ? 'Support' : 'You'} cancelled this ride ${dateTime(
                        booking.cancellation?.at,
                      )}.`}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => void copyCode()}
                aria-label="Copy booking code"
                className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-muted"
              >
                <Copy size={15} />
              </button>
              <button
                type="button"
                onClick={() => void share()}
                aria-label="Share ride"
                className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-muted"
              >
                <Share2 size={15} />
              </button>
            </div>
          </div>

          {awaitingRider ? (
            <Card className="flex items-center gap-3 border-mango/40 bg-mango-100/70">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-mango/40" />
                <span className="relative grid h-10 w-10 place-items-center rounded-full bg-mango text-ink">
                  <Bike size={19} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  {offerCountdown > 0 ? `Offer active · ${offerCountdown}s` : 'Contacting riders'}
                </p>
                <p className="text-[11.5px] text-[#7a5200]">
                  {booking.offerExpiresAt
                    ? `Expires at ${dateTime(booking.offerExpiresAt)}`
                    : 'Requests are sent automatically.'}
                </p>
              </div>
              <button
                type="button"
                onClick={query.reload}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-teal"
                aria-label="Refresh ride"
              >
                <RefreshCw size={15} />
              </button>
            </Card>
          ) : null}

          {riderOnWay || inProgress ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {inProgress ? 'Trip distance' : 'Rider distance'}
                </p>
                <p className="mt-0.5 font-display text-[16px] font-semibold text-ink">
                  {km(booking.route.distanceMeters)}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {inProgress ? 'Trip time' : 'Fare estimate'}
                </p>
                <p className="mt-0.5 font-display text-[16px] font-semibold text-ink">
                  {inProgress
                    ? minutes(booking.route.durationSeconds)
                    : money(booking.fare.estimated, booking.fare.currency)}
                </p>
              </div>
            </div>
          ) : null}

          {booking.rider ? <CounterpartCard booking={booking} role="customer" /> : null}

          {booking.rider && (atPickup || inProgress) ? (
            <Card className="flex items-center gap-3 bg-ink text-cream">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-mango">
                {atPickup ? <MapPin size={18} /> : <Navigation size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">
                  {atPickup ? 'Rider is waiting at pickup' : 'Ride started'}
                </p>
                <p className="text-[11.5px] text-cream/60">
                  {atPickup
                    ? 'Confirm the bike number before you sit.'
                    : `Arriving in about ${minutes(booking.route.durationSeconds)}.`}
                </p>
              </div>
              <Clock3 size={17} className="text-cream/50" />
            </Card>
          ) : null}

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                Route
              </p>
              <RouteStats
                distanceMeters={booking.route.distanceMeters}
                durationSeconds={booking.route.durationSeconds}
                isEstimate={booking.route.isEstimate}
              />
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
                Note: {booking.customerNote}
              </p>
            ) : null}
          </Card>

          <FareSummary
            fare={booking.fare}
            title={finished ? 'Receipt' : cancelled ? 'Cancellation' : 'Fare'}
            collapsible
            mode={finished ? 'receipt' : 'estimate'}
          />

          <Card className="space-y-0 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                Ride timeline
              </p>
              {inProgress ? <Badge tone="teal">Live</Badge> : null}
            </div>
            <RideTimeline ride={booking} />
          </Card>

          {awaitingRider ? (
            <Button
              variant="outline"
              block
              onClick={() => setCancelOpen(true)}
              icon={<XCircle size={17} />}
            >
              Cancel request
            </Button>
          ) : riderOnWay ? (
            <Button
              variant="outline"
              block
              onClick={() => setCancelOpen(true)}
              icon={<XCircle size={17} />}
            >
              Cancel ride
            </Button>
          ) : inProgress ? (
            <p className="rounded-2xl bg-cream-200/70 px-3.5 py-2.5 text-center text-[11.5px] leading-relaxed text-muted">
              A ride in progress can only be cancelled by support. Call your rider if something is
              wrong.
            </p>
          ) : cancelled && booking.cancellation?.reason ? (
            <p className="rounded-2xl bg-danger-100 px-3.5 py-2.5 text-[12px] leading-relaxed text-danger">
              Reason: {booking.cancellation.reason}
            </p>
          ) : finished ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-success-100 px-3.5 py-3 text-[12px] font-semibold text-success">
              <CheckCircle2 size={16} />
              {booking.payment.status === 'paid'
                ? 'Payment received'
                : 'Pay the rider in cash if you have not already'}
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-4 pb-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Star size={11} className="fill-mango text-mango" /> Server-calculated fare
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer size={11} /> GST not applicable
            </span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={cancelFeeApplies ? 'Cancel this ride?' : 'Cancel this request?'}
        body={
          cancelFeeApplies
            ? `A rider has already accepted. A cancellation fee of up to ${money(
                booking.fare.cancellationFee || 0,
              )} may apply, and it will be shown on the receipt.`
            : 'No rider has been charged for this request. You will not pay anything.'
        }
        confirmLabel="Cancel ride"
        cancelLabel="Keep ride"
        tone="danger"
        loading={cancelling}
        onConfirm={() => void cancel()}
      />

      <div className="sr-only" aria-live="polite">
        {booking.status === 'ACCEPTED' ? 'A rider accepted your request.' : null}
        {booking.status === 'RIDER_ARRIVED' ? 'Your rider has arrived.' : null}
        {booking.status === 'IN_PROGRESS' ? 'Your ride has started.' : null}
        {booking.status === 'COMPLETED' ? 'Your ride is complete.' : null}
      </div>
    </div>
  );
}
