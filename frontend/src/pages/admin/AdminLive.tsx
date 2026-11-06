import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, Clock, Map as MapIcon, Radar, RefreshCw, UserRound } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Skeleton,
  StatusPill,
} from '../../components/ui';
import MapView, { type MapMarker } from '../../components/MapView';
import { api } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { useQuery, useTimeAgo } from '../../lib/useQuery';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import type { LiveSnapshot, ServiceAreaInfo } from '../../types';

interface RiderLocationPayload {
  riderId: string;
  lat: number;
  lng: number;
  bookingId: string | null;
  recordedAt: string;
}

export default function AdminLive() {
  const { connected } = useSocket();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const age = useTimeAgo(lastSync ?? undefined);

  const query = useQuery<LiveSnapshot>(
    (signal) => api.get<LiveSnapshot>('/admin/live', { signal }),
    [],
  );
  const area = useQuery<ServiceAreaInfo>(
    (signal) => api.get<ServiceAreaInfo>('/geo/service-area', { signal }),
    [],
  );

  useEffect(() => {
    if (query.data) setLastSync(query.data.serverTime);
  }, [query.data]);

  useEffect(() => {
    const timer = window.setInterval(() => query.reload(), 12000);
    return () => window.clearInterval(timer);
  }, [query.reload]);

  useSocketEvent('booking:update', () => query.reload());

  useSocketEvent<RiderLocationPayload>('admin:rider-location', (payload) => {
    setLastSync(new Date().toISOString());
    query.setData((current) => {
      if (!current) return current;
      return {
        ...current,
        riders: current.riders.map((rider) =>
          rider.id === payload.riderId
            ? { ...rider, location: { lat: payload.lat, lng: payload.lng }, lastLocationAt: payload.recordedAt }
            : rider,
        ),
        rides: current.rides.map((ride) =>
          ride.rider && ride.rider.id === payload.riderId
            ? {
                ...ride,
                rider: { ...ride.rider, location: { lat: payload.lat, lng: payload.lng } },
              }
            : ride,
        ),
      };
    });
  });

  const snapshot = query.data;
  const rides = snapshot?.rides ?? [];
  const riders = snapshot?.riders ?? [];

  const markers: MapMarker[] = [];
  riders.forEach((rider) => {
    if (!rider.location) return;
    markers.push({
      id: `rider-${rider.id}`,
      kind: 'rider',
      lat: rider.location.lat,
      lng: rider.location.lng,
      label: `${rider.name}${rider.currentBooking ? ' · on a ride' : ' · free'}`,
      onClick: () => setSelectedRider(rider.id),
    });
  });
  rides.forEach((ride) => {
    markers.push({
      id: `pickup-${ride.id}`,
      kind: 'pickup',
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      label: `${ride.code} pickup`,
    });
    markers.push({
      id: `dest-${ride.id}`,
      kind: 'destination',
      lat: ride.destination.lat,
      lng: ride.destination.lng,
      label: `${ride.code} destination`,
    });
  });

  const riderCard = riders.find((rider) => rider.id === selectedRider) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Real-time operations
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-[26px] font-semibold leading-tight text-ink">
            Live map
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                connected ? 'bg-success-100 text-success' : 'bg-danger-100 text-danger'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`}
              />
              {connected ? 'Socket live' : 'Polling'}
            </span>
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {rides.length} active ride{rides.length === 1 ? '' : 's'} · {riders.length} rider
            {riders.length === 1 ? '' : 's'} sharing location
            {lastSync ? ` · updated ${age}` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw size={14} className={query.loading ? 'animate-spin' : ''} />}
          onClick={query.reload}
        >
          Refresh
        </Button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative h-[420px] overflow-hidden rounded-3xl border border-line/80 lg:h-[calc(100dvh-190px)] lg:min-h-[520px]">
          <MapView
            markers={markers}
            boundary={area.data?.boundary ?? null}
            fit="markers"
            fitKey={`live-${rides.length}-${riders.length}`}
            padding={{ top: 60, bottom: 60, left: 60, right: 60 }}
            zoom={13}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-ink shadow-sm">
              <span className="h-2 w-2 rounded-full bg-teal" /> Rider location
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-ink shadow-sm">
              <span className="h-2 w-2 rounded-full bg-ink" /> Pickup / drop
            </span>
          </div>
          {selectedRider && riderCard ? (
            <div className="absolute right-3 top-14 z-10 w-[220px] rounded-2xl border border-line/80 bg-white/95 p-3 shadow-lift backdrop-blur">
              <div className="flex items-center gap-2">
                <Avatar name={riderCard.name} photoUrl={riderCard.photoUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-ink">{riderCard.name}</p>
                  <p className="text-[10px] text-muted">{riderCard.mobile}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRider(null)}
                  className="text-[10px] font-semibold text-muted"
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-[10.5px] text-muted">
                {riderCard.currentBooking ? 'On a ride' : 'Available'} · last seen{' '}
                {riderCard.lastLocationAt ? relativeTime(riderCard.lastLocationAt) : 'just now'}
              </p>
              <Link
                to={`/admin/riders/${riderCard.id}`}
                className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-teal"
              >
                <UserRound size={12} /> Open profile
              </Link>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <Card className="p-3.5">
            <SectionTitle
              title="Active rides"
              action={<Badge tone="teal">{rides.length}</Badge>}
            />
            {query.loading && !snapshot ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : query.error ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Radar size={20} />}
                  title="Live feed unavailable"
                  body={query.error}
                  action={
                    <Button size="sm" variant="outline" onClick={query.reload}>
                      Retry
                    </Button>
                  }
                  className="py-6"
                />
              </div>
            ) : rides.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<MapIcon size={20} />}
                  title="No rides in motion"
                  body="Active bookings appear here the moment a customer requests one."
                  className="py-6"
                />
              </div>
            ) : (
              <div className="mt-3 max-h-[calc(100dvh-310px)] space-y-2 overflow-y-auto pr-0.5">
                {rides.map((ride) => (
                  <Link
                    key={ride.id}
                    to={`/admin/bookings/${ride.id}`}
                    className="block rounded-2xl border border-line/70 bg-cream/40 px-3 py-2.5 transition hover:border-ink/20 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill status={ride.status} />
                      <span className="font-mono text-[10px] font-semibold tracking-wide text-muted">
                        {ride.code}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-[12px] font-semibold text-ink">
                      {ride.pickup.label} → {ride.destination.label}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted">
                      <span className="truncate">
                        {ride.customer?.name ?? 'Customer'} ·{' '}
                        {ride.rider?.name ?? 'Searching for a rider'}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <Clock size={10} /> {relativeTime(ride.createdAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-3.5">
            <SectionTitle
              title="Online riders"
              action={<Badge tone="success">{riders.length}</Badge>}
            />
            {riders.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted">
                No approved rider is online with a recent GPS fix.
              </p>
            ) : (
              <div className="mt-2.5 max-h-[280px] space-y-1.5 overflow-y-auto pr-0.5">
                {riders.map((rider) => (
                  <button
                    key={rider.id}
                    type="button"
                    onClick={() => setSelectedRider(rider.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${
                      selectedRider === rider.id ? 'bg-teal-100/70' : 'hover:bg-cream'
                    }`}
                  >
                    <Avatar name={rider.name} photoUrl={rider.photoUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-ink">{rider.name}</p>
                      <p className="text-[10px] text-muted">
                        {rider.currentBooking ? 'On a ride' : 'Free'} · {rider.totalRides} rides
                      </p>
                    </div>
                    <Bike size={13} className="shrink-0 text-teal" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
