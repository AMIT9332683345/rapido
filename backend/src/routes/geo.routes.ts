import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { geoLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { isValidLatLng } from '../utils/geo.js';
import { findNearbyRiders, reverseGeocode, searchPlaces } from '../services/geoService.js';
import { assertBookablePoint, assertRouteInServiceArea, getActiveServiceArea } from '../services/settingsService.js';
import { getRoadRoute } from '../services/routingService.js';
import { calculateFare, getFareConfig } from '../services/fareService.js';
import { env } from '../config/env.js';

const router = Router();

router.get(
  '/service-area',
  asyncHandler(async (_req, res) => {
    const area = await getActiveServiceArea();
    res.json({
      name: area.name,
      description: area.description ?? null,
      boundary: area.boundary,
      center: {
        lat: area.center!.coordinates[1],
        lng: area.center!.coordinates[0],
      },
      isAvailable: area.isAvailable,
      unavailableMessage: area.unavailableMessage ?? null,
      source: area.source,
      sourceUrl: area.sourceUrl ?? null,
    });
  }),
);

router.use(geoLimiter);

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) throw HttpError.badRequest('Type at least 2 characters to search');
    const results = await searchPlaces(q);
    res.json({ results });
  }),
);

router.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!isValidLatLng(lat, lng)) throw HttpError.badRequest('Invalid coordinates');
    const place = await reverseGeocode(lat, lng);
    res.json({ place });
  }),
);

router.post(
  '/estimate',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        pickup: z.object({
          label: z.string().trim().max(140).optional(),
          address: z.string().trim().max(240).optional().nullable(),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
        destination: z.object({
          label: z.string().trim().max(140).optional(),
          address: z.string().trim().max(240).optional().nullable(),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
      })
      .parse(req.body);

    const [area] = await Promise.all([
      assertBookablePoint(body.pickup.lat, body.pickup.lng),
      assertBookablePoint(body.destination.lat, body.destination.lng),
    ]);

    const route = await getRoadRoute(
      { lat: body.pickup.lat, lng: body.pickup.lng },
      { lat: body.destination.lat, lng: body.destination.lng },
    );
    assertRouteInServiceArea(area, route);
    const config = await getFareConfig();
    const fare = calculateFare(config, route.distanceMeters, route.durationSeconds);

    res.json({
      route,
      fare,
      currency: fare.currency,
      paymentMethod: 'cash',
    });
  }),
);

router.use(authenticate);

router.get(
  '/nearby-riders',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!isValidLatLng(lat, lng)) throw HttpError.badRequest('Invalid coordinates');
    const riders = await findNearbyRiders(
      { lat, lng },
      Math.min(env.RIDE_REQUEST_RADIUS_KM, 10) * 1000,
    );
    res.json({ riders });
  }),
);

export default router;
