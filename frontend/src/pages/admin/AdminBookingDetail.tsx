import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Bike,
  ChevronDown,
  MapPin,
  Phone,
  ReceiptIndianRupee,
  UserRound,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DetailRow,
  EmptyState,
  FullPageLoader,
  SectionTitle,
  Sheet,
  StatusPill,
  Textarea,
} from '../../components/ui';
import MapView, { type MapMarker } from '../../components/MapView';
import { FareSummary, RouteLine, RideTimeline } from '../../components/ride';
import { api, errorMessage } from '../../lib/api';
import { dateTime, isActiveStatus, money, relativeTime, statusLabel } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useToast } from '../../context/ToastContext';
import type { ActivityLog, Booking } from '../../types';

interface BookingDetailResponse {
  booking: Booking;
  activity: ActivityLog[];
}

export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOffers, setShowOffers] = useState(false);

  const query = useQuery<BookingDetailResponse>(
    (signal) => api.get<BookingDetailResponse>(`/admin/bookings/${id}`, { signal }),
    [id],
    { enabled: Boolean(id) },
  );

  const detail = query.data;
  const booking = detail?.booking;

  const cancelRide = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      await api.post(`/admin/bookings/${booking.id}/cancel`, {
        reason: reason.trim() || 'Cancelled by support',
      });
      toast.success('Booking cancelled and both parties notified.');
      setCancelOpen(false);
      setReason('');
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (query.loading && !detail) {
    return <FullPageLoader label="Loading booking" />;
  }

  if (query.error || !booking) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <EmptyState
          icon={<ReceiptIndianRupee size={22} />}
          title="Booking not available"
          body={query.error ?? 'This booking could not be found.'}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={query.reload}>
                Retry
              </Button>
              <Button onClick={() => navigate('/admin/bookings')}>All bookings</Button>
            </div>
          }
        />
      </div>
    );
  }

  const markers: MapMarker[] = [
    { id: 'pickup', kind: 'pickup', lat: booking.pickup.lat, lng: booking.pickup.lng, label: 'Pickup' },
    {
      id: 'destination',
      kind: 'destination',
      lat: booking.destination.lat,
      lng: booking.destination.lng,
      label: 'Destination',
    },
  ];
  if (booking.rider?.location) {
    markers.push({
      id: 'rider',
      kind: 'rider',
      lat: booking.rider.location.lat,
      lng: booking.rider.location.lng,
      label: `${booking.rider.name} (last known)`,
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <Link
        to="/admin/bookings"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> All bookings
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={booking.status} />
            <Badge tone="muted">{booking.payment.method === 'cash' ? 'Cash' : 'Online'}</Badge>
            <Badge tone={booking.payment.status === 'paid' ? 'success' : 'muted'}>
              {booking.payment.status}
            </Badge>
          </div>
          <h1 className="mt-2 font-mono text-[20px] font-semibold tracking-wide text-ink">
            {booking.code}
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            Created {dateTime(booking.createdAt)} · updated {relativeTime(booking.updatedAt)}
          </p>
        </div>
        {isActiveStatus(booking.status) ? (
          <Button
            variant="danger"
            size="sm"
            icon={<Ban size={15} />}
            onClick={() => setCancelOpen(true)}
          >
            Cancel booking
          </Button>
        ) : null}
      </div>

      <div className="mt-4 h-[280px] overflow-hidden rounded-3xl border border-line/80 sm:h-[340px]">
        <MapView
          markers={markers}
          route={booking.route.geometry}
          routeIsEstimate={booking.route.isEstimate}
          fit="route"
          fitKey={booking.id}
          padding={{ top: 40, bottom: 40, left: 40, right: 40 }}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Trip" />
          <div className="mt-3">
            <RouteLine pickup={booking.pickup} destination={booking.destination} />
          </div>
          <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
            <DetailRow
              label="Distance"
              value={`${(booking.route.distanceMeters / 1000).toFixed(1)} km`}
            />
            <DetailRow
              label="Duration"
              value={`${Math.round(booking.route.durationSeconds / 60)} min`}
            />
            <DetailRow
              label="Route source"
              value={
                booking.route.provider
                  ? `${booking.route.provider}${booking.route.isEstimate ? ' (straight-line fallback)' : ''}`
                  : 'Pending'
              }
            />
            {booking.customerNote ? (
              <DetailRow label="Customer note" value={booking.customerNote} />
            ) : null}
            {booking.finalDistanceMeters ? (
              <DetailRow
                label="Final distance"
                value={`${(booking.finalDistanceMeters / 1000).toFixed(2)} km`}
              />
            ) : null}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Fare" />
          <div className="mt-3">
            <FareSummary
              fare={booking.fare}
              mode={booking.status === 'COMPLETED' ? 'receipt' : 'estimate'}
            />
          </div>
          {booking.cancellation ? (
            <div className="mt-3 rounded-2xl bg-danger-100/60 px-3 py-2.5 text-[12px] text-danger">
              Cancelled by {booking.cancellation.byRole}
              {booking.cancellation.reason ? ` — ${booking.cancellation.reason}` : ''}
              {booking.cancellation.fee > 0
                ? ` · ${money(booking.cancellation.fee)} fee`
                : ''}
            </div>
          ) : null}
        </Card>

        <Card>
          <SectionTitle title="Customer" />
          {booking.customer ? (
            <div className="mt-3 flex items-center gap-3">
              <Avatar
                name={booking.customer.name}
                photoUrl={booking.customer.photoUrl}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">
                  {booking.customer.name}
                </p>
                <p className="text-[11.5px] text-muted">{booking.customer.mobile}</p>
              </div>
              {booking.customer.mobile ? (
                <a
                  href={`tel:${booking.customer.mobile}`}
                  className="grid h-9 w-9 place-items-center rounded-full bg-cream text-teal"
                  aria-label="Call customer"
                >
                  <Phone size={15} />
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-muted">Customer details unavailable.</p>
          )}
        </Card>

        <Card>
          <SectionTitle title="Rider" />
          {booking.rider ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <Avatar name={booking.rider.name} photoUrl={booking.rider.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {booking.rider.name}
                  </p>
                  <p className="text-[11.5px] text-muted">
                    {booking.rider.mobile ?? 'Mobile hidden'} · {booking.rider.totalRides} rides
                  </p>
                </div>
                {booking.rider.mobile ? (
                  <a
                    href={`tel:${booking.rider.mobile}`}
                    className="grid h-9 w-9 place-items-center rounded-full bg-cream text-teal"
                    aria-label="Call rider"
                  >
                    <Phone size={15} />
                  </a>
                ) : null}
              </div>
              {booking.rider.vehicle ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-cream px-3 py-2 text-[11.5px] text-muted">
                  <Bike size={14} className="text-teal" />
                  {booking.rider.vehicle.color ? `${booking.rider.vehicle.color} ` : ''}
                  {booking.rider.vehicle.make} {booking.rider.vehicle.model} ·{' '}
                  <span className="font-semibold text-ink">
                    {booking.rider.vehicle.registrationNumber}
                  </span>
                </div>
              ) : null}
              <Link
                to={`/admin/riders/${booking.rider.id}`}
                className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal"
              >
                <UserRound size={13} /> Open rider profile
              </Link>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-muted">
              No rider was assigned to this booking.
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle title="Lifecycle" />
          <div className="mt-3">
            <RideTimeline ride={booking} />
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Activity log"
            action={
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                {detail?.activity.length ?? 0} events
              </span>
            }
          />
          {detail?.activity.length ? (
            <ol className="mt-3 space-y-2.5">
              {detail.activity.map((event) => (
                <li key={event.id} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-ink">
                      {statusLabel(event.status)}
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-muted">
                        {event.actorRole}
                      </span>
                    </p>
                    {event.note ? (
                      <p className="text-[11px] leading-snug text-muted">{event.note}</p>
                    ) : null}
                    <p className="text-[10px] text-muted">{dateTime(event.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[12px] text-muted">No activity has been logged yet.</p>
          )}
        </Card>
      </div>

      {booking.offers?.length ? (
        <Card className="mt-3">
          <button
            type="button"
            onClick={() => setShowOffers((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="font-display text-[15px] font-semibold text-ink">
              Dispatch offers ({booking.offers.length})
            </span>
            <ChevronDown
              size={16}
              className={showOffers ? 'rotate-180 text-muted transition' : 'text-muted transition'}
            />
          </button>
          {showOffers ? (
            <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
              {booking.offers.map((offer, index) => (
                <div
                  key={`${offer.rider}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2 text-[11px]"
                >
                  <span className="truncate font-mono text-muted">{offer.rider}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        offer.response === 'accepted'
                          ? 'success'
                          : offer.response === 'declined'
                            ? 'danger'
                            : 'mango'
                      }
                    >
                      {offer.response}
                    </Badge>
                    <span className="text-[10px] text-muted">round {offer.round}</span>
                  </span>
                </div>
              ))}
              {booking.declinedRiders?.length ? (
                <p className="pt-1 text-[10.5px] text-muted">
                  {booking.declinedRiders.length} rider
                  {booking.declinedRiders.length === 1 ? '' : 's'} previously declined this request.
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <p className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted">
        <MapPin size={12} /> Map data © OpenStreetMap contributors
      </p>

      <Sheet
        open={cancelOpen}
        onClose={() => {
          if (!saving) setCancelOpen(false);
        }}
        title="Cancel this booking?"
        description="Both the customer and rider receive a notification. Cancellation rules and fees are applied on the server."
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              block
              disabled={saving}
              onClick={() => setCancelOpen(false)}
            >
              Keep booking
            </Button>
            <Button variant="danger" block loading={saving} onClick={cancelRide}>
              Cancel ride
            </Button>
          </div>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.13em] text-muted">
            Reason
          </span>
          <Textarea
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is support cancelling this ride?"
          />
        </label>
      </Sheet>
    </div>
  );
}
