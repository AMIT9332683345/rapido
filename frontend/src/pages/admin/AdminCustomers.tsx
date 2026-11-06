import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Search,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
} from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { dateTime, money, relativeTime } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useToast } from '../../context/ToastContext';
import type { AdminCustomer } from '../../types';

interface CustomersResponse {
  customers: AdminCustomer[];
  total: number;
  page: number;
  pages: number;
}

type Filter = 'all' | 'active' | 'blocked';

export default function AdminCustomers() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') ?? 'all') as Filter;
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const toast = useToast();

  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(search);
  const [target, setTarget] = useState<AdminCustomer | null>(null);
  const [saving, setSaving] = useState(false);

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

  const query = useQuery<CustomersResponse>(
    (signal) =>
      api.get<CustomersResponse>(
        `/admin/customers?blocked=${
          filter === 'all' ? '' : filter === 'blocked' ? 'true' : 'false'
        }&search=${encodeURIComponent(debounced)}&page=${page}&limit=20`,
        { signal },
      ),
    [filter, debounced, page],
  );

  const customers = query.data?.customers ?? [];

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setParams(next, { replace: true });
  };

  const changeBlock = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await api.patch(`/admin/customers/${target.id}/block`, {
        blocked: !target.isBlocked,
      });
      toast.success(
        target.isBlocked ? `${target.name} can book again.` : `${target.name} is blocked.`,
      );
      setTarget(null);
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
          Customer base
        </p>
        <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
          Customers
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {query.data?.total ?? 0} customer{query.data?.total === 1 ? '' : 's'} matching this view
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <SegmentedControl<Filter>
          value={filter}
          onChange={(value) => updateParams({ filter: value === 'all' ? null : value, page: '1' })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'blocked', label: 'Blocked' },
          ]}
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value.slice(0, 60))}
          placeholder="Search by name or mobile"
          icon={<Search size={16} />}
        />
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
            icon={<Users size={22} />}
            title="Could not load customers"
            body={query.error}
            action={
              <Button variant="outline" onClick={query.reload}>
                Retry
              </Button>
            }
          />
        </div>
      ) : customers.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Users size={22} />}
            title="No customers in this view"
            body="Try another filter or clear the search."
          />
        </div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-hidden rounded-3xl border border-line/80 bg-white lg:block">
            <table className="w-full text-left">
              <thead className="bg-cream/70 text-[9.5px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Rides</th>
                  <th className="px-4 py-2.5 font-semibold">Spent</th>
                  <th className="px-4 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-cream/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={customer.name} photoUrl={customer.photoUrl} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-ink">
                            {customer.name}
                          </p>
                          <p className="text-[10.5px] text-muted">{customer.mobile}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={customer.isBlocked ? 'danger' : 'success'}>
                        {customer.isBlocked ? 'Blocked' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[11.5px] text-ink">
                      {customer.completed} completed
                      <span className="text-muted"> / {customer.rides}</span>
                    </td>
                    <td className="px-4 py-3 text-[11.5px] font-semibold text-ink">
                      {money(customer.spent)}
                    </td>
                    <td className="px-4 py-3 text-[10.5px] text-muted" title={dateTime(customer.createdAt)}>
                      {relativeTime(customer.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant={customer.isBlocked ? 'outline' : 'ghost'}
                        icon={
                          customer.isBlocked ? (
                            <CircleCheck size={14} />
                          ) : (
                            <Ban size={14} />
                          )
                        }
                        onClick={() => setTarget(customer)}
                      >
                        {customer.isBlocked ? 'Unblock' : 'Block'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-2 lg:hidden">
            {customers.map((customer) => (
              <Card key={customer.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name} photoUrl={customer.photoUrl} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {customer.name}
                      </p>
                      <Badge tone={customer.isBlocked ? 'danger' : 'success'}>
                        {customer.isBlocked ? 'Blocked' : 'Active'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted">
                      {customer.mobile} · {customer.completed}/{customer.rides} rides
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {money(customer.spent)} spent · joined {relativeTime(customer.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  block
                  variant={customer.isBlocked ? 'outline' : 'ghost'}
                  className="mt-3"
                  icon={customer.isBlocked ? <CircleCheck size={14} /> : <Ban size={14} />}
                  onClick={() => setTarget(customer)}
                >
                  {customer.isBlocked ? 'Unblock customer' : 'Block customer'}
                </Button>
              </Card>
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

      <ConfirmDialog
        open={Boolean(target)}
        title={target?.isBlocked ? 'Unblock this customer?' : 'Block this customer?'}
        body={
          target?.isBlocked
            ? `${target?.name} will be able to book rides again.`
            : `${target?.name} will not be able to book new rides until unblocked. Active rides are not cancelled automatically.`
        }
        confirmLabel={target?.isBlocked ? 'Unblock' : 'Block'}
        tone={target?.isBlocked ? 'primary' : 'danger'}
        loading={saving}
        onConfirm={changeBlock}
        onClose={() => {
          if (!saving) setTarget(null);
        }}
      />
    </div>
  );
}
