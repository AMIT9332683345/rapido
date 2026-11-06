import { Router } from 'express';
import { env } from '../config/env.js';
import { getFareConfig } from '../services/fareService.js';
import { getActiveServiceArea } from '../services/settingsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [config, area] = await Promise.all([getFareConfig(), getActiveServiceArea()]);
    res.json({
      app: {
        name: env.APP_NAME,
        currency: 'INR',
        supportPhone: env.SUPPORT_PHONE ?? null,
        supportEmail: env.SUPPORT_EMAIL,
      },
      fare: {
        baseFare: config.baseFare,
        perKm: config.perKm,
        perMinute: config.perMinute,
        minimumFare: config.minimumFare,
        waitingFreeMinutes: config.waitingFreeMinutes,
        waitingPerMinute: config.waitingPerMinute,
        cancellationFee: config.cancellationFee,
        platformFee: config.platformFee,
        currency: config.currency,
      },
      serviceArea: {
        name: area.name,
        center: { lat: area.center!.coordinates[1], lng: area.center!.coordinates[0] },
        isAvailable: area.isAvailable,
        unavailableMessage: area.unavailableMessage ?? null,
      },
      map: {
        styleUrl: env.MAP_STYLE_URL ?? null,
        pmtilesUrl: env.MAP_PMTILES_URL ?? null,
      },
      routing: {
        selfHosted: !env.OSRM_BASE_URL.includes('router.project-osrm.org'),
      },
    });
  }),
);

export default router;
