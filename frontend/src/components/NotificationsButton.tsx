import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Bike,
  CheckCircle2,
  Info,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import type { AppNotification } from '../types';
import { Badge, EmptyState, IconButton, Sheet, Spinner } from './ui';

function iconFor(type: string) {
  if (type.startsWith('ride_request')) return Bike;
  if (type.startsWith('ride_accepted') || type.startsWith('ride_assigned')) return CheckCircle2;
  if (type.startsWith('ride_completed')) return Wallet;
  if (type.startsWith('account_') || type.startsWith('document_')) return ShieldCheck;
  if (type.startsWith('ride_cancelled') || type.startsWith('ride_expired')) return XCircle;
  return Info;
}

export function NotificationsButton({
  tone = 'light',
  className,
}: {
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ unread: number; notifications: AppNotification[] }>(
        '/notifications',
      );
      setItems(result.notifications);
      setUnread(result.unread);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSocketEvent<AppNotification>('notification', (notification) => {
    setItems((current) => [notification, ...current.filter((n) => n.id !== notification.id)].slice(0, 50));
    setUnread((value) => value + 1);
  });

  const openSheet = async () => {
    setOpen(true);
    if (unread > 0) {
      try {
        await api.post('/notifications/read-all');
        setUnread(0);
      } catch {
        // Reading notifications is not critical enough to block the sheet.
      }
    }
  };

  const openNotification = (notification: AppNotification) => {
    const bookingId = notification.data?.bookingId;
    if (bookingId) {
      navigate(role === 'rider' ? `/rider/ride/${bookingId}` : `/app/ride/${bookingId}`);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openSheet()}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className={`relative grid h-10 w-10 place-items-center rounded-full border shadow-lift backdrop-blur transition ${
          tone === 'dark'
            ? 'border-white/15 bg-ink/80 text-cream hover:bg-ink'
            : 'border-line bg-white/95 text-ink hover:bg-white'
        } ${className ?? ''}`}
      >
        <Bell size={18} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-mango px-1 text-[9.5px] font-bold text-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        description="Ride updates and account alerts."
      >
        {loading && !items.length ? (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <div className="py-6 text-center text-[13px] text-danger">{error}</div>
        ) : !items.length ? (
          <EmptyState
            icon={<Bell size={20} />}
            title="Nothing yet"
            body="Ride requests, assignments and account updates will show up here."
          />
        ) : (
          <ul className="space-y-2 pb-2">
            {items.map((notification) => {
              const Icon = iconFor(notification.type);
              const clickable = Boolean(notification.data?.bookingId);
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left ${
                      notification.readAt
                        ? 'border-line/70 bg-white'
                        : 'border-mango/40 bg-mango-100/40'
                    } ${clickable ? '' : 'cursor-default'}`}
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-mango">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">
                          {notification.title}
                        </span>
                        {!notification.readAt ? <Badge tone="mango">New</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {notification.body}
                      </span>
                      <span className="mt-1 block text-[10.5px] font-medium uppercase tracking-wide text-muted/80">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}

export function NotificationsIconButton({ className }: { className?: string }) {
  return (
    <IconButton label="Notifications" className={className}>
      <Bell size={18} />
    </IconButton>
  );
}

export default NotificationsButton;
