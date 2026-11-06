import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, ReceiptText } from 'lucide-react';
import { PageHeader } from '../../components/layout';
import NotificationsButton from '../../components/NotificationsButton';
import { RideCard } from '../../components/ride';
import { Button, EmptyState, SegmentedControl, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/useQuery';
import type { Booking } from '../../types';

type Filter = 'all' | 'active' | 'completed' | 'cancelled';

interface RidesResponse {
  rides: Booking[];
  total: number;
  page: number;
  pages: number;
}

export default function CustomerRides() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const query = useQuery<RidesResponse>(
    (signal) =>
      api.get<RidesResponse>(`/customer/rides?filter=${filter}&page=${page}&limit=20`, { signal }),
    [filter, page],
  );

  const rides = query.data?.rides ?? [];
  const pages = query.data?.pages ?? 1;

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-24">
      <PageHeader
        title="My rides"
        subtitle="Every bike trip, receipt and cancellation"
        right={<NotificationsButton />}
      />

      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-3">
        <SegmentedControl<Filter>
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />

        {query.loading && !query.data ? (
          <div className="space-y-2.5">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : query.error ? (
          <EmptyState
            icon={<Bike size={22} />}
            title="Could not load your rides"
            body={query.error}
            action={
              <Button variant="outline" onClick={query.reload}>
                Try again
              </Button>
            }
          />
        ) : rides.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={22} />}
            title={filter === 'all' ? 'No rides yet' : `No ${filter} rides`}
            body="Book a bike from the home screen. Your receipts and ride codes stay here."
            action={
              <Link to="/app">
                <Button>Book a bike</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {rides.map((ride) => (
              <RideCard key={ride.id} ride={ride} href={`/app/ride/${ride.id}`} counterpart="rider" />
            ))}

            {page < pages ? (
              <Button
                variant="outline"
                block
                loading={query.loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Load more rides
              </Button>
            ) : (
              <p className="py-3 text-center text-[11.5px] text-muted">
                {query.data?.total} ride{query.data?.total === 1 ? '' : 's'} in total
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
