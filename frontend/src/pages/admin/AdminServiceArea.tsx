import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Info,
  MapPin,
  Move,
  Save,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DetailRow,
  Field,
  FullPageLoader,
  Input,
  SectionTitle,
  Switch,
  Textarea,
} from '../../components/ui';
import MapView, { type MapMarker } from '../../components/MapView';
import { api, errorMessage } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useToast } from '../../context/ToastContext';
import type { GeoBoundary, LatLng } from '../../types';

interface AdminServiceAreaDoc {
  _id: string;
  name: string;
  description: string | null;
  boundary: GeoBoundary;
  center: { type: 'Point'; coordinates: [number, number] };
  isAvailable: boolean;
  unavailableMessage: string | null;
  source: string;
  sourceUrl: string | null;
  updatedAt: string;
}

function boundaryStats(boundary: GeoBoundary) {
  const rings: number[][][] =
    boundary.type === 'Polygon'
      ? (boundary.coordinates as number[][][])
      : (boundary.coordinates as number[][][][]).flat();
  let vertices = 0;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  rings.forEach((ring) => {
    vertices += ring.length;
    ring.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  });
  return {
    rings: rings.length,
    vertices,
    bbox:
      Number.isFinite(minLng) && Number.isFinite(minLat)
        ? { minLng, maxLng, minLat, maxLat }
        : null,
  };
}

function parseBoundary(text: string): GeoBoundary | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || (parsed.type !== 'Polygon' && parsed.type !== 'MultiPolygon')) return null;
    const rings: unknown =
      parsed.type === 'Polygon' ? parsed.coordinates : (parsed.coordinates as unknown[])?.flat();
    if (!Array.isArray(rings) || rings.length === 0) return null;
    const isRing = (ring: unknown): boolean =>
      Array.isArray(ring) &&
      ring.length >= 4 &&
      ring.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          typeof pair[0] === 'number' &&
          typeof pair[1] === 'number' &&
          Math.abs(pair[0]) <= 180 &&
          Math.abs(pair[1]) <= 90,
      );
    if (!rings.every(isRing)) return null;
    return { type: parsed.type, coordinates: parsed.coordinates } as GeoBoundary;
  } catch {
    return null;
  }
}

