import { useEffect, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapMouseEvent,
  type Marker,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import type { GeoBoundary, LatLng, LineString } from '../types';
import { APP_NAME, DEFAULT_CENTER } from '../config';
import { mapStyle, usesPmtiles } from '../lib/mapStyle';
import { cn } from './ui';

let pmtilesRegistered = false;
function ensurePmtiles() {
  if (pmtilesRegistered || !usesPmtiles()) return;
  try {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile as never);
    pmtilesRegistered = true;
  } catch {
    // If the protocol is already registered, keep the map usable.
  }
}

export type MarkerKind = 'pickup' | 'destination' | 'rider' | 'nearby' | 'customer' | 'note';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  label?: string;
  draggable?: boolean;
  onClick?: () => void;
}

const PIN_SVG: Record<MarkerKind, string> = {
  pickup: '',
  destination:
    '<svg width="38" height="52" viewBox="0 0 38 52" fill="#ffb020" stroke="#08211f" stroke-width="2.5"><path d="M19 50S2 30 2 19a17 17 0 1 1 34 0c0 11-17 31-17 31Z"/><circle cx="19" cy="18" r="6" fill="#f7f3e8"/></svg>',
  rider:
    '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M5.5 17.5 9 10h6l3.5 7.5"/><path d="M9 10 7 17.5"/><path d="M15 10l1-3.5"/><path d="M13.5 6.5H18"/></svg>',
  nearby:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M5.5 17.5 9 10h6l3.5 7.5"/><path d="M9 10 7 17.5"/><path d="M15 10l1-3.5"/></svg>',
  customer:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/></svg>',
  note: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>',
};

function markerElement(kind: MarkerKind): HTMLElement {
  const el = document.createElement('div');
  el.className = `flash-pin flash-pin--${kind}`;
  el.setAttribute('role', 'img');
  if (PIN_SVG[kind]) el.innerHTML = PIN_SVG[kind];
  return el;
}

export interface MapViewProps {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  route?: LineString | null;
  routeIsEstimate?: boolean;
  boundary?: GeoBoundary | null;
  showBoundary?: boolean;
  self?: LatLng | null;
  className?: string;
  fit?: 'auto' | 'route' | 'markers' | 'none';
  fitKey?: string;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  onClick?: (point: LatLng) => void;
  onMarkerDragEnd?: (id: string, point: LatLng) => void;
  showControls?: boolean;
  interactive?: boolean;
  onReady?: (map: MapLibreMap) => void;
}

