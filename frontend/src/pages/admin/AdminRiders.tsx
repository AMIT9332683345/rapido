import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bike, ChevronLeft, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
} from '../../components/ui';
import { api } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type { AdminRiderListItem, RiderStatus } from '../../types';

interface RidersResponse {
  riders: AdminRiderListItem[];
  total: number;
  page: number;
  pages: number;
}

type Filter = 'all' | RiderStatus;

const TONES: Record<RiderStatus, 'mango' | 'success' | 'danger' | 'muted'> = {
  pending: 'mango',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
};

export default function AdminRiders() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'all') as Filter;
  const page = Math.max(1, Number(params.get('page') ?? 1));

  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(search);

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

  const query = useQuery<RidersResponse>(
    (signal) =>
      api.get<RidersResponse>(
        `/admin/riders?status=${status === 'all' ? '' : status}&search=${encodeURIComponent(
          debounced,
        )}&page=${page}&limit=20`,
        { signal },
      ),
    [status, debounced, page],
  );

  const riders = query.data?.riders ?? [];

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Rider network
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Riders
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {query.data?.total ?? 0} rider{query.data?.total === 1 ? '' : 's'} matching this view
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <SegmentedControl<Filter>
          value={status}
          onChange={(value) => updateParams({ status: value === 'all' ? null : value, page: '1' })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <div className="relative">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 60))}
            placeholder="Search by name or mobile"
            icon={<Search size={16} />}
          />
        </div>
      </div>

      {query.loading && !query.data ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : query.error ? (
        <div className="mt-4">
          <EmptyState
            icon={<Bike size={22} />}
            title="Could not load riders"
            body={query.error}
            action={
              <Button variant="outline" onClick={query.reload}>
                Retry
              </Button>
            }
          />
        </div>
      ) : riders.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title="No riders in this view"
            body="Try another status or clear the search."
          />
        </div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-hidden rounded-3xl border border-line/80 bg-white lg:block">
            <table className="w-full text-left">
              <thead className="bg-cream/70 text-[9.5px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Rider</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Availability</th>
                  <th className="px-4 py-2.5 font-semibold">Rides</th>
                  <th className="px-4 py-2.5 font-semibold">Documents</th>
                  <th className="px-4 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {riders.map((rider) => (
                  <tr key={rider.id} className="hover:bg-cream/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={rider.name} photoUrl={rider.photoUrl} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-ink">{rider.name}</p>
                          <p className="text-[10.5px] text-muted">{rider.mobile}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TONES[rider.status]}>{rider.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                        <span
                          className={cnDot(rider.isOnline)}
                        />
                        {rider.currentBooking ? 'On a ride' : rider.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11.5px] text-ink">{rider.totalRides}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rider.documents.length ? (
                          rider.documents.map((doc) => (
                            <span
                              key={doc.kind}
                              title={`${doc.kind}: ${doc.status}`}
                              className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
                                doc.status === 'approved'
                                  ? 'bg-success-100 text-success'
                                  : doc.status === 'pending'
                                    ? 'bg-mango-100 text-[#8a5c00]'
                                    : 'bg-danger-100 text-danger'
                              }`}
                            >
                              {doc.kind}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10.5px] text-muted">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[10.5px] text-muted">
                      {relativeTime(rider.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/riders/${rider.id}`}
                        className="text-[11.5px] font-semibold text-teal"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-2 lg:hidden">
            {riders.map((rider) => (
              <Link key={rider.id} to={`/admin/riders/${rider.id}`}>
                <Card className="flex items-center gap-3 p-3.5">
                  <Avatar name={rider.name} photoUrl={rider.photoUrl} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-ink">{rider.name}</p>
                      <Badge tone={TONES[rider.status]}>{rider.status}</Badge>
                    </div>
                    <p className="text-[11px] text-muted">
                      {rider.mobile} · {rider.totalRides} rides ·{' '}
                      {rider.isOnline ? 'online' : 'offline'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {rider.documents.length} document{rider.documents.length === 1 ? '' : 's'} ·{' '}
                      {relativeTime(rider.createdAt)}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Card>
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

function cnDot(online: boolean) {
  return `h-1.5 w-1.5 rounded-full ${online ? 'bg-success' : 'bg-ink/20'}`;
}
