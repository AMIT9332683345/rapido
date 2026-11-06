import { Link } from 'react-router-dom';
import { Compass, House } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from '../../lib/session';

export default function NotFound() {
  const { session } = useAuth();

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-cream px-5">
      <div className="w-full max-w-md space-y-5 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-ink text-mango">
          <Compass size={26} />
        </span>
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            404 · off the map
          </p>
          <h1 className="mt-2 font-display text-[26px] font-semibold text-ink">
            This lane does not exist
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            The page you followed is not part of Amit. Head back to your dashboard or the home page.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link to={session ? homeForRole(session.role) : '/'}>
            <Button block size="lg" icon={<House size={18} />}>
              {session ? 'Go to my dashboard' : 'Go home'}
            </Button>
          </Link>
          <Link to="/" className="text-[12.5px] font-semibold text-muted hover:text-ink">
            About Amit
          </Link>
        </div>
      </div>
    </div>
  );
}
