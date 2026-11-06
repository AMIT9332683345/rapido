import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarRange,
  IndianRupee,
  Route,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DetailRow,
  EmptyState,
  FullPageLoader,
  SectionTitle,
  SegmentedControl,
  Skeleton,
} from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type { ReportSeries } from '../../types';

type Range = '7' | '30' | '90';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(date: string, long = false): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = `${day} ${MONTHS[month - 1]}`;
  return long ? `${base} ${year}` : base;
}

export default function AdminReports() {
  const [range, setRange] = useState<Range>('30');
  const query = useQuery<ReportSeries>(
    (signal) => api.get<ReportSeries>(`/admin/reports?days=${range}`, { signal }),
    [range],
  );

  const series = query.data?.series ?? [];
  const maxBookings = useMemo(
    () => Math.max(1, ...series.map((row) => row.bookings)),
    [series],
  );
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const recent = [...series].reverse().slice(0, 12);

  const totals = query.data?.totals;
  const completionRate =
    totals && totals.bookings > 0 ? Math.round((totals.completed / totals.bookings) * 100) : 0;
  const cancellationRate =
    totals && totals.bookings > 0 ? Math.round((totals.cancelled / totals.bookings) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Performance
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Reports
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Bookings, completions and revenue by day. Days follow India Standard Time.
          </p>
        </div>
        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          size="sm"
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
          className="w-auto"
        />
      </div>

      {query.loading && !query.data ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : query.error ? (
        <div className="mt-4">
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="Could not load reports"
            body={query.error}
            action={
              <Button variant="outline" onClick={query.reload}>
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Bookings
                </span>
                <CalendarRange size={16} className="text-teal" />
              </div>
              <p className="mt-1 font-display text-[26px] font-semibold leading-none text-ink">
                {totals?.bookings ?? 0}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {totals?.completed ?? 0} completed · {totals?.cancelled ?? 0} cancelled
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Revenue
                </span>
                <IndianRupee size={16} className="text-teal" />
              </div>
              <p className="mt-1 font-display text-[26px] font-semibold leading-none text-ink">
                {money(totals?.revenue ?? 0)}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">Completed cash fares in range</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Completion
                </span>
                <TrendingUp size={16} className="text-success" />
              </div>
              <p className="mt-1 font-display text-[26px] font-semibold leading-none text-ink">
                {completionRate}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-200">
                <span
                  className="block h-full rounded-full bg-success"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Cancellations
                </span>
                <XCircle size={16} className="text-danger" />
              </div>
              <p className="mt-1 font-display text-[26px] font-semibold leading-none text-ink">
                {cancellationRate}%
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {(totals?.cancelled ?? 0)} of {totals?.bookings ?? 0} requests
              </p>
            </Card>
          </div>

          <Card className="mt-3">
            <SectionTitle
              title="Daily bookings"
              action={
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-teal" /> completed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-danger/70" /> cancelled
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-cream-200" /> other
                  </span>
                </div>
              }
            />
            {series.length === 0 ? (
              <p className="mt-3 text-[12px] text-muted">No booking activity in this range.</p>
            ) : (
              <>
                <div className="mt-4 flex h-[180px] items-end gap-[3px] overflow-x-auto pb-1">
                  {series.map((row, index) => {
                    const height = Math.max(3, Math.round((row.bookings / maxBookings) * 150));
                    const completedHeight =
                      row.bookings > 0 ? Math.round((row.completed / row.bookings) * height) : 0;
                    const cancelledHeight =
                      row.bookings > 0 ? Math.round((row.cancelled / row.bookings) * height) : 0;
                    return (
                      <div
                        key={row.date}
                        className="group flex min-w-[8px] flex-1 flex-col items-center justify-end"
                        title={`${dayLabel(row.date, true)}\n${row.bookings} bookings · ${row.completed} completed · ${row.cancelled} cancelled\nRevenue ${money(row.revenue)} · ${row.distanceKm} km`}
                      >
                        <div
                          className="relative w-full overflow-hidden rounded-t-md bg-cream-200 transition group-hover:brightness-95"
                          style={{ height }}
                        >
                          <span
                            className="absolute inset-x-0 bottom-0 bg-danger/70"
                            style={{ height: cancelledHeight }}
                          />
                          <span
                            className="absolute inset-x-0 bottom-0 bg-teal"
                            style={{ height: completedHeight }}
                          />
                        </div>
                        {index % labelEvery === 0 || index === series.length - 1 ? (
                          <span className="mt-1 whitespace-nowrap text-[8.5px] text-muted">
                            {dayLabel(row.date)}
                          </span>
                        ) : (
                          <span className="mt-1 h-[10px]" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-muted">
                  <span>
                    Peak day: {maxBookings} booking{maxBookings === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Route size={11} /> {totals?.distanceKm ?? 0} km routed
                  </span>
                </div>
              </>
            )}
          </Card>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="overflow-hidden p-0">
              <div className="px-4 pt-4">
                <SectionTitle title="Recent days" />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-[11.5px]">
                  <thead className="bg-cream/70 text-[9.5px] uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Bookings</th>
                      <th className="px-3 py-2 font-semibold">Completed</th>
                      <th className="px-3 py-2 font-semibold">Cancelled</th>
                      <th className="px-3 py-2 font-semibold">Km</th>
                      <th className="px-4 py-2 text-right font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {recent.map((row) => (
                      <tr key={row.date} className="hover:bg-cream/40">
                        <td className="px-4 py-2.5 font-medium text-ink">
                          {dayLabel(row.date, true)}
                        </td>
                        <td className="px-3 py-2.5 text-ink">{row.bookings}</td>
                        <td className="px-3 py-2.5 text-success">{row.completed}</td>
                        <td className="px-3 py-2.5 text-danger">{row.cancelled}</td>
                        <td className="px-3 py-2.5 text-muted">{row.distanceKm}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-ink">
                          {money(row.revenue)}
                        </td>
                      </tr>
                    ))}
                    {recent.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-muted">
                          No rows for this range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <SectionTitle title="Range totals" />
              <div className="mt-3 space-y-2">
                <DetailRow label="Bookings" value={totals?.bookings ?? 0} />
                <DetailRow label="Completed" value={totals?.completed ?? 0} />
                <DetailRow label="Cancelled / expired" value={totals?.cancelled ?? 0} />
                <DetailRow label="Routed distance" value={`${totals?.distanceKm ?? 0} km`} />
                <div className="border-t border-line/60 pt-2">
                  <DetailRow
                    label="Completed revenue"
                    value={<span className="text-[15px]">{money(totals?.revenue ?? 0)}</span>}
                    strong
                  />
                </div>
              </div>
              {totals && totals.completed > 0 ? (
                <p className="mt-3 rounded-2xl bg-cream px-3 py-2.5 text-[11px] leading-snug text-muted">
                  Average completed fare{' '}
                  <span className="font-semibold text-ink">
                    {money(totals.revenue / totals.completed)}
                  </span>{' '}
                  across {totals.completed} ride{totals.completed === 1 ? '' : 's'}.
                </p>
              ) : null}
              <Badge tone="muted" className="mt-3">
                {range} day window
              </Badge>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
