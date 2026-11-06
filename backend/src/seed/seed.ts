import bcrypt from 'bcryptjs';
import { env, isProd } from '../config/env.js';
import { AdminModel } from '../models/Admin.js';
import { FareConfigurationModel } from '../models/FareConfiguration.js';
import { ServiceAreaModel } from '../models/ServiceArea.js';
import { maskMobile } from '../utils/phone.js';
import { pointInGeoJson } from '../utils/geo.js';
import boundaryGeoJson from './gosaba-boundary.json' with { type: 'json' };

const SERVICE_CENTER = { lat: 22.2167, lng: 88.9 };

export async function ensureSeedData(): Promise<void> {
  const fare = await FareConfigurationModel.findOne({ isActive: true });
  if (!fare) {
    await FareConfigurationModel.create({
      name: 'Default bike fare',
      currency: 'INR',
      baseFare: 25,
      perKm: 8,
      perMinute: 0,
      minimumFare: 30,
      waitingFreeMinutes: 3,
      waitingPerMinute: 1,
      cancellationFee: 20,
      platformFee: 0,
      isActive: true,
    });
    console.log('[seed] default fare configuration created');
  }

  let area = await ServiceAreaModel.findOne({ isActive: true });
  if (!area) {
    const boundary = boundaryGeoJson as {
      type: 'MultiPolygon';
      coordinates: number[][][][];
    };
    const inside = pointInGeoJson([SERVICE_CENTER.lng, SERVICE_CENTER.lat], boundary);
    if (!inside) {
      console.warn(
        '[seed] configured map centre falls outside the OSM boundary; adjust the centre in admin settings.',
      );
    }
    area = await ServiceAreaModel.create({
      name: 'Gosaba service area',
      description:
        'Gosaba CD block, South 24 Parganas, West Bengal. Includes Chhoto Mollakhali and the surrounding islands.',
      boundary,
      center: {
        type: 'Point',
        coordinates: [SERVICE_CENTER.lng, SERVICE_CENTER.lat],
      },
      isActive: true,
      isAvailable: true,
      unavailableMessage:
        'Rides across Gosaba are paused right now. Please try again shortly.',
      source: 'OpenStreetMap',
      sourceUrl: 'https://www.openstreetmap.org/relation/10372784',
    });
    console.log(`[seed] service area "${area.name}" created from OSM relation 10372784`);
  }

  if (env.ADMIN_MOBILE && env.ADMIN_PASSWORD) {
    const existing = await AdminModel.findOne({ mobile: env.ADMIN_MOBILE });
    if (!existing) {
      const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
      await AdminModel.create({
        name: env.ADMIN_NAME,
        mobile: env.ADMIN_MOBILE,
        passwordHash,
      });
      console.log(`[seed] admin created for ${maskMobile(env.ADMIN_MOBILE)}`);
    } else {
      console.log(`[seed] admin ${maskMobile(env.ADMIN_MOBILE)} already exists`);
    }
  } else {
    console.warn(
      '[seed] ADMIN_MOBILE and ADMIN_PASSWORD are not both set; no admin account was bootstrapped.',
    );
  }

  if (isProd && env.OSRM_BASE_URL.includes('router.project-osrm.org')) {
    console.warn('[seed] OSRM_BASE_URL must point to your self-hosted OSRM before production use.');
  }
}
