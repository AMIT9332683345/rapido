import { useState } from 'react';
import { Bike, IndianRupee, Navigation, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/layout';
import NotificationsButton from '../../components/NotificationsButton';
import { Badge, Card, EmptyState, SegmentedControl, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { km, money, shortDate } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type { EarningsSummary } from '../../types';
import { APP_NAME } from '../../config';

type Range = 'today' | 'week' | 'month';

const RANGE_LABEL: Record<Range, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

export default function RiderEarnings() {
  const [range, setRange] = useState<Range>('today');

  const query = useQuery<EarningsSummary>(
    (signal) => api.get<EarningsSummary>(`/rider/earnings?range=${range}`, { signal }),
    [range],
  );

  const data = query.data;
  const daily = data?.daily ?? [];
  const max = Math.max(1, ...daily.map((day) => day.amount));
  const best = daily.reduce<{ date: string; amount: number } | null>(
    (top, day) => (!top || day.amount > top.amount ? day : top),
    null,
  );

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-24">
      <PageHeader
        title="Earnings"
        subtitle="Cash collected on completed rides"
        right={<NotificationsButton />}
      />

      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-3">
        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: '7 days' },
            { value: 'month', label: '30 days' },
          ]}
        />

        {query.loading && !data ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : query.error ? (
          <EmptyState
            icon={<Wallet size={22} />}
            title="Earnings unavailable"
            body={query.error}
            action={
              <button
                type="button"
                onClick={query.reload}
                className="text-[12px] font-semibold text-teal underline"
              >
                Retry
              </button>
            }
          />
        ) : (
          <>
            <Card className="relative overflow-hidden border-ink bg-ink p-5 text-cream">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border border-cream/10" />
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-cream/55">
                {RANGE_LABEL[range]}
              </p>
              <p className="mt-1 font-display text-[36px] font-semibold leading-none">
                {money(data?.amount ?? 0)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/8 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-cream/50">Rides</p>
                  <p className="mt-0.5 flex items-center gap-1 font-display text-[17px] font-semibold">
                    <Bike size={14} className="text-mango" /> {data?.rides ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/8 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-cream/50">Distance</p>
                  <p className="mt-0.5 flex items-center gap-1 font-display text-[17px] font-semibold">
                    <Navigation size={14} className="text-mango" />{' '}
                    {km(data?.distanceMeters ?? 0)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-cream/45">
                Earnings are the final fare of completed rides. Cash is collected directly from the
                customer.
              </p>
            </Card>

            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Last 7 days
                </p>
                {best && best.amount > 0 ? (
                  <Badge tone="mango">
                    <TrendingUp size={11} /> Best {shortDate(best.date)}
                  </Badge>
                ) : null}
              </div>
              {daily.length ? (
                <div className="flex h-32 items-end gap-2">
                  {daily.map((day) => {
                    const height = Math.max(4, Math.round((day.amount / max) * 100));
                    return (
                      <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                        <span className="text-[8.5px] font-semibold text-muted">
                          {day.amount ? money(day.amount).replace('₹', '') : ''}
                        </span>
                        <div className="flex h-20 w-full items-end rounded-lg bg-cream">
                          <div
                            className="w-full rounded-lg bg-teal transition-all"
                            style={{ height: `${height}%` }}
                            title={`${shortDate(day.date)} · ${money(day.amount)}`}
                          />
                        </div>
                        <span className="text-[8.5px] text-muted">{shortDate(day.date)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl bg-cream px-3 py-3 text-[11.5px] leading-relaxed text-muted">
                  Complete a ride to see your daily earnings graph.
                </p>
              )}
            </Card>

            <Card className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cream text-teal">
                <IndianRupee size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-ink">How payouts work</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {APP_NAME} charges no commission in cash mode. The fare shown on a completed ride is what
                  you collect from the customer. Platform fees, when enabled, are shown in the fare
                  breakdown before the trip.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
