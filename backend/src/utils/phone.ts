import { HttpError } from './httpError.js';

export function normalizeMobile(input: string): string {
  const digits = String(input ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) {
    throw HttpError.badRequest('Enter a valid 10 digit Indian mobile number');
  }
  return local;
}

export function maskMobile(mobile: string): string {
  return mobile.length === 10 ? `${mobile.slice(0, 3)}••••${mobile.slice(7)}` : mobile;
}