export default function AdminServiceArea() {
  const toast = useToast();
  const query = useQuery<AdminServiceAreaDoc>(
    (signal) => api.get<AdminServiceAreaDoc>('/admin/service-area', { signal }),
    [],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [available, setAvailable] = useState(true);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [boundaryText, setBoundaryText] = useState('');
  const [draftBoundary, setDraftBoundary] = useState<GeoBoundary | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setName(query.data.name);
    setDescription(query.data.description ?? '');
    setMessage(query.data.unavailableMessage ?? '');
    setAvailable(query.data.isAvailable);
    setCenter({
      lat: query.data.center.coordinates[1],
      lng: query.data.center.coordinates[0],
    });
    setBoundaryText(JSON.stringify(query.data.boundary, null, 2));
    setDraftBoundary(query.data.boundary);
    setBoundaryError(null);
  }, [query.data]);

  const stats = useMemo(
    () => (draftBoundary ? boundaryStats(draftBoundary) : null),
    [draftBoundary],
  );

  if (query.loading && !query.data) return <FullPageLoader label="Loading service area" />;

  if (query.error || !query.data || !center) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <SectionTitle title="Service area" />
          <p className="mt-2 text-[13px] text-muted">
            {query.error ?? 'The service area is not configured yet.'}
          </p>
          <Button className="mt-3" variant="outline" onClick={query.reload}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const applyBoundary = () => {
    const parsed = parseBoundary(boundaryText);
    if (!parsed) {
      setBoundaryError(
        'Paste a valid GeoJSON Polygon or MultiPolygon. Rings need at least 4 [longitude, latitude] pairs.',
      );
      return;
    }
    setBoundaryError(null);
    setDraftBoundary(parsed);
    toast.success('Boundary preview updated on the map. Save to publish it.');
  };

  const reset = () => {
    if (!query.data) return;
    setName(query.data.name);
    setDescription(query.data.description ?? '');
    setMessage(query.data.unavailableMessage ?? '');
    setAvailable(query.data.isAvailable);
    setCenter({
      lat: query.data.center.coordinates[1],
      lng: query.data.center.coordinates[0],
    });
    setBoundaryText(JSON.stringify(query.data.boundary, null, 2));
    setDraftBoundary(query.data.boundary);
    setBoundaryError(null);
    setPickMode(false);
    toast.info('Reverted unsaved changes.');
  };

  const save = async () => {
    const parsedBoundary = parseBoundary(boundaryText);
    if (!parsedBoundary) {
      setBoundaryError('Fix the boundary GeoJSON before saving.');
      return;
    }
    if (name.trim().length < 3) {
      toast.error('The area name needs at least 3 characters.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/service-area', {
        name: name.trim(),
        description: description.trim() || null,
        boundary: parsedBoundary,
        center,
        isAvailable: available,
        unavailableMessage: message.trim(),
      });
      toast.success('Service area saved. New bookings use this boundary immediately.');
      setPickMode(false);
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const markers: MapMarker[] = [
    {
      id: 'area-centre',
      kind: 'pickup',
      lat: center.lat,
      lng: center.lng,
      label: 'Service area centre',
      draggable: false,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Coverage
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Service area
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Bookings are accepted only when pickup and destination fall inside this polygon.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={available ? 'success' : 'danger'}>
            {available ? 'Accepting rides' : 'Rides paused'}
          </Badge>
          <Badge tone="muted">{stats?.rings ?? 0} ring(s)</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <div className="relative h-[360px] overflow-hidden rounded-3xl border border-line/80 lg:h-[460px]">
            <MapView
              center={center}
              zoom={12}
              markers={markers}
              boundary={draftBoundary}
              fit="none"
              onClick={
                pickMode
                  ? (point) => {
                      setCenter(point);
                      setPickMode(false);
                      toast.success('Centre point moved. Save to apply.');
                    }
                  : undefined
              }
              padding={{ top: 40, bottom: 40, left: 40, right: 40 }}
            />
            {pickMode ? (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-2xl bg-ink/85 px-3 py-2 text-center text-[11.5px] font-semibold text-cream backdrop-blur">
                Tap the map to move the centre point
              </div>
            ) : null}
            <div className="absolute bottom-3 left-3 flex gap-2">
              <Button
                size="sm"
                variant={pickMode ? 'ink' : 'outline'}
                icon={<Move size={14} />}
                onClick={() => setPickMode((value) => !value)}
              >
                {pickMode ? 'Cancel picking' : 'Pick centre'}
              </Button>
            </div>
          </div>

          <Card>
            <SectionTitle
              title="Availability"
              action={
                <Switch
                  checked={available}
                  onChange={setAvailable}
                  label="Accept new bookings"
                />
              }
            />
            <p className="mt-1 text-[11.5px] leading-snug text-muted">
              {available
                ? 'Customers can request rides anywhere inside the boundary.'
                : 'The customer app shows a pause banner and blocks new bookings. Active rides continue.'}
            </p>
            <div className="mt-3">
              <Field
                label="Pause message"
                hint="Shown to customers when bookings are paused."
              >
                <Input
                  value={message}
                  maxLength={300}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Rides are paused right now. Please try again later."
                />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Area details" />
            <div className="mt-3 space-y-3">
              <Field label="Name" required hint="Used in customer messages and fare checks.">
                <Input
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Description" hint="Optional internal note shown on this page only.">
                <Textarea
                  value={description}
                  maxLength={300}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Coverage notes, landmarks or local context"
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <SectionTitle
              title="Boundary GeoJSON"
              action={
                draftBoundary !== query.data.boundary ? (
                  <Badge tone="mango">Previewing</Badge>
                ) : (
                  <Badge tone="muted">Saved</Badge>
                )
              }
            />
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Longitude first, as required by GeoJSON. Edit only with survey data — never invent
              roads or river crossings.
            </p>
            <textarea
              value={boundaryText}
              onChange={(event) => setBoundaryText(event.target.value)}
              spellCheck={false}
              className="mt-2.5 h-[220px] w-full resize-y rounded-2xl border border-line bg-white p-3 font-mono text-[10.5px] leading-relaxed text-ink focus:border-teal focus:ring-4 focus:ring-teal/10"
            />
            {boundaryError ? (
              <p className="mt-2 rounded-xl bg-danger-100 px-3 py-2 text-[11.5px] font-medium text-danger">
                {boundaryError}
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" icon={<Check size={14} />} onClick={applyBoundary}>
                Preview on map
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Undo2 size={14} />}
                onClick={reset}
                disabled={saving}
              >
                Reset
              </Button>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Centre point" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Latitude">
                <Input
                  type="number"
                  step="0.000001"
                  value={center.lat}
                  onChange={(event) =>
                    setCenter({ ...center, lat: Number(event.target.value) })
                  }
                  icon={<MapPin size={14} />}
                  className="text-[12.5px]"
                />
              </Field>
              <Field label="Longitude">
                <Input
                  type="number"
                  step="0.000001"
                  value={center.lng}
                  onChange={(event) =>
                    setCenter({ ...center, lng: Number(event.target.value) })
                  }
                  className="text-[12.5px]"
                />
              </Field>
            </div>
            {stats?.bbox ? (
              <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
                <DetailRow label="Vertices" value={stats.vertices} />
                <DetailRow
                  label="Longitude span"
                  value={`${stats.bbox.minLng.toFixed(4)} → ${stats.bbox.maxLng.toFixed(4)}`}
                />
                <DetailRow
                  label="Latitude span"
                  value={`${stats.bbox.minLat.toFixed(4)} → ${stats.bbox.maxLat.toFixed(4)}`}
                />
              </div>
            ) : null}
          </Card>

          <Card className="bg-cream/60">
            <div className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal" />
              <div>
                <p className="text-[12px] font-semibold text-ink">Data provenance</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Source: {query.data.source}
                  {query.data.sourceUrl ? (
                    <>
                      {' · '}
                      <a
                        href={query.data.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-teal"
                      >
                        reference
                      </a>
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-[10px] text-muted">
                  Last saved {dateTime(query.data.updatedAt)}
                </p>
              </div>
            </div>
          </Card>

          <div className="rounded-2xl bg-mango-100/70 p-3 text-[11px] leading-relaxed text-[#8a5c00]">
            <div className="flex gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>
                The server validates that the centre lies inside the polygon. Changes publish
                immediately; rides already in progress keep their route.
              </p>
            </div>
          </div>

          <Button
            block
            icon={<Save size={16} />}
            loading={saving}
            disabled={!draftBoundary || saving}
            onClick={save}
          >
            Save service area
          </Button>
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted">
            <Info size={12} className="mt-0.5 shrink-0" />
            Map data © OpenStreetMap contributors. Boundary checks are performed on the server for
            every booking.
          </p>
        </div>
      </div>
    </div>
  );
}
