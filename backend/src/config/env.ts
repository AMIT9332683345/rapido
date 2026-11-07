import 'dotenv/config';
import { z } from 'zod';
import brand from '../../../brand.json';

const boolFromString = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def)
    .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_NAME: z.string().default(brand.name),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  FRONTEND_URL: z.string().default('http://localhost:5173'),
  FRONTEND_URLS: optionalString,
  PUBLIC_BASE_URL: optionalString,

  ADMIN_NAME: z.string().default('Admin'),
  ADMIN_MOBILE: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'ADMIN_MOBILE must be a 10 digit Indian mobile')
    .optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  OSRM_BASE_URL: z.string().default('https://router.project-osrm.org'),
  ROUTING_ALLOW_ESTIMATE: boolFromString('false'),

  RIDE_REQUEST_RADIUS_KM: z.coerce.number().positive().default(6),
  BOOKING_OFFER_SECONDS: z.coerce.number().int().positive().default(60),
  BOOKING_SEARCH_MINUTES: z.coerce.number().positive().default(4),
  RIDE_REQUEST_MAX_ROUNDS: z.coerce.number().int().positive().default(6),

  OSM_USER_AGENT: z.string().default('FlashRide/1.0'),

  SUPPORT_PHONE: optionalString,
  SUPPORT_EMAIL: z.string().default(''),

  UPLOAD_DIR: z.string().default('uploads'),
  MAP_PMTILES_URL: optionalString,
  MAP_STYLE_URL: optionalString,

  FCM_PROJECT_ID: optionalString,
  FCM_CLIENT_EMAIL: optionalString,
  FCM_PRIVATE_KEY: optionalString,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Browsers send Origin as scheme://host[:port] with no path or trailing slash.
function toOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

export const allowedOrigins = [
  env.FRONTEND_URL,
  ...(env.FRONTEND_URLS ? env.FRONTEND_URLS.split(',') : []),
  ...(isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']),
]
  .map((v) => v.trim())
  .filter(Boolean)
  .map(toOrigin)
  .filter((v, i, arr) => arr.indexOf(v) === i);

if (isProd && env.OSRM_BASE_URL.includes('router.project-osrm.org')) {
  console.warn(
    '[config] OSRM_BASE_URL points at the public demo server. Configure a self-hosted OSRM instance for production.',
  );
}
