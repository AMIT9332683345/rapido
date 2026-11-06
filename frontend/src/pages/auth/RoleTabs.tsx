import { Bike, ShieldCheck, UserRound } from 'lucide-react';
import type { Role } from '../../types';
import { cn } from '../../components/ui';

const ROLES: { value: Role; label: string; icon: typeof UserRound }[] = [
  { value: 'customer', label: 'Customer', icon: UserRound },
  { value: 'rider', label: 'Rider', icon: Bike },
  { value: 'admin', label: 'Admin', icon: ShieldCheck },
];

export function RoleTabs({
  value,
  onChange,
  allowed = ['customer', 'rider', 'admin'],
  className,
}: {
  value: Role;
  onChange: (role: Role) => void;
  allowed?: Role[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-1 rounded-2xl border border-line bg-white p-1',
        allowed.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
        className,
      )}
    >
      {ROLES.filter((role) => allowed.includes(role.value)).map((role) => {
        const Icon = role.icon;
        const active = role.value === value;
        return (
          <button
            key={role.value}
            type="button"
            onClick={() => onChange(role.value)}
            aria-pressed={active}
            className={cn(
              'flex h-10 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold transition-colors',
              active ? 'bg-ink text-cream' : 'text-muted hover:text-ink',
            )}
          >
            <Icon size={15} className={active ? 'text-mango' : ''} />
            {role.label}
          </button>
        );
      })}
    </div>
  );
}
