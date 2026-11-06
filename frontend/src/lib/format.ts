import type { RideStatus } from '../types';

export function money(value: number | null | undefined, currency = 'INR'): string {
  const amount = Number(value ?? 0);
  const hasPaise = Math.abs(amount % 1) > 0.001;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(amount);
}

export function km(meters: number | null | undefined): string {
  const value = Number(meters ?? 0);
  if (value < 950) return `${Math.max(0, Math.round(value))} m`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
}

export function minutes(seconds: number | null | undefined): string {
  const value = Math.max(0, Number(seconds ?? 0));
  if (value < 60) return '<1 min';
  return `${Math.round(value / 60)} min`;
}

// The service runs in Gosaba; timestamps stay on IST regardless of device zone.
const TIME_ZONE = 'Asia/Kolkata';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Day buckets arrive as YYYY-MM-DD; format the parts directly so the label
  // cannot shift by a day when the device is outside IST.
  const parts = DATE_ONLY.exec(iso);
  if (parts) return `${Number(parts[3])} ${MONTHS[Number(parts[2]) - 1]}`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: TIME_ZONE,
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: TIME_ZONE,
  })}, ${date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  })}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return shortDate(iso);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export function statusLabel(status: RideStatus | string): string {
  const labels: Record<string, string> = {
    SEARCHING: 'Finding a rider',
    REQUESTED: 'Request sent',
    ACCEPTED: 'Rider assigned',
    RIDER_ARRIVING: 'Rider on the way',
    RIDER_ARRIVED: 'Rider at pickup',
    IN_PROGRESS: 'Ride in progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'No rider found',
  };
  return labels[status] || titleCase(status);
}

export function statusTone(status: RideStatus | string): 'mango' | 'teal' | 'success' | 'danger' | 'muted' {
  if (status === 'SEARCHING' || status === 'REQUESTED') return 'mango';
  if (status === 'ACCEPTED' || status === 'RIDER_ARRIVING' || status === 'RIDER_ARRIVED') return 'teal';
  if (status === 'IN_PROGRESS') return 'teal';
  if (status === 'COMPLETED') return 'success';
  if (status === 'CANCELLED' || status === 'EXPIRED') return 'danger';
  return 'muted';
}

export function isActiveStatus(status: RideStatus | string): boolean {
  return ['SEARCHING', 'REQUESTED', 'ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED', 'IN_PROGRESS'].includes(
    status,
  );
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowTime(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  if (digits.length < 4) return mobile;
  return `••••••${digits.slice(-4)}`;
}
