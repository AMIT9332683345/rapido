import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bike, ShieldCheck, Waves } from 'lucide-react';
import { BrandMark, Wordmark } from '../../components/ui';
import { SERVICE_LOCATION } from '../../config';

function MapArt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 600 800"
        className="absolute -right-24 top-0 h-full w-[560px] opacity-[0.22]"
        fill="none"
      >
        <g stroke="#f7f3e8" strokeWidth="1.2">
          {Array.from({ length: 18 }).map((_, index) => (
            <path
              key={index}
              d={`M-40 ${110 + index * 38} C 120 ${70 + index * 42}, 240 ${190 + index * 34}, 380 ${
                140 + index * 38
              } S 560 ${210 + index * 30}, 660 ${160 + index * 36}`}
            />
          ))}
        </g>
        <g stroke="#ffb020" strokeWidth="2.4" strokeLinecap="round">
          <path d="M120 700 C 180 600, 160 520, 250 470 S 380 380, 350 280 S 420 160, 520 120" />
          <path d="M80 560 C 160 540, 220 560, 300 610 S 420 650, 520 600" />
        </g>
        <g fill="#f7f3e8">
          <circle cx="250" cy="470" r="7" />
          <circle cx="350" cy="280" r="5" />
          <circle cx="300" cy="610" r="4" />
        </g>
      </svg>
      <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-cream/15" />
      <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full border border-cream/20" />
    </div>
  );
}

export function AuthLayout({
  children,
  title,
  subtitle,
  back = true,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  back?: boolean;
}) {
  return (
    <div className="min-h-[100dvh] bg-cream lg:grid lg:grid-cols-[1.02fr_0.98fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink px-12 py-10 text-cream lg:flex">
        <MapArt />
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2">
            <BrandMark size={40} />
            <span className="font-display text-[26px] font-semibold">
              Amit<span className="text-mango">.</span>
            </span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream/80">
            <Waves size={13} className="text-mango" />
            {SERVICE_LOCATION}
          </span>
          <h2 className="mt-5 font-display text-[38px] font-semibold leading-[1.08] tracking-tight">
            The shortest way home, across the islands.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-cream/65">
            Verified local riders, fares you can see before you book, and live tracking
            on every lane of Gosaba. No surge games. Cash at the end.
          </p>
          <div className="mt-8 grid gap-3">
            {[
              { icon: Bike, text: 'Bikes that fit the lanes, not the highway' },
              { icon: ShieldCheck, text: 'Approved riders, checked documents' },
              { icon: Waves, text: 'Routes that respect the rivers' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex items-center gap-3 text-[13px] text-cream/80">
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-cream/15 bg-white/5">
                    <Icon size={16} className="text-mango" />
                  </span>
                  {item.text}
                </div>
              );
            })}
          </div>
        </div>

        <p className="relative z-10 text-[11px] leading-relaxed text-cream/35">
          Map data © OpenStreetMap contributors. Some lanes may be missing — support can
          add them.
        </p>
      </aside>

      <main className="relative flex min-h-[100dvh] flex-col bg-cream">
        <div className="safe-top flex items-center justify-between px-5 pt-4 lg:hidden">
          {back ? (
            <Link
              to="/"
              aria-label="Back to home"
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white"
            >
              <ArrowLeft size={18} />
            </Link>
          ) : (
            <span />
          )}
          <Wordmark />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8 sm:px-6">
          <header className="mb-6">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{subtitle}</p>
            ) : null}
          </header>
          {children}
        </div>

        <p className="px-5 pb-6 text-center text-[10.5px] leading-relaxed text-muted/80">
          By continuing you agree to use Amit responsibly. Map data © OpenStreetMap contributors.
        </p>
      </main>
    </div>
  );
}
