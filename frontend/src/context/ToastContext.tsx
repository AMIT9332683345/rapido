import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type Tone = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  title?: string;
  message: string;
  tone: Tone;
}

interface ToastApi {
  show: (message: string, options?: { title?: string; tone?: Tone; duration?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const toneStyles: Record<Tone, string> = {
  info: 'bg-ink text-cream',
  success: 'bg-ink text-cream',
  error: 'bg-[#3a1515] text-[#ffe8e4]',
  warning: 'bg-[#3a2a08] text-[#fff1cf]',
};

const toneIcon: Record<Tone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, options) => {
      const id = ++counter.current;
      const item: ToastItem = {
        id,
        message,
        title: options?.title,
        tone: options?.tone ?? 'info',
      };
      setItems((current) => [...current.slice(-2), item]);
      const timer = window.setTimeout(() => dismiss(id), options?.duration ?? 4400);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, title) => show(message, { tone: 'success', title }),
      error: (message, title) => show(message, { tone: 'error', title, duration: 6000 }),
      info: (message, title) => show(message, { tone: 'info', title }),
      warning: (message, title) => show(message, { tone: 'warning', title }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {items.map((item) => {
          const Icon = toneIcon[item.tone];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => dismiss(item.id)}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-left shadow-soft animate-rise ${toneStyles[item.tone]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0 opacity-80" />
              <span className="min-w-0 flex-1">
                {item.title ? (
                  <span className="block text-[13px] font-semibold">{item.title}</span>
                ) : null}
                <span className="block text-[13px] leading-snug opacity-90">{item.message}</span>
              </span>
              <X size={16} className="mt-0.5 shrink-0 opacity-50" />
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
