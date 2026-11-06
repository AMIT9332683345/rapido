import { FareConfigurationModel, type FareConfiguration } from '../models/FareConfiguration.js';
import { roundMoney } from '../utils/geo.js';

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  waitingCharges: number;
  platformFee: number;
  subtotal: number;
  minimumAdjustment: number;
  estimated: number;
  currency: string;
  configVersion: unknown;
}

export async function getFareConfig(): Promise<FareConfiguration> {
  const active = await FareConfigurationModel.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (active) return active.toObject() as FareConfiguration;

  const created = await FareConfigurationModel.create({
    name: 'Default bike fare',
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
  return created.toObject() as FareConfiguration;
}

export function calculateFare(
  config: FareConfiguration,
  distanceMeters: number,
  durationSeconds: number,
  waitingMinutes = 0,
): FareBreakdown {
  const distanceKm = Math.max(0, distanceMeters) / 1000;
  const baseFare = roundMoney(config.baseFare);
  const distanceFare = roundMoney(distanceKm * config.perKm);
  const timeFare = roundMoney((Math.max(0, durationSeconds) / 60) * config.perMinute);
  const billableWaiting = Math.max(0, waitingMinutes - config.waitingFreeMinutes);
  const waitingCharges = roundMoney(billableWaiting * config.waitingPerMinute);
  const platformFee = roundMoney(config.platformFee);
  const subtotal = baseFare + distanceFare + timeFare + waitingCharges + platformFee;
  const estimated = roundMoney(Math.max(config.minimumFare, subtotal));

  return {
    baseFare,
    distanceFare,
    timeFare,
    waitingCharges,
    platformFee,
    subtotal,
    minimumAdjustment: Math.max(0, estimated - subtotal),
    estimated,
    currency: config.currency || 'INR',
    configVersion: (config as { _id?: unknown })._id ?? null,
  };
}
