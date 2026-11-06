import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BadgePercent,
  House,
  LayoutDashboard,
  ReceiptText,
  Route,
  UserRound,
  Wallet,
} from 'lucide-react';
import { cn, IconButton } from './ui';
import type { Role } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: typeof House;
  end?: boolean;
}

const NAV: Record<'customer' | 'rider', NavItem[]> = {
  customer: [
    { to: '/app', label: 'Home', icon: House, end: true },
    { to: '/app/rides', label: 'Rides', icon: ReceiptText },
    { to: '/app/offers', label: 'Offers', icon: BadgePercent },
    { to: '/app/profile', label: 'Profile', icon: UserRound },
  ],
  rider: [
    { to: '/rider', label: 'Drive', icon: LayoutDashboard, end: true },
    { to: '/rider/rides', label: 'Rides', icon: Route },
    { to: '/rider/earnings', label: 'Earnings', icon: Wallet },
    { to: '/rider/profile', label: 'Profile', icon: UserRound },
  ],
};

export function BottomNav({ role }: { role: 'customer' | 'rider' }) {
  return (
    <nav className="safe-bottom absolute inset-x-0 bottom-0 z-40 border-t border-line/70 bg-cream/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-lg items-stretch justify-around px-2">
        {NAV[role].map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[10.5px] font-semibold transition-colors',
                  isActive ? 'text-ink' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-8 w-12 place-items-center rounded-full transition-colors',
                      isActive ? 'bg-mango' : 'bg-transparent',
                    )}
                  >
                    <Icon size={19} strokeWidth={isActive ? 2.3 : 2} />
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileShell({ role, children }: { role: 'customer' | 'rider'; children: ReactNode }) {
  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-cream">
      <main className="relative min-h-0 flex-1">{children}</main>
      <BottomNav role={role} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  right,
  dark = false,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  right?: ReactNode;
  dark?: boolean;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else navigate(-1);
  };

  return (
    <header
      className={cn(
        'safe-top sticky top-0 z-30 border-b px-4 pb-3 pt-2',
        dark ? 'border-white/10 bg-ink text-cream' : 'border-line/70 bg-cream/95 text-ink backdrop-blur-xl',
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {back ? (
          <IconButton
            label="Go back"
            onClick={goBack}
            className={cn('shrink-0', dark ? 'bg-white/10 hover:bg-white/15' : 'bg-white hover:bg-cream')}
          >
            <ArrowLeft size={19} />
          </IconButton>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[19px] font-semibold">{title}</h1>
          {subtitle ? (
            <p className={cn('truncate text-[12px]', dark ? 'text-cream/60' : 'text-muted')}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}

export function MapTopBar({
  role,
  trailing,
}: {
  role: Role;
  trailing?: ReactNode;
}) {
  return (
    <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 pb-2 pt-2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line/70 bg-cream/95 py-1.5 pl-1.5 pr-3.5 shadow-lift backdrop-blur">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink">
          <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="46" cy="18" r="8" fill="#ffb020" />
            <g fill="none" stroke="#f7f3e8" strokeWidth="3" strokeLinecap="round">
              <circle cx="18" cy="44" r="6.6" />
              <circle cx="46" cy="44" r="6.6" />
              <path d="M18 44l12-12h11l5 12" />
              <path d="M30 32l-5 12" />
              <path d="M41 32l1-5" />
              <path d="M38 27h7" />
            </g>
          </svg>
        </span>
        <span className="font-display text-[15px] font-semibold leading-none">
          Amit<span className="text-mango">.</span>
        </span>
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted min-[390px]:inline">
          {role === 'rider' ? 'Rider' : role === 'admin' ? 'Admin' : 'Gosaba'}
        </span>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">{trailing}</div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.13em] text-muted">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
