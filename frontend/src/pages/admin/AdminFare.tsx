import { useEffect, useMemo, useState } from 'react';
import { Bike, Check, IndianRupee, Info, Save, Settings2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DetailRow,
  FullPageLoader,
  Input,
  SectionTitle,
} from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useToast } from '../../context/ToastContext';
import type { FareConfig } from '../../types';

type NumericKey =
  | 'baseFare'
  | 'perKm'
  | 'perMinute'
  | 'minimumFare'
  | 'waitingFreeMinutes'
  | 'waitingPerMinute'
  | 'cancellationFee'
  | 'platformFee';

const FIELDS: {
  key: NumericKey;
  label: string;
  hint: string;
  step: string;
  money?: boolean;
}[] = [
  {
    key: 'baseFare',
    label: 'Base fare',
    hint: 'Charged as soon as a ride is booked.',
    step: '1',
    money: true,
  },
  {
    key: 'perKm',
    label: 'Per kilometre',
    hint: 'Multiplied by the routed distance.',
    step: '0.5',
    money: true,
  },
  {
    key: 'perMinute',
    label: 'Per minute',
    hint: 'Multiplied by estimated travel time.',
    step: '0.5',
    money: true,
  },
  {
    key: 'minimumFare',
    label: 'Minimum fare',
    hint: 'The floor applied after the base components.',
    step: '1',
    money: true,
  },
  {
    key: 'waitingFreeMinutes',
    label: 'Free waiting minutes',
    hint: 'Rider waiting time included at the pickup point.',
    step: '1',
    money: false,
  },
  {
    key: 'waitingPerMinute',
    label: 'Waiting per minute',
    hint: 'Applied after the free waiting window.',
    step: '0.5',
    money: true,
  },
  {
    key: 'cancellationFee',
    label: 'Cancellation fee',
    hint: 'Charged when a customer cancels after a rider is assigned.',
    step: '1',
    money: true,
  },
  {
    key: 'platformFee',
    label: 'Platform fee',
    hint: 'Added to every completed fare.',
    step: '1',
    money: true,
  },
];

type FormState = Record<NumericKey, string> & { name: string };

function toForm(config: FareConfig): FormState {
  return {
    name: config.name ?? 'Standard bike taxi',
    baseFare: String(config.baseFare),
    perKm: String(config.perKm),
    perMinute: String(config.perMinute),
    minimumFare: String(config.minimumFare),
    waitingFreeMinutes: String(config.waitingFreeMinutes),
    waitingPerMinute: String(config.waitingPerMinute),
    cancellationFee: String(config.cancellationFee),
    platformFee: String(config.platformFee),
  };
}