export default function MapView({
  center = DEFAULT_CENTER,
  zoom = 13,
  markers = [],
  route = null,
  routeIsEstimate = false,
  boundary = null,
  showBoundary = true,
  self = null,
  className,
  fit = 'auto',
  fitKey,
  padding,
  onClick,
  onMarkerDragEnd,
  showControls = true,
  interactive = true,
  onReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, { marker: Marker; el: HTMLElement; kind: MarkerKind }>>(
    new Map(),
  );
  const selfMarkerRef = useRef<Marker | null>(null);
  const centerRef = useRef(center);
  const clickRef = useRef(onClick);
  const dragRef = useRef(onMarkerDragEnd);
  const markerClickRef = useRef(new Map<string, (() => void) | undefined>());
  const didInitialFit = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  centerRef.current = center;
  clickRef.current = onClick;
  dragRef.current = onMarkerDragEnd;

  /* Create the map once. */
  useEffect(() => {
    if (!containerRef.current) return;
    ensurePmtiles();

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: mapStyle(),
        center: [centerRef.current.lng, centerRef.current.lat],
        zoom,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        interactive,
      });
    } catch {
      setFailed(true);
      return;
    }

    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: `${APP_NAME} · OSM` }),
      'bottom-right',
    );
    mapRef.current = map;

    const onLoad = () => {
      setReady(true);
      map.resize();
      onReady?.(map);
    };
    map.on('load', onLoad);

    const onMapClick = (event: MapMouseEvent) => {
      clickRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };
    map.on('click', onMapClick);

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      selfMarkerRef.current?.remove();
      selfMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
      didInitialFit.current = false;
    };
    // The map is intentionally created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Keep clickability in sync without recreating the map. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactive) {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      map.keyboard.enable();
      map.boxZoom.enable();
    } else {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      map.keyboard.disable();
      map.boxZoom.disable();
    }
  }, [interactive]);

  /* Service area boundary. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data = boundary
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: boundary,
        }
      : null;

    const existing = map.getSource('service-area') as GeoJSONSource | undefined;
    if (!data) {
      if (existing) existing.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    if (existing) {
      existing.setData(data as never);
      return;
    }
    map.addSource('service-area', { type: 'geojson', data: data as never });
    map.addLayer({
      id: 'service-area-fill',
      type: 'fill',
      source: 'service-area',
      paint: { 'fill-color': '#1f7f71', 'fill-opacity': 0.055 },
    });
    map.addLayer({
      id: 'service-area-line',
      type: 'line',
      source: 'service-area',
      paint: {
        'line-color': '#1f7f71',
        'line-width': 1.6,
        'line-opacity': 0.65,
        'line-dasharray': [2, 2],
      },
    });
  }, [boundary, ready]);

  /* Visibility of the boundary without removing the layer. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ['service-area-fill', 'service-area-line'].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', showBoundary ? 'visible' : 'none');
      }
    });
  }, [showBoundary, ready]);

  /* Route line. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data = route
      ? { type: 'Feature' as const, properties: {}, geometry: route }
      : null;

    const source = map.getSource('ride-route') as GeoJSONSource | undefined;
    if (source) {
      source.setData(
        data ?? ({ type: 'FeatureCollection', features: [] } as never),
      );
      if (map.getLayer('ride-route-line')) {
        map.setPaintProperty('ride-route-line', 'line-dasharray', routeIsEstimate ? [1.5, 1.8] : [1, 0]);
      }
      return;
    }

    map.addSource('ride-route', {
      type: 'geojson',
      data: (data ?? { type: 'FeatureCollection', features: [] }) as never,
    });
    map.addLayer({
      id: 'ride-route-casing',
      type: 'line',
      source: 'ride-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f7f3e8',
        'line-width': 9,
        'line-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'ride-route-line',
      type: 'line',
      source: 'ride-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#1f7f71',
        'line-width': 4.5,
        'line-dasharray': routeIsEstimate ? [1.5, 1.8] : [1, 0],
      },
    });
  }, [route, routeIsEstimate, ready]);

  /* Pins, diffed so live GPS updates do not flicker. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();

    for (const item of markers) {
      seen.add(item.id);
      markerClickRef.current.set(item.id, item.onClick);
      const current = markersRef.current.get(item.id);
      if (current && current.kind === item.kind) {
        current.marker.setLngLat([item.lng, item.lat]);
        if (item.draggable !== undefined) current.marker.setDraggable(item.draggable);
        current.el.title = item.label ?? '';
        current.el.setAttribute('aria-label', item.label ?? item.kind);
      } else {
        if (current) {
          current.marker.remove();
          markersRef.current.delete(item.id);
        }
        const el = markerElement(item.kind);
        el.title = item.label ?? '';
        el.setAttribute('aria-label', item.label ?? item.kind);
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          markerClickRef.current.get(item.id)?.();
        });

        const marker = new maplibregl.Marker({
          element: el,
          draggable: Boolean(item.draggable),
          anchor: item.kind === 'destination' ? 'bottom' : 'center',
        })
          .setLngLat([item.lng, item.lat])
          .addTo(map);

        marker.on('dragend', () => {
          const point = marker.getLngLat();
          dragRef.current?.(item.id, { lat: point.lat, lng: point.lng });
        });

        markersRef.current.set(item.id, { marker, el, kind: item.kind });
      }
    }

    for (const [id, value] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        value.marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [markers, ready]);

  /* The device's own position (pulsing dot). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!self) {
      selfMarkerRef.current?.remove();
      selfMarkerRef.current = null;
      return;
    }
    if (!selfMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'flash-dot';
      selfMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([self.lng, self.lat])
        .addTo(map);
    } else {
      selfMarkerRef.current.setLngLat([self.lng, self.lat]);
    }
  }, [self, ready]);

  /* Fit to route/markers only when the page asks for it. */
  const signature = fitKey
    ? `${fitKey}:${route?.coordinates.length ?? 0}`
    : `${fit}:${markers.map((m) => `${m.id}:${m.kind}`).join('|')}`;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fit === 'none') return;
    if (didInitialFit.current && fitKey === undefined) return;

    const coords: [number, number][] = [];
    if (fit === 'route' || fit === 'auto') {
      if (route?.coordinates?.length) coords.push(...route.coordinates);
    }
    if (fit !== 'route') {
      markers.forEach((m) => coords.push([m.lng, m.lat]));
      if (self) coords.push([self.lng, self.lat]);
    }
    if (!coords.length) {
      didInitialFit.current = true;
      return;
    }

    const bounds = coords.reduce(
      (acc, coord) => acc.extend(coord),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    const extra = padding ?? { top: 90, bottom: 240, left: 48, right: 48 };
    map.fitBounds(bounds as LngLatBoundsLike, {
      padding: {
        top: extra.top ?? 60,
        bottom: extra.bottom ?? 60,
        left: extra.left ?? 40,
        right: extra.right ?? 40,
      },
      maxZoom: 16,
      duration: didInitialFit.current ? 650 : 0,
    });
    didInitialFit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready]);

  useEffect(() => {
    if (!ready || fit !== 'none') return;
    mapRef.current?.easeTo({ center: [center.lng, center.lat], duration: 450 });
  }, [center.lat, center.lng, ready, fit]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const target = self ?? centerRef.current;
    map.flyTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
  };

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-[#ece6d6]', className)}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ position: 'absolute', inset: 0 }}
      />

      {!ready && !failed ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-cream">
          <div className="flex flex-col items-center gap-2 text-muted">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-teal" />
            <span className="text-[12px] font-medium">Loading map…</span>
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-cream px-8 text-center">
          <div>
            <p className="font-display text-[16px] font-semibold">The map could not start</p>
            <p className="mt-1 text-[13px] text-muted">
              Check your connection and refresh. Booking still works with saved places.
            </p>
          </div>
        </div>
      ) : null}

      {showControls ? (
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white/95 text-ink shadow-lift backdrop-blur transition hover:bg-white"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white/95 text-ink shadow-lift backdrop-blur transition hover:bg-white"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            aria-label="Go to my location"
            onClick={recenter}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white/95 text-teal shadow-lift backdrop-blur transition hover:bg-white"
          >
            <LocateFixed size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
