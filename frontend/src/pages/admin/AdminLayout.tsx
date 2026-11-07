import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bike,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  MapPinned,
  Menu,
  Radar,
  ReceiptIndianRupee,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn, IconButton, Sheet } from '../../components/ui';
import { APP_NAME } from '../../config';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/riders', label: 'Riders', icon: Bike },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/bookings', label: 'Bookings', icon: ReceiptIndianRupee },
  { to: '/admin/live', label: 'Live map', icon: Radar },
  { to: '/admin/map-notes', label: 'Map notes', icon: MapPinned },
  { to: '/admin/fare', label: 'Fare config', icon: Settings2 },
  { to: '/admin/service-area', label: 'Service area', icon: MapIcon },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-colors',
                isActive
                  ? 'bg-mango text-ink'
                  : 'text-cream/60 hover:bg-white/5 hover:text-cream',
              )
            }
          >
            <Icon size={17} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const current = NAV.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  return (
    <div className="min-h-[100dvh] bg-cream lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col justify-between overflow-y-auto border-r border-white/10 bg-ink px-4 py-5 lg:flex">
        <div>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2.5 px-1 text-left"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-mango text-ink">
              <ShieldCheck size={20} />
            </span>
            <span>
              <span className="block font-display text-[19px] font-semibold leading-none text-cream">
                {APP_NAME}<span className="text-mango">.</span>
              </span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/40">
                Operations
              </span>
            </span>
          </button>

          <div className="mt-7">
            <NavList />
          </div>

          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream/40">
              Admin
            </p>
            <p className="mt-1 truncate text-[13px] font-semibold text-cream">{user?.name}</p>
            <p className="text-[11px] text-cream/45">+91 {user?.mobile}</p>
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/admin/reports')}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 px-2 py-2 text-[10.5px] font-semibold text-cream hover:bg-white/15"
              >
                <CalendarRange size={12} /> Reports
              </button>
              <IconButton
                label="Sign out"
                onClick={logout}
                className="h-8 w-8 bg-white/10 text-cream/70 hover:bg-white/15 hover:text-cream"
              >
                <LogOut size={14} />
              </IconButton>
            </div>
          </div>
        </div>
        <p className="px-1 text-[9.5px] leading-relaxed text-cream/25">
          Map data © OpenStreetMap contributors. Fares and boundaries are server-side.
        </p>
      </aside>

      <div className="flex min-h-[100dvh] flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/70 bg-cream/95 px-4 py-3 backdrop-blur lg:hidden">
          <IconButton
            label="Open admin menu"
            onClick={() => setMenuOpen(true)}
            className="bg-white text-ink"
          >
            <Menu size={19} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] font-semibold leading-none text-ink">
              {current?.label ?? 'Admin'}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {APP_NAME} operations
            </p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-mango">
            <ShieldCheck size={17} />
          </span>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Operations"
        description="Manage riders, rides and fares."
      >
        <div className="pb-2">
          <NavList onNavigate={() => setMenuOpen(false)} />
          <button
            type="button"
            onClick={logout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3 text-[13px] font-semibold text-danger"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}
