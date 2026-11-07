import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRouteInServiceArea } from '../src/services/settingsService.js';

const island = {
  type: 'Polygon',
  coordinates: [[[88.0, 22.0], [88.2, 22.0], [88.2, 22.2], [88.0, 22.2], [88.0, 22.0]]],
};

const twoIslands = {
  type: 'MultiPolygon',
  coordinates: [
    [island.coordinates[0]],
    [[[88.6, 22.0], [88.8, 22.0], [88.8, 22.2], [88.6, 22.2], [88.6, 22.0]]],
  ],
};

test('accepts a road route that stays inside the boundary', () => {
  assertRouteInServiceArea({ boundary: island }, {
    geometry: { coordinates: [[88.05, 22.05], [88.12, 22.15], [88.19, 22.18]] },
  });
});

test('rejects a route that crosses outside the boundary', () => {
  assert.throws(
    () => assertRouteInServiceArea({ boundary: island }, {
      geometry: { coordinates: [[88.05, 22.05], [89.40, 22.10], [88.19, 22.18]] },
    }),
    (error) => error.code === 'ROUTE_OUTSIDE_SERVICE_AREA' && error.status === 409,
  );
});

test('rejects a ferry-style jump between two islands', () => {
  assert.throws(
    () => assertRouteInServiceArea({ boundary: twoIslands }, {
      geometry: {
        coordinates: [
          [88.05, 22.10], [88.15, 22.10], [88.30, 22.10], [88.45, 22.10],
          [88.55, 22.10], [88.65, 22.10], [88.75, 22.10],
        ],
      },
    }),
    (error) => error.code === 'ROUTE_OUTSIDE_SERVICE_AREA',
  );
});

test('skips straight-line fallback estimates', () => {
  assertRouteInServiceArea({ boundary: island }, {
    isEstimate: true,
    geometry: { coordinates: [[88.05, 22.05], [92.50, 26.00]] },
  });
});

test('checks every coordinate on island-sized routes', () => {
  const coordinates = Array.from({ length: 600 }, (_, index) => [
    88.05 + (index / 600) * 0.14,
    22.05,
  ]);
  coordinates[317] = [88.60, 22.10];
  assert.throws(
    () => assertRouteInServiceArea({ boundary: island }, { geometry: { coordinates } }),
    (error) => error.code === 'ROUTE_OUTSIDE_SERVICE_AREA',
  );
});
