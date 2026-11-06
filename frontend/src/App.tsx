import { useEffect, useState } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { RequireRole } from './components/RequireRole';
import { MobileShell } from './components/layout';
import Landing from './pages/auth/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import CustomerHome from './pages/customer/CustomerHome';
import CustomerRides from './pages/customer/CustomerRides';
import CustomerOffers from './pages/customer/CustomerOffers';
import CustomerProfile from './pages/customer/CustomerProfile';
import CustomerRide from './pages/customer/CustomerRide';
import RiderHome from './pages/rider/RiderHome';
import RiderRides from './pages/rider/RiderRides';
import RiderEarnings from './pages/rider/RiderEarnings';
import RiderProfile from './pages/rider/RiderProfile';
import RiderRide from './pages/rider/RiderRide';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminRiders from './pages/admin/AdminRiders';
import AdminRiderDetail from './pages/admin/AdminRiderDetail';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminBookings from './pages/admin/AdminBookings';
import AdminBookingDetail from './pages/admin/AdminBookingDetail';
import AdminLive from './pages/admin/AdminLive';
import AdminMapNotes from './pages/admin/AdminMapNotes';
import AdminFare from './pages/admin/AdminFare';
import AdminServiceArea from './pages/admin/AdminServiceArea';
import AdminReports from './pages/admin/AdminReports';
import NotFound from './pages/shared/NotFound';

function CustomerShell() {
  return (
    <MobileShell role="customer">
      <Outlet />
    </MobileShell>
  );
}

function RiderShell() {
  return (
    <MobileShell role="rider">
      <Outlet />
    </MobileShell>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-ink px-4 py-2 text-[11.5px] font-semibold text-cream">
      <WifiOff size={13} className="text-mango" />
      You are offline. Live tracking will resume when the connection returns.
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <ScrollToTop />
            <OfflineBanner />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route element={<RequireRole role="customer" />}>
                <Route path="/app/ride/:id" element={<CustomerRide />} />
                <Route path="/app" element={<CustomerShell />}>
                  <Route index element={<CustomerHome />} />
                  <Route path="rides" element={<CustomerRides />} />
                  <Route path="offers" element={<CustomerOffers />} />
                  <Route path="profile" element={<CustomerProfile />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="rider" />}>
                <Route path="/rider/ride/:id" element={<RiderRide />} />
                <Route path="/rider" element={<RiderShell />}>
                  <Route index element={<RiderHome />} />
                  <Route path="rides" element={<RiderRides />} />
                  <Route path="earnings" element={<RiderEarnings />} />
                  <Route path="profile" element={<RiderProfile />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="riders" element={<AdminRiders />} />
                  <Route path="riders/:id" element={<AdminRiderDetail />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="bookings" element={<AdminBookings />} />
                  <Route path="bookings/:id" element={<AdminBookingDetail />} />
                  <Route path="live" element={<AdminLive />} />
                  <Route path="map-notes" element={<AdminMapNotes />} />
                  <Route path="fare" element={<AdminFare />} />
                  <Route path="service-area" element={<AdminServiceArea />} />
                  <Route path="reports" element={<AdminReports />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
