import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, Route } from 'lucide-react';
import { PageHeader } from '../../components/layout';
import NotificationsButton from '../../components/NotificationsButton';
import { RideCard } from '../../components/ride';
import { Button, EmptyState, SegmentedControl, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/useQuery';
import type { Booking } from '../../types';

type Filter = 'all' | 'active' | 'completed' | 'cancelled';

export default function RiderRides() {
  const [filter, setFilter] = useState<Filter>('all');

  const query = useQuery<{ rides: Booking[] }>(
    (signal) => api.get<{ rides: Booking[] }>(`/rider/rides?filter=${filter}`, { signal }),
    [filter],
  );

  const rides = query.data?.rides ?? [];

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-24">
      <PageHeader
        title="Ride history"
        subtitle="Your last 50 assigned trips"
        right={<NotificationsButton />}
      />

      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-3">
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
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
            title="Could not load rides"
            body={query.error}
            action={
              <Button variant="outline" onClick={query.reload}>
                Try again
              </Button>
            }
          />
        ) : rides.length === 0 ? (
          <EmptyState
            icon={<Route size={22} />}
            title={filter === 'all' ? 'No rides assigned yet' : `No ${filter} rides`}
            body={
              filter === 'all'
                ? 'Go online from the drive screen and accept requests. Your trips appear here.'
                : 'Try another filter.'
            }
            action={
              <Link to="/rider">
                <Button>Back to drive</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {rides.map((ride) => (
              <RideCard key={ride.id} ride={ride} href={`/rider/ride/${ride.id}`} counterpart="customer" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
