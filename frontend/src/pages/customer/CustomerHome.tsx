import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  Crosshair,
  IndianRupee,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import MapView, { type MapMarker } from '../../components/MapView';
import PlaceSearch from '../../components/PlaceSearch';
import LocationPicker from '../../components/LocationPicker';
import NotificationsButton from '../../components/NotificationsButton';
import { MapTopBar } from '../../components/layout';
import { Button, Card, Field, Sheet, Spinner, Textarea, Badge, cn } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { DEFAULT_CENTER, SERVICE_LOCATION } from '../../config';
import { getPosition } from '../../lib/geolocation';
import { km, minutes, money } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type {
  Booking,
  NearbyRider,
  Place,
  PlaceResult,
  RouteEstimate,
  SavedLocation,
  ServiceAreaInfo,
} from '../../types';

type Target = 'pickup' | 'destination';

function greeting(name?: string | null) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export default function CustomerHome() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [searchTarget, setSearchTarget] = useState<Target | null>(null);
  const [pinTarget, setPinTarget] = useState<Target | null>(null);
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [locating, setLocating] = useState(true);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [self, setSelf] = useState<{ lat: number; lng: number } | null>(null);
  const reverseToken = useRef({ pickup: 0, destination: 0 });

  const areaQuery = useQuery<ServiceAreaInfo>(
    (signal) => api.get<ServiceAreaInfo>('/geo/service-area', { auth: false, signal }),
    [],
  );
  const area = areaQuery.data;

  const savedQuery = useQuery<SavedLocation[]>(
    (signal) => api.get<SavedLocation[]>('/customer/saved-locations', { signal }),
    [user?.id],
    { enabled: Boolean(user), clearOnLoad: true },
  );

  const activeQuery = useQuery<{ booking: Booking | null }>(
    (signal) => api.get<{ booking: Booking | null }>('/customer/bookings/active', { signal }),
    [user?.id],
    { enabled: Boolean(user), clearOnLoad: true },
  );
  const active = activeQuery.data?.booking ?? null;

  useSocketEvent<Booking>('booking:update', (payload) => {
    if (payload?.id && ['SEARCHING', 'REQUESTED', 'ACCEPTED'].includes(payload.status)) {
      activeQuery.reload();
    }
  });

  /* Use the device location once, with a safe fallback inside the service area. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const coords = await getPosition();
        if (!alive) return;
        setSelf(coords);
        let place: Place = {
          label: 'My current location',
          address: null,
          lat: coords.lat,
          lng: coords.lng,
        };
        try {
          const reverse = await api.get<{ place: PlaceResult | null }>(
            `/geo/reverse?lat=${coords.lat}&lng=${coords.lng}`,
          );
          if (reverse.place) {
            place = {
              label: reverse.place.label,
              address: reverse.place.address,
              lat: coords.lat,
              lng: coords.lng,
            };
          }
        } catch {
          // Coordinates are still usable if reverse geocoding fails.
        }
        if (alive) setPickup((current) => current ?? place);
      } catch {
        if (alive) setLocationUnavailable(true);
      } finally {
        if (alive) setLocating(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* Nearby approved riders around the pickup point. */
  const nearbyQuery = useQuery<{ riders: NearbyRider[] }>(
    (signal) =>
      api.get<{ riders: NearbyRider[] }>(
        `/geo/nearby-riders?lat=${pickup?.lat ?? DEFAULT_CENTER.lat}&lng=${
          pickup?.lng ?? DEFAULT_CENTER.lng
        }`,
        { signal },
      ),
    [pickup?.lat, pickup?.lng],
    { enabled: Boolean(pickup && user), clearOnLoad: true },
  );
  const nearby = nearbyQuery.data?.riders ?? [];

  const selectionKey = `${pickup?.lat}:${pickup?.lng}:${destination?.lat}:${destination?.lng}`;
  const estimateQuery = useQuery<RouteEstimate & { selectionKey: string }>(
    async (signal) => ({
      ...(await api.post<RouteEstimate>(
        '/geo/estimate',
        {
          pickup: { label: pickup?.label, address: pickup?.address, lat: pickup?.lat, lng: pickup?.lng },
          destination: {
            label: destination?.label,
            address: destination?.address,
            lat: destination?.lat,
            lng: destination?.lng,
          },
        },
        { signal },
      )),
      selectionKey,
    }),
    [selectionKey],
    { enabled: Boolean(pickup && destination), clearOnLoad: true },
  );

  const estimate = estimateQuery.data?.selectionKey === selectionKey && !estimateQuery.loading && !estimateQuery.error
    ? estimateQuery.data : null;
  const estimateError = estimateQuery.error;

  const reverseInto = useCallback(
    async (target: Target, lat: number, lng: number) => {
      const token = ++reverseToken.current[target];
      const draft: Place = {
        label: 'Dropped pin',
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
      };
      if (target === 'pickup') setPickup(draft);
      else setDestination(draft);

      try {
        const reverse = await api.get<{ place: PlaceResult | null }>(
          `/geo/reverse?lat=${lat}&lng=${lng}`,
        );
        if (token !== reverseToken.current[target] || !reverse.place) return;
        const next: Place = {
          label: reverse.place.label,
          address: reverse.place.address,
          lat,
          lng,
        };
        if (target === 'pickup') setPickup(next);
        else setDestination(next);
      } catch {
        // Keep the coordinate label when reverse geocoding is unavailable.
      }
    },
    [],
  );

  const useMyLocationForPickup = async () => {
    setLocating(true);
    try {
      const coords = await getPosition();
      setSelf(coords);
      setLocationUnavailable(false);
      await reverseInto('pickup', coords.lat, coords.lng);
    } catch (error) {
      toast.error(errorMessage(error), 'Location unavailable');
    } finally {
      setLocating(false);
    }
  };

  const swap = () => {
    if (!pickup || !destination) return;
    setPickup(destination);
    setDestination(pickup);
  };

  const resetRoute = () => {
    setDestination(null);
    setNote('');
  };

  const markers = useMemo<MapMarker[]>(() => {
    const items: MapMarker[] = [];
    if (pickup) {
      items.push({
        id: 'pickup',
        kind: 'pickup',
        lat: pickup.lat,
        lng: pickup.lng,
        label: `Pickup: ${pickup.label}`,
      });
    }
    if (destination) {
      items.push({
        id: 'destination',
        kind: 'destination',
        lat: destination.lat,
        lng: destination.lng,
        label: `Drop: ${destination.label}`,
      });
    }
    nearby.forEach((rider) => {
      items.push({
        id: `nearby-${rider.id}`,
        kind: 'nearby',
        lat: rider.lat,
        lng: rider.lng,
        label: `Available partner · ${km(rider.distanceMeters)} away`,
      });
    });
    return items;
  }, [pickup, destination, nearby]);

  const startBooking = () => {
    if (!pickup || !destination) {
      toast.warning('Choose a pickup and a destination first.');
      return;
    }
    if (!estimate) {
      toast.warning('Wait for the fare estimate before booking.');
      return;
    }
    if (!user) {
      toast.info('Sign in to confirm your booking.');
      navigate('/login?role=customer&next=%2Fapp');
      return;
    }
    setConfirmOpen(true);
  };

  const confirmBooking = async () => {
    if (!pickup || !destination || !estimate || estimateQuery.loading) return;
    setBooking(true);
    try {
      const result = await api.post<{ booking: Booking }>('/customer/bookings', {
        pickup: { label: pickup.label, address: pickup.address, lat: pickup.lat, lng: pickup.lng },
        destination: {
          label: destination.label,
          address: destination.address,
          lat: destination.lat,
          lng: destination.lng,
        },
        note: note.trim() || null,
      });
      setConfirmOpen(false);
      toast.success('Request sent to nearby riders.', 'Looking for a rider');
      navigate(`/app/ride/${result.booking.id}`);
    } catch (error) {
      toast.error(errorMessage(error), 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  const closeAll = () => {
    setSearchTarget(null);
    setConfirmOpen(false);
  };

  return (
    <div className="relative h-full overflow-hidden">
      <MapView
        center={pickup ?? DEFAULT_CENTER}
        markers={markers}
        route={estimate?.route.geometry ?? null}
        routeIsEstimate={estimate?.route.isEstimate}
        boundary={area?.boundary ?? null}
        self={self}
        padding={{ top: 110, bottom: 300, left: 40, right: 40 }}
        fitKey={
          destination
            ? `route-${pickup?.lat}-${pickup?.lng}-${destination.lat}-${destination.lng}`
            : `pickup-${pickup?.lat}-${pickup?.lng}`
        }
        fit={destination ? 'route' : 'none'}
      />

      <MapTopBar role="customer" trailing={<NotificationsButton />} />

      {pinTarget ? (
        <LocationPicker
          key={pinTarget}
          open
          target={pinTarget}
          initial={(pinTarget === 'pickup' ? pickup : destination) ?? pickup ?? area?.center ?? DEFAULT_CENTER}
          boundary={area?.boundary}
          onClose={() => setPinTarget(null)}
          onConfirm={(point) => {
            void reverseInto(pinTarget, point.lat, point.lng);
            setPinTarget(null);
          }}
        />
      ) : null}

      {area && !area.isAvailable ? (
        <div className="absolute inset-x-3 top-[74px] z-20 rounded-2xl border border-mango/40 bg-mango-100 px-3.5 py-2.5 text-[12px] font-medium text-[#7a5200] shadow-lift">
          {area.unavailableMessage || 'Bookings are paused in this area right now.'}
        </div>
      ) : null}

      {active ? (
        <div className="absolute inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30">
          <Card className="border-ink/15 bg-ink text-cream shadow-soft">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-mango">
                <Navigation size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream/60">
                  Ride in progress · {active.code}
                </p>
                <p className="truncate text-[13.5px] font-semibold">
                  {active.status === 'SEARCHING'
                    ? 'Finding a rider near you…'
                    : active.rider
                      ? `${active.rider.name} is on it`
                      : 'Ride update available'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/app/ride/${active.id}`)}
                className="shrink-0 rounded-full bg-mango px-3.5 py-2 text-[12px] font-bold text-ink"
              >
                Track
              </button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-30 max-h-[62%] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-line/70 bg-cream shadow-[0_-18px_40px_-24px_rgba(8,33,31,0.35)]">
          <div className="above-nav mx-auto w-full max-w-lg px-4 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
                  {greeting(user?.name)}
                </p>
                <h1 className="mt-0.5 font-display text-[20px] font-semibold leading-tight text-ink">
                  Where do you want to go?
                </h1>
                <p className="mt-0.5 text-[12px] text-muted">
                  {nearby.length
                    ? `${nearby.length} rider${nearby.length > 1 ? 's' : ''} online nearby`
                    : 'Bike taxi across ' + SERVICE_LOCATION}
                </p>
              </div>
              <Badge tone="teal">
                <IndianRupee size={10} /> Cash
              </Badge>
            </div>

            {locationUnavailable && !pickup ? (
              <p role="status" className="mt-3 rounded-2xl bg-mango-100 px-3 py-2 text-[13px] text-ink">
                Choose your pickup by searching or selecting it on the map.
              </p>
            ) : null}

            <div className="mt-3 rounded-3xl border border-line/80 bg-white p-3">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSearchTarget('pickup')}
                  className="flex w-full items-center gap-3 rounded-2xl px-1 py-1.5 text-left"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink bg-cream" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Pickup
                    </span>
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {locating && !pickup ? 'Finding your location…' : pickup?.label ?? 'Set pickup'}
                    </span>
                  </span>
                  <Search size={16} className="shrink-0 text-muted" />
                </button>

                <div className="ml-[4px] h-3 border-l border-dashed border-ink/25" />

                <button
                  type="button"
                  onClick={() => setSearchTarget('destination')}
                  className="flex w-full items-center gap-3 rounded-2xl px-1 py-1.5 text-left"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-mango" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Drop
                    </span>
                    <span
                      className={cn(
                        'block truncate text-[13px] font-semibold',
                        destination ? 'text-ink' : 'text-muted',
                      )}
                    >
                      {destination?.label ?? 'Where are you going?'}
                    </span>
                  </span>
                  <Search size={16} className="shrink-0 text-muted" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-2.5">
                <button
                  type="button"
                  onClick={() => void useMyLocationForPickup()}
                  disabled={locating}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1.5 text-[11.5px] font-semibold text-ink disabled:opacity-50"
                >
                  {locating ? <Spinner size={13} /> : <Crosshair size={13} className="text-teal" />}
                  My location
                </button>
                <button
                  type="button"
                  onClick={() => setPinTarget(pickup && !destination ? 'destination' : 'pickup')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1.5 text-[11.5px] font-semibold text-ink"
                >
                  <MapPin size={13} className="text-mango-600" />
                  Drop pin
                </button>
                {destination ? (
                  <button
                    type="button"
                    onClick={resetRoute}
                    className="ml-auto text-[11.5px] font-semibold text-muted hover:text-ink"
                  >
                    Clear drop
                  </button>
                ) : null}
              </div>
            </div>

            {estimateQuery.loading && pickup && destination ? (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-3 text-[12.5px] text-muted">
                <Loader2 size={16} className="animate-spin text-teal" />
                Calculating route and fare…
              </div>
            ) : null}

            {estimateError && pickup && destination ? (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">{estimateError}</span>
                <button
                  type="button"
                  onClick={estimateQuery.reload}
                  className="shrink-0 font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {estimate ? (
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between rounded-2xl bg-white px-3.5 py-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">
                      Estimated fare
                    </p>
                    <p className="font-display text-[24px] font-semibold leading-tight text-ink">
                      {money(estimate.fare.estimated, estimate.currency)}
                    </p>
                    <p className="text-[11px] text-muted">
                      {km(estimate.route.distanceMeters)} · {minutes(estimate.route.durationSeconds)} ·
                      cash after the ride
                    </p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-mango">
                    <Bike size={21} />
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={swap}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11.5px] font-semibold text-ink"
                  >
                    <RefreshCw size={13} className="text-teal" /> Swap
                  </button>
                  {estimate.route.isEstimate ? (
                    <span className="rounded-full bg-mango-100 px-3 py-2 text-[10.5px] font-semibold text-[#8a5c00]">
                      Estimate — no road route found
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[10.5px] font-semibold text-muted">
                      <ShieldCheck size={12} className="text-success" /> Fare validated by the server
                    </span>
                  )}
                </div>

                <Button
                  size="xl"
                  block
                  onClick={startBooking}
                  disabled={!area?.isAvailable || estimateQuery.loading || Boolean(estimateError)}
                  icon={<ArrowRight size={19} />}
                >
                  Book bike · {money(estimate.fare.estimated, estimate.currency)}
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white/50 px-4 py-5 text-center text-[12px] leading-relaxed text-muted">
                <Users size={15} className="shrink-0 text-teal" />
                Choose a drop point to see distance, time and the exact fare before booking.
              </div>
            )}
          </div>
        </div>
      )}

      <PlaceSearch
        open={searchTarget !== null}
        onClose={closeAll}
        title={searchTarget === 'pickup' ? 'Set pickup point' : 'Where to?'}
        current={searchTarget === 'pickup' ? pickup : destination}
        saved={savedQuery.data ?? []}
        allowCurrentLocation={searchTarget === 'pickup'}
        onSelect={(place) => {
          if (!searchTarget) return;
          ++reverseToken.current[searchTarget];
          if (searchTarget === 'pickup') setPickup(place);
          else setDestination(place);
        }}
        onDropPin={searchTarget ? () => setPinTarget(searchTarget) : undefined}
      />

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm your bike"
        description="Cash payment after the ride. Nearby riders will see this request immediately."
        footer={
          <Button
            size="lg"
            block
            loading={booking}
            disabled={!estimate || estimateQuery.loading || Boolean(estimateError)}
            onClick={() => void confirmBooking()}
            icon={<ArrowRight size={18} />}
          >
            Send request · {estimate ? money(estimate.fare.estimated) : ''}
          </Button>
        }
      >
        <div className="space-y-3">
          {pickup && destination ? (
            <div className="rounded-2xl bg-white p-3.5 text-[12.5px]">
              <div className="flex gap-3">
                <div className="flex w-3 flex-col items-center pt-1">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-cream" />
                  <span className="my-1 w-px flex-1 border-l border-dashed border-ink/25" />
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-mango" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Pickup</p>
                    <p className="truncate font-semibold text-ink">{pickup.label}</p>
                  </div>
                  <div>
                    <p className="text-[9.5px] uppercase tracking-[0.13em] text-muted">Drop</p>
                    <p className="truncate font-semibold text-ink">{destination.label}</p>
                  </div>
                </div>
              </div>
              {estimate ? (
                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <CalendarClock size={13} /> {km(estimate.route.distanceMeters)} ·{' '}
                    {minutes(estimate.route.durationSeconds)}
                  </span>
                  <span className="font-display text-[15px] font-semibold text-ink">
                    {money(estimate.fare.estimated, estimate.currency)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <Field label="Note for the rider" hint="Optional · landmark, gate, or luggage">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 300))}
              placeholder="For example: near the ferry ghat, blue gate"
              maxLength={300}
            />
          </Field>

          <p className="rounded-2xl bg-cream-200/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            Fares are calculated on the server. If no rider accepts within the search window, the
            request expires and you are not charged.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
