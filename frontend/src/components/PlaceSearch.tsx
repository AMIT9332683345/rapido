import { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Search, Star, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { getPosition } from '../lib/geolocation';
import type { Place, PlaceResult, SavedLocation } from '../types';
import { Badge, Field, Input, Sheet, Spinner } from './ui';

export default function PlaceSearch({
  open,
  onClose,
  title,
  current,
  saved = [],
  allowCurrentLocation = true,
  onSelect,
  onDropPin,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  current?: Place | null;
  saved?: SavedLocation[];
  allowCurrentLocation?: boolean;
  onSelect: (place: Place) => void;
  onDropPin?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 250);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      api
        .get<{ results: PlaceResult[] }>(`/geo/search?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        })
        .then((data) => {
          setResults(data.results ?? []);
          setLoading(false);
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return;
          setError(errorMessage(err));
          setLoading(false);
        });
    }, 420);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const pick = (place: Place) => {
    onSelect(place);
    onClose();
  };

  const useCurrent = async () => {
    setLocating(true);
    setError(null);
    try {
      const coords = await getPosition();
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
        // Reverse geocoding is optional; coordinates are still valid.
      }
      pick(place);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLocating(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} description="Search the area or pick a pin on the map.">
      <div className="space-y-3">
        <Field>
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search village, road, market…"
            icon={<Search size={18} />}
            trailing={
              query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-cream"
                >
                  <X size={16} />
                </button>
              ) : null
            }
            autoComplete="off"
          />
        </Field>

        {current ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-[12.5px] text-muted">
            <MapPin size={15} className="text-teal" />
            <span className="truncate">Current: {current.label}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {allowCurrentLocation ? (
            <button
              type="button"
              onClick={() => void useCurrent()}
              disabled={locating}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[12.5px] font-semibold text-ink transition hover:border-teal/40 disabled:opacity-50"
            >
              {locating ? <Spinner size={16} /> : <Crosshair size={16} className="text-teal" />}
              Use my location
            </button>
          ) : null}
          {onDropPin ? (
            <button
              type="button"
              onClick={() => {
                onDropPin();
                onClose();
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[12.5px] font-semibold text-ink transition hover:border-teal/40"
            >
              <MapPin size={16} className="text-mango-600" />
              Drop a pin
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-2xl bg-danger-100 px-3 py-2 text-[12.5px] text-danger">{error}</p>
        ) : null}

        {query.trim().length >= 2 ? (
          <div className="space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted">
                <Spinner size={16} /> Searching OpenStreetMap…
              </div>
            ) : results.length ? (
              results.map((result, index) => (
                <button
                  key={`${result.lat}-${result.lng}-${index}`}
                  type="button"
                  onClick={() => pick(result)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-transparent bg-white p-3 text-left transition hover:border-line"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream text-teal">
                    <MapPin size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{result.label}</span>
                      {result.insideServiceArea ? (
                        <Badge tone="success">In service area</Badge>
                      ) : (
                        <Badge tone="danger">Outside area</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted">
                      {result.address || result.type}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="py-8 text-center text-[12.5px] text-muted">
                No places matched. Try a shorter name, or drop a pin on the map.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            {saved.length ? (
              <div>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Saved places
                </p>
                <div className="overflow-hidden rounded-2xl bg-white">
                  {saved.map((place, index) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => pick(place)}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left ${
                        index ? 'border-t border-line/60' : ''
                      }`}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-mango-100 text-[#8a5c00]">
                        <Star size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {place.label}
                        </span>
                        {place.address ? (
                          <span className="block truncate text-[11.5px] text-muted">{place.address}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="rounded-2xl bg-cream-200/70 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
              Search uses OpenStreetMap data. Some lanes in Gosaba are mapped lightly — if a place is
              missing, drop a pin and tell support.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
