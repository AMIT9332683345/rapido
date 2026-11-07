import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  ReceiptIndianRupee,
  Search,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  StatusPill,
} from '../../components/ui';
import { api, downloadWithAuth, errorMessage } from '../../lib/api';
import { money, relativeTime, shortDate, shortTime } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useToast } from '../../context/ToastContext';
import type { Booking } from '../../types';
import { APP_NAME } from '../../config';

interface BookingsResponse {
  rides: Booking[];
  total: number;
  page: number;
  pages: number;
}

type Filter = 'all' | 'active' | 'completed' | 'cancelled';

const STATUS_FILTERS: Record<Filter, string> = {
  all: '',
  active: 'SEARCHING,REQUESTED,ACCEPTED,RIDER_ARRIVING,RIDER_ARRIVED,IN_PROGRESS',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED,EXPIRED',
};

export default function AdminBookings() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') ?? 'all') as Filter;
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const toast = useToast();

  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(search);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if ((params.get('search') ?? '') === debounced) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set('search', debounced);
    else next.delete('search');
    next.set('page', '1');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filterQuery = () => {
    const query = new URLSearchParams();
    if (STATUS_FILTERS[filter]) query.set('status', STATUS_FILTERS[filter]);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (debounced) query.set('search', debounced);
    return query;
  };

  const query = useQuery<BookingsResponse>(
    (signal) => {
      const searchParams = filterQuery();
      searchParams.set('page', String(page));
      searchParams.set('limit', '20');
      return api.get<BookingsResponse>(`/admin/bookings?${searchParams.toString()}`, { signal });
    },
    [filter, from, to, debounced, page],
  );

  const rides = query.data?.rides ?? [];

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setParams(next, { replace: true });
  };

  const exportCsv = async () => {
    setDownloading(true);
    try {
      await downloadWithAuth(
        `/admin/bookings/export.csv?${filterQuery().toString()}`,
        `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-bookings-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast.success('Booking report downloaded.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Ride ledger
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Bookings
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {query.data?.total ?? 0} booking{query.data?.total === 1 ? '' : 's'} matching this view
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Download size={15} />}
          loading={downloading}
          onClick={exportCsv}
        >
          Export CSV
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <SegmentedControl<Filter>
          value={filter}
          onChange={(value) => updateParams({ filter: value === 'all' ? null : value, page: '1' })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value.slice(0, 60))}
          placeholder="Search code, customer or rider"
          icon={<Search size={16} />}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              From
            </span>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => updateParams({ from: event.target.value, page: '1' })}
              className="h-11 text-[13px]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              To
            </span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => updateParams({ to: event.target.value, page: '1' })}
              className="h-11 text-[13px]"
            />
          </label>
        </div>
        {from || to ? (
          <button
            type="button"
            onClick={() => updateParams({ from: null, to: null, page: '1' })}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal"
          >
            <CalendarRange size={13} /> Clear date range
          </button>
        ) : null}
      </div>

      {query.loading && !query.data ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : query.error ? (
        <div className="mt-4">
          <EmptyState
            icon={<ReceiptIndianRupee size={22} />}
            title="Could not load bookings"
            body={query.error}
            action={
              <Button variant="outline" onClick={query.reload}>
                Retry
              </Button>
            }
          />
        </div>
      ) : rides.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<ReceiptIndianRupee size={22} />}
            title="No bookings in this view"
            body="Adjust the filters, dates or search."
          />
        </div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-hidden rounded-3xl border border-line/80 bg-white lg:block">
            <table className="w-full text-left">
              <thead className="bg-cream/70 text-[9.5px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Booking</th>
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Rider</th>
                  <th className="px-4 py-2.5 font-semibold">Route</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {rides.map((ride) => (
                  <tr key={ride.id} className="hover:bg-cream/40">
                    <td className="px-4 py-3">
                      <Link to={`/admin/bookings/${ride.id}`} className="block">
                        <p className="font-mono text-[11.5px] font-semibold tracking-wide text-ink">
                          {ride.code}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {shortDate(ride.createdAt)} · {shortTime(ride.createdAt)}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="truncate text-[12px] font-medium text-ink">
                        {ride.customer?.name ?? '—'}
                      </p>
                      <p className="text-[10px] text-muted">{ride.customer?.mobile ?? ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      {ride.rider ? (
                        <>
                          <p className="truncate text-[12px] font-medium text-ink">
                            {ride.rider.name}
                          </p>
                          <p className="text-[10px] text-muted">
                            {ride.rider.vehicle?.registrationNumber ?? ride.rider.mobile ?? ''}
                          </p>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="max-w-[240px] px-4 py-3">
                      <p className="truncate text-[11.5px] text-ink">{ride.pickup.label}</p>
                      <p className="truncate text-[10.5px] text-muted">
                        → {ride.destination.label}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={ride.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-[12px] font-semibold text-ink">
                        {money(
                          ride.status === 'COMPLETED'
                            ? (ride.fare.final ?? ride.fare.estimated)
                            : ride.status === 'CANCELLED' || ride.status === 'EXPIRED'
                              ? ride.fare.cancellationFee
                              : ride.fare.estimated,
                        )}
                      </p>
                      <p className="text-[9.5px] uppercase tracking-wide text-muted">
                        {ride.payment.status}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-2 lg:hidden">
            {rides.map((ride) => (
              <Link
                key={ride.id}
                to={`/admin/bookings/${ride.id}`}
                className="block rounded-3xl border border-line/80 bg-white p-4 transition hover:border-ink/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={ride.status} />
                  <span className="font-mono text-[10.5px] font-semibold tracking-wide text-muted">
                    {ride.code}
                  </span>
                </div>
                <div className="mt-2.5 flex items-start gap-2.5">
                  <div className="mt-1 flex flex-col items-center">
                    <span className="h-2 w-2 rounded-full border-2 border-ink bg-cream" />
                    <span className="my-0.5 h-4 w-px border-l border-dashed border-ink/25" />
                    <span className="h-2 w-2 rounded-[2px] bg-mango" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">
                      {ride.pickup.label}
                    </p>
                    <p className="truncate text-[11.5px] text-muted">{ride.destination.label}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-muted">
                      {ride.customer?.name ?? 'No customer'} →{' '}
                      {ride.rider?.name ?? 'No rider yet'}
                    </p>
                    <p className="text-[10px] text-muted">
                      {shortDate(ride.createdAt)} · {shortTime(ride.createdAt)} ·{' '}
                      {relativeTime(ride.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-[14px] font-semibold text-ink">
                    {money(
                      ride.status === 'COMPLETED'
                        ? (ride.fare.final ?? ride.fare.estimated)
                        : ride.status === 'CANCELLED' || ride.status === 'EXPIRED'
                          ? ride.fare.cancellationFee
                          : ride.fare.estimated,
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
              icon={<ChevronLeft size={15} />}
            >
              Previous
            </Button>
            <span className="text-[11.5px] text-muted">
              Page {query.data?.page ?? page} of {query.data?.pages ?? 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (query.data?.pages ?? 1)}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