export default function AdminFare() {
  const toast = useToast();
  const query = useQuery<FareConfig>((signal) => api.get<FareConfig>('/admin/fare-config', { signal }), []);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data) setForm(toForm(query.data));
  }, [query.data]);

  const numbers = useMemo(() => {
    if (!form) return null;
    const parsed = {} as Record<NumericKey, number>;
    (Object.keys(form) as (keyof FormState)[]).forEach((key) => {
      if (key === 'name') return;
      parsed[key as NumericKey] = Number(form[key]);
    });
    return parsed;
  }, [form]);

  if (query.loading && !query.data) return <FullPageLoader label="Loading fare configuration" />;

  if (query.error || !form || !numbers) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <SectionTitle title="Fare configuration" />
          <p className="mt-2 text-[13px] text-muted">
            {query.error ?? 'The fare configuration is not available.'}
          </p>
          <Button className="mt-3" variant="outline" onClick={query.reload}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const invalidMinimum = numbers.minimumFare < numbers.baseFare;
  const invalidNumber = Object.values(numbers).some(
    (value) => !Number.isFinite(value) || value < 0,
  );

  const sampleKm = 4;
  const sampleMinutes = 12;
  const sampleBase = numbers.baseFare;
  const sampleDistance = numbers.perKm * sampleKm;
  const sampleTime = numbers.perMinute * sampleMinutes;
  const sampleSubtotal = sampleBase + sampleDistance + sampleTime;
  const sampleTopUp = Math.max(0, numbers.minimumFare - sampleSubtotal);
  const sampleTotal = sampleSubtotal + sampleTopUp + numbers.platformFee;

  const save = async () => {
    if (invalidNumber) {
      toast.error('Every fare value must be a non-negative number.');
      return;
    }
    if (invalidMinimum) {
      toast.error('Minimum fare cannot be lower than the base fare.');
      return;
    }
    setSaving(true);
    try {
      await api.put<FareConfig>('/admin/fare-config', {
        name: form.name.trim() || 'Standard bike taxi',
        baseFare: numbers.baseFare,
        perKm: numbers.perKm,
        perMinute: numbers.perMinute,
        minimumFare: numbers.minimumFare,
        waitingFreeMinutes: numbers.waitingFreeMinutes,
        waitingPerMinute: numbers.waitingPerMinute,
        cancellationFee: numbers.cancellationFee,
        platformFee: numbers.platformFee,
      });
      toast.success('Fare configuration saved. New estimates use these values.');
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof FormState, value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Pricing engine
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Fare configuration
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            The server recalculates every estimate and final fare from these values.
          </p>
        </div>
        <Badge tone="teal">INR · cash</Badge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <SectionTitle
            title="Rate card"
            action={
              query.data?.updatedAt ? (
                <span className="text-[10px] text-muted">
                  Saved{' '}
                  {new Date(query.data.updatedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'Asia/Kolkata',
                  })}
                </span>
              ) : null
            }
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                Plan name
              </span>
              <Input
                value={form.name}
                maxLength={80}
                onChange={(event) => set('name', event.target.value)}
              />
            </label>
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  {field.label}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={field.step}
                  value={form[field.key]}
                  onChange={(event) => set(field.key, event.target.value)}
                  icon={
                    field.money ? (
                      <IndianRupee size={14} />
                    ) : (
                      <Bike size={14} />
                    )
                  }
                />
                <span className="mt-1 block text-[10.5px] leading-snug text-muted">
                  {field.hint}
                </span>
              </label>
            ))}
          </div>

          {invalidMinimum ? (
            <p className="mt-3 rounded-2xl bg-danger-100 px-3 py-2 text-[12px] font-medium text-danger">
              Minimum fare must be at least the base fare ({money(numbers.baseFare)}).
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2 border-t border-line/60 pt-3">
            <Button
              icon={<Save size={15} />}
              loading={saving}
              disabled={invalidMinimum || invalidNumber}
              onClick={save}
            >
              Save fare rules
            </Button>
            <Button
              variant="outline"
              disabled={saving || !query.data}
              onClick={() => query.data && setForm(toForm(query.data))}
            >
              Reset
            </Button>
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionTitle title="Example" />
            <p className="mt-1 text-[11.5px] leading-snug text-muted">
              A {sampleKm} km ride with {sampleMinutes} minutes of travel time.
            </p>
            <div className="mt-3 space-y-1.5">
              <DetailRow label="Base" value={money(numbers.baseFare)} />
              <DetailRow
                label={`Distance · ${sampleKm} km`}
                value={money(numbers.perKm * sampleKm)}
              />
              <DetailRow
                label={`Time · ${sampleMinutes} min`}
                value={money(numbers.perMinute * sampleMinutes)}
              />
              {sampleTopUp > 0 ? (
                <DetailRow label="Minimum fare top-up" value={money(sampleTopUp)} />
              ) : null}
              <DetailRow label="Platform fee" value={money(numbers.platformFee)} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2.5">
              <span className="text-[12px] font-semibold text-ink">Customer pays</span>
              <span className="font-display text-[20px] font-semibold text-ink">
                {money(sampleTotal)}
              </span>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-muted">
              Waiting after {numbers.waitingFreeMinutes} free minutes adds{' '}
              {money(numbers.waitingPerMinute)} per minute. Cancellation after assignment costs{' '}
              {money(numbers.cancellationFee)}.
            </p>
          </Card>

          <Card className="bg-cream/60">
            <div className="flex gap-2">
              <Info size={16} className="mt-0.5 shrink-0 text-teal" />
              <div>
                <p className="text-[12px] font-semibold text-ink">How it applies</p>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted">
                  <li>Estimates in the customer app use this exact formula.</li>
                  <li>
                    The quoted fare is stored with the booking; edits here only affect future
                    bookings and active dispatch does not re-quote.
                  </li>
                  <li>Completed fares are calculated server-side and cannot be edited.</li>
                </ul>
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <Settings2 size={12} />
            <Check size={12} /> Stored in MongoDB, not in the frontend.
          </div>
        </div>
      </div>
    </div>
  );
}
