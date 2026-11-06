import { IndianRupee, Info, MapPin, ShieldCheck, Timer, Bike, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/layout';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type { PublicConfig } from '../../types';
import { SERVICE_LOCATION } from '../../config';

export default function CustomerOffers() {
  const query = useQuery<PublicConfig>(
    (signal) => api.get<PublicConfig>('/config', { auth: false, signal }),
    [],
  );

  if (query.loading && !query.data) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="grid h-full place-items-center px-5">
        <EmptyState
          icon={<Info size={22} />}
          title="Fare information is unavailable"
          body={query.error ?? 'Try again in a moment.'}
        />
      </div>
    );
  }

  const { fare, serviceArea, app } = query.data;
  const exampleKm = 4;
  const exampleMinutes = 12;
  const example =
    Math.max(
      fare.minimumFare,
      fare.baseFare + fare.perKm * exampleKm + fare.perMinute * exampleMinutes,
    ) + fare.platformFee;

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-24">
      <PageHeader title="Offers & fares" subtitle="No surge. No hidden fees. No coupon games." right={<Badge tone="teal">Cash</Badge>} />

      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-3">
        <Card className="relative overflow-hidden border-ink bg-ink p-5 text-cream">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-cream/10" />
          <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full border border-cream/10" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mango px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink">
              <ShieldCheck size={12} /> Transparent pricing
            </span>
            <h1 className="mt-3 font-display text-[26px] font-semibold leading-tight">
              The price you see is the price you pay.
            </h1>
            <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-cream/65">
              Every estimate is calculated on our server from the active fare configuration. If the
              route changes, the final fare is recalculated from the actual distance — never a
              surge multiplier.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/8 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.12em] text-cream/50">Base</p>
                <p className="font-display text-[15px] font-semibold">{money(fare.baseFare)}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.12em] text-cream/50">Per km</p>
                <p className="font-display text-[15px] font-semibold">{money(fare.perKm)}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.12em] text-cream/50">Per min</p>
                <p className="font-display text-[15px] font-semibold">{money(fare.perMinute)}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-mango-100 text-[#8a5c00]">
              <Bike size={17} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink">Example: {exampleKm} km ride</p>
              <p className="text-[11.5px] text-muted">
                {fare.baseFare > 0 ? `Base ${money(fare.baseFare)} + ` : ''}
                {money(fare.perKm)}/km · {money(fare.perMinute)}/min · platform fee{' '}
                {money(fare.platformFee)}
              </p>
            </div>
            <span className="ml-auto font-display text-[20px] font-semibold text-ink">
              {money(example)}
            </span>
          </div>
          <div className="rounded-2xl bg-cream px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            Minimum fare {money(fare.minimumFare)}. The estimate uses the road distance from our
            routing engine, not a straight line across the rivers.
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Card className="space-y-1.5">
            <Timer size={17} className="text-teal" />
            <p className="text-[12.5px] font-semibold text-ink">Waiting</p>
            <p className="text-[11.5px] leading-relaxed text-muted">
              {fare.waitingFreeMinutes} min free, then {money(fare.waitingPerMinute)} per minute.
            </p>
          </Card>
          <Card className="space-y-1.5">
            <Wallet size={17} className="text-teal" />
            <p className="text-[12.5px] font-semibold text-ink">Cancellation</p>
            <p className="text-[11.5px] leading-relaxed text-muted">
              {money(fare.cancellationFee)} only if a rider is already on the way.
            </p>
          </Card>
          <Card className="space-y-1.5">
            <IndianRupee size={17} className="text-teal" />
            <p className="text-[12.5px] font-semibold text-ink">Payment</p>
            <p className="text-[11.5px] leading-relaxed text-muted">
              Cash directly to the rider after the trip. No card stored.
            </p>
          </Card>
          <Card className="space-y-1.5">
            <MapPin size={17} className="text-teal" />
            <p className="text-[12.5px] font-semibold text-ink">Service area</p>
            <p className="text-[11.5px] leading-relaxed text-muted">{serviceArea.name}</p>
          </Card>
        </div>

        <Card className="border-line bg-white/70">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
            Why we do not list coupons
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Fake discounts hide real prices. Instead, Amit keeps a single fare table for{' '}
            {SERVICE_LOCATION}, reviewed by the operator. If a local promo is ever introduced, it
            will appear here with its exact rules.
          </p>
        </Card>

        <p className="pb-2 text-center text-[10.5px] text-muted">
          Questions about a fare? Contact support from your profile. Map data © OpenStreetMap
          contributors.
        </p>
      </div>
    </div>
  );
}
