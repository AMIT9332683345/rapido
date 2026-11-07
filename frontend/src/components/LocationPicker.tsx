import { useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import MapView from './MapView';
import { Button, Sheet } from './ui';
import type { GeoBoundary, LatLng } from '../types';

export default function LocationPicker({
  open, initial, target, boundary, onClose, onConfirm,
}: {
  open: boolean;
  initial: LatLng;
  target: 'pickup' | 'destination';
  boundary?: GeoBoundary | null;
  onClose: () => void;
  onConfirm: (point: LatLng) => void;
}) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={target === 'pickup' ? 'Choose pickup on map' : 'Choose destination on map'}
      description="Move the map under the pin, then confirm."
      footer={
        <Button block size="lg" disabled={!ready} onClick={() => {
          const center = mapRef.current?.getCenter();
          if (center) onConfirm({ lat: center.lat, lng: center.lng });
        }}>
          {target === 'pickup' ? 'Confirm pickup' : 'Confirm destination'}
        </Button>
      }
    >
      <div className="relative h-[55dvh] min-h-[280px] overflow-hidden rounded-2xl">
        <MapView center={initial} zoom={16} fit="none" boundary={boundary} onReady={(map) => {
          mapRef.current = map;
          setReady(true);
        }} />
        <div className="map-selection-pin" aria-label={target === 'pickup' ? 'Fixed pickup pin' : 'Fixed destination pin'}>
          <svg width="38" height="52" viewBox="0 0 38 52" fill={target === 'pickup' ? '#f7f3e8' : '#ffb020'} stroke="#08211f" strokeWidth="2.5">
            <path d="M19 50S2 30 2 19a17 17 0 1 1 34 0c0 11-17 31-17 31Z" />
            <circle cx="19" cy="18" r="6" fill="#08211f" />
          </svg>
        </div>
      </div>
    </Sheet>
  );
}
