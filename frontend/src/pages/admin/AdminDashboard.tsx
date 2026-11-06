import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bike,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  FullPageLoader,
  StatusPill,
  cn,
} from '../../components/ui';
import { api } from '../../lib/api';
import { money, relativeTime, shortDate } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type { AdminRiderListItem, AdminStats, Booking } from '../../types';

interface RidersResponse {
  riders: AdminRiderListItem[];
  total: number;
}

export default function AdminDashboard() {
  const statsQuery = useQuery<AdminStats>((signal) => api.get('/admin/stats', { signal }), []);
  const pendingQuery = useQuery<RidersResponse>(
    (signal) => api.get<RidersResponse>('/admin/riders?status=pending&limit=5', { signal }),
    [],
  );
  const ridesQuery = useQuery<{ rides: Booking[]; total: number }>(
    (signal) => api.get<{ rides: Booking[]; total: number }>('/admin/bookings?limit=6', { signal }),
    [],
  );

  const stats = statsQuery.data;
  const pending = pendingQuery.data?.riders ?? [];
  const rides = ridesQuery.data?.rides ?? [];

  if (statsQuery.loading && !stats) {
    return <FullPageLoader label="Loading operations data…" />;
  }

  if (statsQuery.error || !stats) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<ShieldAlert size={22} />}
          title="Dashboard unavailable"
          body={statsQuery.error ?? 'Could not load admin statistics.'}
          action={
            <Button variant="outline" onClick={statsQuery.reload}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const kpis = [
    {
      label: 'Active rides',
      value: String(stats.activeRides),
      icon: Bike,
      tone: 'bg-mango-100 text-[#8a5c00]',
      hint: 'Searching or on the road',
      to: '/admin/live',
    },
    {
      label: 'Online riders',
      value: String(stats.onlineRiders),
      icon: TrendingUp,
      tone: 'bg-teal-100 text-teal-700',
      hint: `${stats.approvedRiders} approved in total`,
      to: '/admin/riders?status=approved',
    },
    {
      label: 'Pending approvals',
      value: String(stats.pendingRiders),
      icon: Clock3,
      tone: 'bg-danger-100 text-danger',
      hint: stats.pendingRiders ? 'Review documents' : 'All clear',
      to: '/admin/riders?status=pending',
    },
    {
      label: 'Revenue today',
      value: money(stats.revenueToday),
      icon: CircleDollarSign,
      tone: 'bg-success-100 text-success',
      hint: `${stats.completedToday} completed rides`,
      to: '/admin/reports',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'Asia/Kolkata',
            })}
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Operations dashboard
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {stats.customers} customers · {stats.riders} riders · {stats.totalRides} total bookings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              statsQuery.reload();
              pendingQuery.reload();
              ridesQuery.reload();
            }}
            icon={<RefreshCw size={15} />}
          >
            Refresh
          </Button>
          <Link to="/admin/live">
            <Button icon={<ArrowUpRight size={16} />}>Live map</Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="rounded-3xl border border-line/80 bg-white p-4 transition hover:border-ink/20 hover:shadow-lift"
          >
            <div className="flex items-start justify-between">
              <span className={cn('grid h-9 w-9 place-items-center rounded-xl', item.tone)}>
                <item.icon size={17} />
              </span>
              <ArrowUpRight size={14} className="text-muted/60" />
            </div>
            <p className="mt-3 font-display text-[26px] font-semibold leading-none text-ink">
              {item.value}
            </p>
            <p className="mt-1 text-[11.5px] font-semibold text-ink/80">{item.label}</p>
            <p className="text-[10.5px] text-muted">{item.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.45fr_1fr]">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                Today
              </p>
              <p className="font-display text-[17px] font-semibold text-ink">
                {money(stats.revenueToday)} collected
              </p>
            </div>
            <Badge tone="teal">{stats.ridesToday} bookings</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-cream px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                <CheckCircle2 size={11} className="text-success" /> Completed
              </p>
              <p className="mt-1 font-display text-[19px] font-semibold text-ink">
                {stats.completedToday}
              </p>
            </div>
            <div className="rounded-2xl bg-cream px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                <XCircle size={11} className="text-danger" /> Cancelled
              </p>
              <p className="mt-1 font-display text-[19px] font-semibold text-ink">
                {stats.cancelledToday}
              </p>
            </div>
            <div className="rounded-2xl bg-cream px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                <Bike size={11} className="text-teal" /> Active
              </p>
              <p className="mt-1 font-display text-[19px] font-semibold text-ink">
                {stats.activeRides}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-ink px-3.5 py-3 text-cream">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">All-time</p>
              <p className="font-display text-[18px] font-semibold">{money(stats.revenueTotal)}</p>
            </div>
            <div className="text-right text-[11px] text-cream/60">
              <p>{stats.completedRides} completed</p>
              <p>{stats.cancelledRides} cancelled</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
              Needs attention
            </p>
            <Link to="/admin/riders?status=pending" className="text-[11.5px] font-semibold text-teal">
              Review all
            </Link>
          </div>

          {pendingQuery.loading && !pendingQuery.data ? (
            <p className="py-6 text-center text-[12px] text-muted">Loading riders…</p>
          ) : pending.length ? (
            <ul className="divide-y divide-line/60">
              {pending.map((rider) => (
                <li key={rider.id}>
                  <Link
                    to={`/admin/riders/${rider.id}`}
                    className="flex items-center gap-2.5 py-2.5"
                  >
                    <Avatar name={rider.name} photoUrl={rider.photoUrl} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{rider.name}</p>
                      <p className="text-[10.5px] text-muted">
                        {rider.mobile} · joined {shortDate(rider.createdAt)}
                      </p>
                    </div>
                    <Badge tone="mango">pending</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl bg-success-100 px-3 py-3 text-[12px] font-medium text-success">
              <CheckCircle2 size={16} /> No pending applications.
            </div>
          )}

          <div className="rounded-2xl bg-cream px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Users size={14} className="text-teal" />
              {stats.offlineRiders} approved riders are offline right now.
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
              Latest bookings
            </p>
            <p className="text-[12px] text-muted">Most recent requests across the service area</p>
          </div>
          <Link to="/admin/bookings" className="text-[11.5px] font-semibold text-teal">
            All bookings
          </Link>
        </div>

        {ridesQuery.loading && !ridesQuery.data ? (
          <p className="py-6 text-center text-[12px] text-muted">Loading bookings…</p>
        ) : rides.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-1 px-1 text-left">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-2 py-1 font-semibold">Code</th>
                  <th className="px-2 py-1 font-semibold">Customer</th>
                  <th className="px-2 py-1 font-semibold">Route</th>
                  <th className="px-2 py-1 font-semibold">Status</th>
                  <th className="px-2 py-1 font-semibold">Fare</th>
                  <th className="px-2 py-1 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((ride) => (
                  <tr key={ride.id} className="bg-cream/60">
                    <td className="rounded-l-xl px-2 py-2">
                      <Link
                        to={`/admin/bookings/${ride.id}`}
                        className="font-mono text-[10.5px] font-semibold text-teal"
                      >
                        {ride.code}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-[11.5px] text-ink">
                      {ride.customer?.name ?? '—'}
                    </td>
                    <td className="max-w-[190px] px-2 py-2">
                      <p className="truncate text-[11.5px] text-ink">{ride.pickup.label}</p>
                      <p className="truncate text-[10.5px] text-muted">→ {ride.destination.label}</p>
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill status={ride.status} />
                    </td>
                    <td className="px-2 py-2 text-[11.5px] font-semibold text-ink">
                      {money(ride.fare.total)}
                    </td>
                    <td className="rounded-r-xl px-2 py-2 text-[10.5px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={11} /> {relativeTime(ride.createdAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-[12px] text-muted">No bookings yet.</p>
        )}
      </Card>
    </div>
  );
}
