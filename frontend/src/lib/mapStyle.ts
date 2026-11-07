import type { StyleSpecification } from 'maplibre-gl';
import { APP_NAME, MAP_GLYPHS_URL, MAP_PMTILES_URL, MAP_STYLE_URL } from '../config';

const attribution =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/**
 * A compact OpenMapTiles-compatible style for a self-hosted PMTiles archive.
 * Generate the archive with the OpenMapTiles profile (see map-data/README.md).
 */
export function createPmtilesStyle(url: string): StyleSpecification {
  const layers: any[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f5f0e4' },
    },
    {
      id: 'landcover',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      paint: { 'fill-color': '#e6eedb', 'fill-opacity': 0.65 },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'omt',
      'source-layer': 'park',
      paint: { 'fill-color': '#d8e8cc', 'fill-opacity': 0.65 },
    },
    {
      id: 'landuse',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      paint: { 'fill-color': '#ece6d6', 'fill-opacity': 0.7 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      paint: { 'fill-color': '#a7d3ce' },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      paint: { 'line-color': '#8fc4be', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 3] },
    },
    {
      id: 'boundary',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      paint: {
        'line-color': '#9aa89f',
        'line-width': 1,
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'road-casing',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      paint: {
        'line-color': '#d9cfba',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 16, 9, 19, 18],
      },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary'],
          '#f6c980',
          ['secondary', 'tertiary'],
          '#fbe3b8',
          '#ffffff',
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 14, 2.2, 18, 8],
      },
    },
    {
      id: 'buildings',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': '#e2d8c6', 'fill-opacity': 0.8 },
    },
    {
      id: 'road-labels',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 14,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-size': 11,
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'text-color': '#5b6158',
        'text-halo-color': '#f6f2e6',
        'text-halo-width': 1.4,
      },
    },
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['match', ['get', 'class'], ['village', 'hamlet'], 11, 13],
          16,
          ['match', ['get', 'class'], ['village', 'hamlet'], 14, 18],
        ],
        'text-font': ['Noto Sans Regular'],
        'text-max-width': 7,
      },
      paint: {
        'text-color': '#31423d',
        'text-halo-color': '#f6f2e6',
        'text-halo-width': 1.6,
      },
    },
    {
      id: 'poi-dots',
      type: 'circle',
      source: 'omt',
      'source-layer': 'poi',
      minzoom: 15,
      paint: {
        'circle-radius': 2.6,
        'circle-color': '#1f7f71',
        'circle-opacity': 0.75,
      },
    },
  ];

  return {
    version: 8,
    name: `${APP_NAME} Gosaba`,
    glyphs: MAP_GLYPHS_URL,
    sources: {
      omt: {
        type: 'vector',
        url: `pmtiles://${url}`,
        attribution,
      },
    },
    layers,
  };
}

export function mapStyle(): string | StyleSpecification {
  if (MAP_PMTILES_URL) return createPmtilesStyle(MAP_PMTILES_URL);
  return MAP_STYLE_URL;
}

export function usesPmtiles(): boolean {
  return Boolean(MAP_PMTILES_URL);
}
