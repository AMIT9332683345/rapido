import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bike,
  Clock3,
  Download,
  MapPin,
  Navigation,
  ShieldCheck,
  Smartphone,
  Wallet,
  Waves,
} from 'lucide-react';
import { BrandMark, Button } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { canInstall, promptInstall, subscribeInstall } from '../../lib/install';
import { homeForRole } from '../../lib/session';
import { APP_NAME, SERVICE_LOCATION } from '../../config';

function useInstallable() {
  const [available, setAvailable] = useState(canInstall());
  useEffect(() => subscribeInstall(() => setAvailable(canInstall())), []);
  return available;
}

function HeroMap() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[36px] border border-cream/15 bg-ink-800 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.8)]">
        <svg viewBox="0 0 400 500" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <rect width="400" height="500" fill="#0c2b27" />
          <g stroke="#f7f3e8" strokeOpacity="0.14" strokeWidth="1.2" fill="none">
            {Array.from({ length: 14 }).map((_, index) => (
              <path
                key={index}
                d={`M-20 ${60 + index * 32} C 80 ${30 + index * 34}, 150 ${110 + index * 30}, 240 ${
                  80 + index * 32
                } S 360 ${130 + index * 28}, 430 ${90 + index * 30}`}
              />
            ))}
          </g>
          <path
            d="M-10 430 C 90 380, 110 300, 180 280 S 300 200, 330 90"
            stroke="#ffb020"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M-10 430 C 90 380, 110 300, 180 280 S 300 200, 330 90"
            stroke="#f7f3e8"
            strokeWidth="1.4"
            fill="none"
            strokeDasharray="6 8"
          />
          <circle cx="180" cy="280" r="12" fill="#f7f3e8" />
          <circle cx="180" cy="280" r="5" fill="#08211f" />
          <circle cx="330" cy="90" r="14" fill="#ffb020" stroke="#08211f" strokeWidth="4" />
          <circle cx="280" cy="160" r="7" fill="#1f7f71" stroke="#f7f3e8" strokeWidth="2" />
          <g transform="translate(64 330)">
            <circle r="26" fill="#08211f" stroke="#ffb020" strokeWidth="3" />
            <g transform="translate(-11 -11)" stroke="#ffb020" strokeWidth="2" fill="none" strokeLinecap="round">
              <circle cx="5" cy="16" r="4" />
              <circle cx="17" cy="16" r="4" />
              <path d="M5 16l4-7h6l2 7" />
              <path d="M9 9l-2 7" />
              <path d="M15 9l1-3" />
            </g>
          </g>
        </svg>

        <div className="absolute inset-x-3 top-3 flex items-center justify-between rounded-2xl border border-cream/10 bg-ink/70 px-3 py-2 backdrop-blur">
          <span className="flex items-center gap-2 text-[11px] font-semibold text-cream">
            <span className="h-2 w-2 rounded-full bg-mango" />
            {SERVICE_LOCATION}
          </span>
          <span className="rounded-full bg-cream/10 px-2 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-cream/70">
            Live map
          </span>
        </div>

        <div className="absolute inset-x-3 bottom-3 rounded-3xl border border-line/70 bg-cream p-4 shadow-soft">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Bike taxi
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-cream" />
            <span className="text-[12px] font-semibold text-ink">Your pickup</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-white px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-mango" />
            <span className="text-[12px] font-semibold text-ink">Where do you want to go?</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-ink px-3 py-2.5 text-cream">
            <span className="text-[11px] font-medium text-cream/70">Fare shown before booking</span>
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-mango">
              Book bike <ArrowRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl border border-line/80 bg-white p-5">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cream text-teal">{icon}</span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export default function Landing() {
  const { session } = useAuth();
  const installable = useInstallable();
  const startPath = session ? homeForRole(session.role) : '/login?role=customer';
  const riderPath = session?.role === 'rider' ? '/rider' : '/login?role=rider';

  return (
    <div className="min-h-[100dvh] bg-cream">
      <header className="safe-top sticky top-0 z-30 border-b border-line/60 bg-cream/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark size={36} />
            <span className="font-display text-[21px] font-semibold tracking-tight">
              {APP_NAME}
              <span className="text-mango">.</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link
              to={riderPath}
              className="hidden rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-ink transition hover:bg-ink/[0.06] sm:inline-flex"
            >
              Drive with {APP_NAME}
            </Link>
            <Link to="/login?role=admin" className="hidden rounded-full px-3 py-2 text-[12px] font-medium text-muted hover:text-ink sm:inline-flex">
              Admin
            </Link>
            <Link to={startPath}>
              <Button size="sm" icon={<Bike size={15} />}>
                {session ? 'Open app' : 'Book a bike'}
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-ink text-cream">
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-mango/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-teal/20 blur-3xl" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-white/5 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-cream/80">
                <span className="h-1.5 w-1.5 rounded-full bg-mango" />
                Now serving {SERVICE_LOCATION}
              </span>
              <h1 className="mt-5 font-display text-[40px] font-semibold leading-[1.03] tracking-[-0.03em] sm:text-[56px]">
                Bikes for the
                <br />
                <span className="text-mango">back lanes</span> of Gosaba.
              </h1>
              <p className="mt-5 max-w-lg text-[14.5px] leading-relaxed text-cream/65 sm:text-[15.5px]">
                A local bike taxi built for the islands. See the road distance and fare
                before you book, follow your rider live, and pay cash when you arrive.
              </p>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <Link to={startPath} className="sm:w-auto">
                  <Button size="xl" block icon={<Bike size={20} />}>
                    {session?.role === 'customer' ? 'Book a ride' : 'Get started'}
                  </Button>
                </Link>
                <Link to={riderPath} className="sm:w-auto">
                  <Button
                    size="xl"
                    block
                    variant="outline"
                    className="border-cream/20 bg-transparent text-cream hover:border-cream/40 hover:bg-white/5"
                    icon={<Navigation size={18} />}
                  >
                    Drive with {APP_NAME}
                  </Button>
                </Link>
              </div>

              {installable ? (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-cream/70 underline decoration-cream/30 underline-offset-4 hover:text-cream"
                >
                  <Download size={14} /> Install the app on your phone
                </button>
              ) : null}

              <div className="mt-8 grid max-w-md grid-cols-3 gap-2 border-t border-cream/10 pt-5 text-cream/80">
                <div>
                  <p className="font-display text-[17px] font-semibold text-cream">Real roads</p>
                  <p className="mt-0.5 text-[10.5px] leading-tight text-cream/50">
                    OSRM routing on OSM data
                  </p>
                </div>
                <div>
                  <p className="font-display text-[17px] font-semibold text-cream">Cash ride</p>
                  <p className="mt-0.5 text-[10.5px] leading-tight text-cream/50">
                    No card needed
                  </p>
                </div>
                <div>
                  <p className="font-display text-[17px] font-semibold text-cream">PWA</p>
                  <p className="mt-0.5 text-[10.5px] leading-tight text-cream/50">
                    Installable on Android
                  </p>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              <HeroMap />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-teal">
                How it works
              </p>
              <h2 className="mt-2 max-w-lg font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">
                Three taps from your doorstep to the market.
              </h2>
            </div>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">
              Every step is confirmed by the server, so two riders can never accept the same
              booking.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: <MapPin size={18} />,
                title: 'Drop your pins',
                body: 'Search an OpenStreetMap place or drag the pickup and drop pins to the exact lane.',
              },
              {
                icon: <Clock3 size={18} />,
                title: 'See the real route',
                body: 'Road distance, travel time and a fare breakdown appear before you confirm.',
              },
              {
                icon: <Bike size={18} />,
                title: 'Ride and track',
                body: 'A nearby rider accepts, you follow their live GPS, and pay cash at the end.',
              },
            ].map((step, index) => (
              <div key={step.title} className="relative rounded-3xl border border-line/80 bg-white p-5">
                <span className="absolute right-4 top-4 font-display text-[28px] font-semibold text-cream-200">
                  0{index + 1}
                </span>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-mango">
                  {step.icon}
                </span>
                <h3 className="mt-3 font-display text-[15.5px] font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-line/70 bg-cream-200/40">
          <div className="mx-auto grid max-w-6xl gap-3 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <Feature
              icon={<ShieldCheck size={18} />}
              title="Verified riders"
              body="Licence, identity and vehicle documents are reviewed by an admin before a rider can go online."
            />
            <Feature
              icon={<Waves size={18} />}
              title="River-aware routing"
              body="If the road network cannot connect two points, the app says so instead of drawing a fake line across water."
            />
            <Feature
              icon={<Wallet size={18} />}
              title="Fares you can read"
              body="Base, distance, time and waiting charges are always itemised. No surprise surge."
            />
            <Feature
              icon={<Smartphone size={18} />}
              title="Built for one hand"
              body="Full-screen map, thumb-sized controls and an installable app that opens straight to the map."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-line/80 bg-white p-6 sm:p-8">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-teal">
                The service area
              </p>
              <h2 className="mt-2 font-display text-[24px] font-semibold tracking-tight">
                One island group, one honest boundary.
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Bookings are checked against the real Gosaba administrative boundary from
                OpenStreetMap, not a rectangle drawn on a screen. Pickup and drop must both
                fall inside it.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[11.5px] font-semibold">
                <span className="rounded-full bg-cream px-3 py-1.5 text-ink">Chhoto Mollakhali</span>
                <span className="rounded-full bg-cream px-3 py-1.5 text-ink">Gosaba</span>
                <span className="rounded-full bg-cream px-3 py-1.5 text-ink">South 24 Parganas</span>
              </div>
              <p className="mt-5 text-[10.5px] leading-relaxed text-muted">
                Boundary source: OSM relation 10372784. Map data © OpenStreetMap contributors,
                available under the ODbL.
              </p>
            </div>

            <div className="flex flex-col justify-between rounded-3xl bg-mango p-6 text-ink sm:p-8">
              <div>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-mango">
                  <Bike size={20} />
                </span>
                <h2 className="mt-4 font-display text-[23px] font-semibold leading-tight">
                  Have a bike and know the lanes?
                </h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink/70">
                  Register, upload your documents, and start taking rides once an admin
                  approves your account. See your daily earnings in the rider app.
                </p>
              </div>
              <Link to={riderPath} className="mt-6">
                <Button variant="ink" block size="lg" icon={<ArrowRight size={17} />}>
                  Become a rider
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70 bg-cream">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <BrandMark size={28} />
            <span className="font-display text-[15px] font-semibold">
              {APP_NAME}
              <span className="text-mango">.</span>
            </span>
            <span className="text-[11px] text-muted">Bike taxi for the islands</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            <Link to="/login?role=rider" className="hover:text-ink">
              Rider sign in
            </Link>
            <Link to="/login?role=admin" className="hover:text-ink">
              Admin
            </Link>
            <span>© {new Date().getFullYear()} {APP_NAME}</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink"
            >
              OpenStreetMap
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
