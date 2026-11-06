import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bike,
  Check,
  ChevronDown,
  Clock,
  IndianRupee,
  MapPin,
  Navigation,
  Phone,
  Star,
  TriangleAlert,
} from 'lucide-react';
import type { Booking, Place, RideStatus } from '../types';
import {
  dateTime,
  km,
  minutes,
  money,
  shortDate,
  shortTime,
  statusLabel,
} from '../lib/format';
import { Avatar, Badge, Card, StatusPill, cn } from './ui';

export function RouteLine({
  pickup,
  destination,
  compact = false,
}: {
  pickup: Place;
  destination: Place;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex w-3 flex-col items-center pt-1">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-cream" />
        <span className="my-1 w-px flex-1 border-l border-dashed border-ink/25" />
        <span className="h-2.5 w-2.5 rounded-[3px] bg-mango" />
      </div>
      <div className={cn('min-w-0 flex-1', compact ? 'space-y-2' : 'space-y-3')}>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">Pickup</p>
          <p className="truncate text-[13px] font-semibold leading-snug text-ink">{pickup.label}</p>
          {!compact && pickup.address ? (
            <p className="truncate text-[11.5px] leading-snug text-muted">{pickup.address}</p>
          ) : null}
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">Drop</p>
          <p className="truncate text-[13px] font-semibold leading-snug text-ink">
            {destination.label}
          </p>
          {!compact && destination.address ? (
            <p className="truncate text-[11.5px] leading-snug text-muted">{destination.address}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RouteStats({
  distanceMeters,
  durationSeconds,
  isEstimate,
}: {
  distanceMeters: number;
  durationSeconds: number;
  isEstimate?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink">
        <Navigation size={13} className="text-teal" />
        {km(distanceMeters)}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink">
        <Clock size={13} className="text-teal" />
        {minutes(durationSeconds)}
      </span>
      {isEstimate ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-mango-100 px-2.5 py-1 text-[10.5px] font-semibold text-[#8a5c00]">
          <TriangleAlert size={12} /> Estimate
        </span>
      ) : null}
    </div>
  );
}

export interface FareLike {
  estimated: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  waitingCharges: number;
  platformFee: number;
  minimumAdjustment: number;
  currency: string;
  final?: number | null;
  total?: number;
  cancellationFee?: number;
}

export function FareSummary({
  fare,
  title = 'Fare',
  collapsible = false,
  mode = 'estimate',
  footer,
}: {
  fare: FareLike;
  title?: string;
  collapsible?: boolean;
  mode?: 'estimate' | 'receipt';
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  const total =
    mode === 'receipt'
      ? (fare.final ?? fare.estimated)
      : (fare.total ?? fare.estimated);

  const rows: { label: string; value: number }[] = [
    { label: 'Base fare', value: fare.baseFare },
    { label: 'Distance charge', value: fare.distanceFare },
    { label: 'Time charge', value: fare.timeFare },
    { label: 'Waiting charge', value: fare.waitingCharges },
    { label: 'Platform fee', value: fare.platformFee },
    { label: 'Minimum fare top-up', value: fare.minimumAdjustment },
  ];
  if (mode === 'receipt' && fare.cancellationFee) {
    rows.push({ label: 'Cancellation fee', value: fare.cancellationFee });
  }

  return (
    <div className="rounded-2xl bg-white p-3.5">
      <button
        type="button"
        onClick={() => collapsible && setOpen((value) => !value)}
        className={cn('flex w-full items-center justify-between gap-3', !collapsible && 'cursor-default')}
      >
        <span className="text-left">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
            {title}
          </span>
          <span className="mt-0.5 block font-display text-[19px] font-semibold text-ink">
            {money(total, fare.currency)}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-teal">
          {collapsible ? (
            <>
              Breakdown
              <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
            </>
          ) : (
            <Badge tone="muted">Cash</Badge>
          )}
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-1.5 border-t border-line/70 pt-3">
          {rows
            .filter((row) => row.value > 0)
            .map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[12px]">
                <span className="text-muted">{row.label}</span>
                <span className="font-medium text-ink">{money(row.value, fare.currency)}</span>
              </div>
            ))}
          <div className="flex items-center justify-between border-t border-line/70 pt-2 text-[12.5px]">
            <span className="font-semibold text-ink">
              {mode === 'receipt' ? 'Final fare' : 'Estimated total'}
            </span>
            <span className="font-display text-[15px] font-semibold text-ink">
              {money(total, fare.currency)}
            </span>
          </div>
          <p className="pt-0.5 text-[10.5px] leading-snug text-muted">
            {mode === 'receipt'
              ? 'Paid in cash to your rider. The final fare is calculated by the server.'
              : 'Fare is confirmed by the server before booking. Cash payment after the ride.'}
          </p>
        </div>
      ) : null}
      {footer}
    </div>
  );
}

export function RideCard({
  ride,
  href,
  counterpart,
}: {
  ride: Booking;
  href: string;
  counterpart: 'rider' | 'customer';
}) {
  const person = counterpart === 'rider' ? ride.rider : ride.customer;
  const amount =
    ride.status === 'COMPLETED'
      ? (ride.fare.final ?? ride.fare.estimated)
      : ride.status === 'CANCELLED' || ride.status === 'EXPIRED'
        ? ride.fare.cancellationFee
        : ride.fare.estimated;

  return (
    <Link
      to={href}
      className="block rounded-3xl border border-line/80 bg-white p-4 transition hover:border-ink/20 hover:shadow-lift"
    >
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={ride.status} />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
          {shortDate(ride.createdAt)} · {shortTime(ride.createdAt)}
        </span>
      </div>
      <div className="mt-3">
        <RouteLine pickup={ride.pickup} destination={ride.destination} compact />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/60 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {person ? (
            <>
              <Avatar name={person.name} photoUrl={person.photoUrl} size={26} />
              <span className="truncate text-[11.5px] font-medium text-muted">
                {person.name}
                {ride.rider && counterpart === 'customer' ? ` · ${ride.rider.vehicle?.registrationNumber ?? ''}` : ''}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-muted">
              {ride.status === 'SEARCHING' ? 'Looking for a rider…' : 'No rider assigned'}
            </span>
          )}
        </div>
        <span className="shrink-0 font-display text-[15px] font-semibold text-ink">
          {ride.status === 'CANCELLED' || ride.status === 'EXPIRED'
            ? amount > 0
              ? money(amount)
              : 'No charge'
            : money(amount)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted">
        <span className="font-mono tracking-wide">{ride.code}</span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-teal">
          Details <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

const TIMELINE_STEPS: { status: RideStatus; field: keyof Booking['timestamps']; label: string }[] = [
  { status: 'SEARCHING', field: 'searchingAt', label: 'Ride requested' },
  { status: 'ACCEPTED', field: 'acceptedAt', label: 'Rider assigned' },
  { status: 'RIDER_ARRIVING', field: 'riderArrivingAt', label: 'Rider on the way' },
  { status: 'RIDER_ARRIVED', field: 'arrivedAt', label: 'At pickup point' },
  { status: 'IN_PROGRESS', field: 'startedAt', label: 'Ride started' },
  { status: 'COMPLETED', field: 'completedAt', label: 'Ride completed' },
];

export function RideTimeline({ ride }: { ride: Booking }) {
  const terminal =
    ride.status === 'CANCELLED'
      ? { label: 'Ride cancelled', at: ride.timestamps.cancelledAt, tone: 'danger' as const }
      : ride.status === 'EXPIRED'
        ? { label: 'No rider found', at: ride.timestamps.expiredAt, tone: 'danger' as const }
        : null;

  const completedSteps = TIMELINE_STEPS.filter((step) => Boolean(ride.timestamps[step.field])).map(
    (step) => ({
      label: step.label,
      at: ride.timestamps[step.field] as string,
      tone: 'done' as const,
    }),
  );

  const nextStep = !terminal
    ? TIMELINE_STEPS.find((step) => !ride.timestamps[step.field])
    : null;

  const rows: { label: string; at: string | null; tone: 'done' | 'current' | 'danger' }[] = [
    ...completedSteps,
    ...(nextStep && ride.status !== 'COMPLETED'
      ? [{ label: statusLabel(nextStep.status), at: null, tone: 'current' as const }]
      : []),
    ...(terminal
      ? [{ label: terminal.label, at: terminal.at ?? ride.updatedAt, tone: terminal.tone }]
      : []),
  ];

  return (
    <ol className="space-y-0">
      {rows.map((row, index) => (
        <li key={`${row.label}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'mt-1 grid h-5 w-5 place-items-center rounded-full border-2',
                row.tone === 'done' && 'border-success bg-success text-white',
                row.tone === 'current' && 'border-mango bg-mango-100 text-[#8a5c00]',
                row.tone === 'danger' && 'border-danger bg-danger-100 text-danger',
              )}
            >
              {row.tone === 'done' ? (
                <Check size={11} strokeWidth={3} />
              ) : row.tone === 'current' ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mango-600" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              )}
            </span>
            {index < rows.length - 1 ? (
              <span
                className={cn(
                  'my-0.5 w-0.5 flex-1',
                  row.tone === 'done' ? 'bg-success/40' : 'bg-line',
                )}
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pb-3">
            <span
              className={cn(
                'text-[12.5px]',
                row.tone === 'current' ? 'font-semibold text-ink' : 'font-medium text-ink/80',
              )}
            >
              {row.label}
            </span>
            {row.at ? (
              <span className="shrink-0 text-[10.5px] text-muted">{shortTime(row.at)}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CounterpartCard({
  booking,
  role,
}: {
  booking: Booking;
  role: 'customer' | 'rider';
}) {
  const rider = booking.rider;
  const customer = booking.customer;

  if (role === 'customer') {
    if (!rider) {
      return (
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-cream text-teal">
            <Bike size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">
              {booking.status === 'SEARCHING' ? 'Finding a nearby rider' : 'Rider not assigned'}
            </p>
            <p className="text-[11.5px] text-muted">You will see rider details as soon as one accepts.</p>
          </div>
        </Card>
      );
    }
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={rider.name} photoUrl={rider.photoUrl} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-ink">{rider.name}</p>
            <p className="flex items-center gap-1 text-[11.5px] text-muted">
              <Star size={12} className="fill-mango text-mango" />
              {rider.rating.toFixed(1)} · {rider.totalRides} rides
            </p>
            {rider.vehicle ? (
              <p className="mt-0.5 truncate text-[11.5px] text-muted">
                {rider.vehicle.make} {rider.vehicle.model} ·{' '}
                <span className="font-semibold text-ink">{rider.vehicle.registrationNumber}</span>
              </p>
            ) : null}
          </div>
          {rider.mobile ? (
            <a
              href={`tel:${rider.mobile}`}
              aria-label={`Call ${rider.name}`}
              className="grid h-11 w-11 place-items-center rounded-full bg-success text-white shadow-lift"
            >
              <Phone size={18} />
            </a>
          ) : null}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-cream px-3 py-2 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Bike size={14} className="text-teal" /> Bike taxi · cash
          </span>
          <span className="font-mono text-[10.5px]">{booking.code}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-center gap-3">
      <Avatar name={customer?.name ?? 'Customer'} photoUrl={customer?.photoUrl} size={46} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{customer?.name ?? 'Customer'}</p>
        <p className="text-[11.5px] text-muted">
          {customer?.mobile ? (
            <span className="inline-flex items-center gap-1">
              <Phone size={11} /> {customer.mobile}
            </span>
          ) : (
            'Contact appears once the ride is accepted'
          )}
        </p>
      </div>
      {customer?.mobile ? (
        <a
          href={`tel:${customer.mobile}`}
          aria-label={`Call ${customer.name}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-success text-white shadow-lift"
        >
          <Phone size={18} />
        </a>
      ) : null}
    </Card>
  );
}

export function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-2xl bg-white px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cream text-teal">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
          {label}
        </span>
        <span className="block truncate text-[13px] font-semibold text-ink">{value}</span>
      </span>
    </div>
  );
}

export function PaymentBadge({ ride }: { ride: Booking }) {
  return (
    <Badge tone={ride.payment.status === 'paid' ? 'success' : 'muted'}>
      <IndianRupee size={10} />
      {ride.payment.method === 'cash' ? 'Cash' : 'Online'} ·{' '}
      {ride.payment.status === 'paid' ? 'paid' : 'due'}
    </Badge>
  );
}

export function RideMeta({ ride }: { ride: Booking }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
      <span className="inline-flex items-center gap-1">
        <MapPin size={11} /> {ride.pickup.label.slice(0, 26)}
      </span>
      <span>·</span>
      <span>{dateTime(ride.createdAt)}</span>
    </div>
  );
}
