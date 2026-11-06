import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Info, Phone } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { RoleTabs } from './RoleTabs';
import { Button, Field, Input, PasswordInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/api';
import { homeForRole } from '../../lib/session';
import type { Role } from '../../types';

function coerceRole(value: string | null): Role {
  return value === 'rider' || value === 'admin' ? value : 'customer';
}

export default function Login() {
  const [params, setParams] = useSearchParams();
  const role = coerceRole(params.get('role'));
  const next = params.get('next');
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return <Navigate to={next && next.startsWith(homeForRole(session.role)) ? next : homeForRole(session.role)} replace />;
  }

  const changeRole = (value: Role) => {
    const updated = new URLSearchParams(params);
    updated.set('role', value);
    updated.delete('next');
    setParams(updated, { replace: true });
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mobile.replace(/\D/g, '').length !== 10) {
      setError('Enter a valid 10 digit Indian mobile number.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      const result = await login(role, mobile, password);
      toast.success(`Welcome back, ${result.user.name.split(' ')[0]}.`);
      navigate(
        next && next.startsWith(homeForRole(result.role)) ? next : homeForRole(result.role),
        { replace: true },
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Role, { title: string; subtitle: string }> = {
    customer: {
      title: 'Welcome back',
      subtitle: 'Sign in to book a bike across Gosaba. Your rides and saved places are waiting.',
    },
    rider: {
      title: 'Rider sign in',
      subtitle: 'Go online, accept nearby requests and track your daily earnings.',
    },
    admin: {
      title: 'Operations sign in',
      subtitle: 'Admin access is provisioned by the operator. Use your assigned credentials.',
    },
  };

  return (
    <AuthLayout title={titles[role].title} subtitle={titles[role].subtitle}>
      <RoleTabs value={role} onChange={changeRole} />

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Mobile number" hint="+91 · 10 digits">
          <Input
            value={mobile}
            onChange={(event) => setMobile(event.target.value.replace(/[^\d]/g, '').slice(0, 10))}
            placeholder="98765 43210"
            inputMode="numeric"
            autoComplete="tel"
            icon={<Phone size={17} />}
            disabled={busy}
          />
        </Field>

        <Field label="Password">
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            disabled={busy}
          />
        </Field>

        {error ? (
          <p className="rounded-2xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" block loading={busy} icon={<ArrowRight size={18} />}>
          Sign in
        </Button>
      </form>

      {role === 'admin' ? (
        <div className="mt-5 flex gap-2.5 rounded-2xl border border-line bg-white p-3.5 text-[12px] leading-relaxed text-muted">
          <Info size={16} className="mt-0.5 shrink-0 text-teal" />
          <p>
            There is no default admin password. An admin account is created once by the
            operator from the backend environment variables.
          </p>
        </div>
      ) : (
        <p className="mt-6 text-center text-[13px] text-muted">
          New to Amit?{' '}
          <Link
            to={`/register?role=${role}`}
            className="font-semibold text-ink underline decoration-mango decoration-2 underline-offset-4"
          >
            {role === 'rider' ? 'Register as a rider' : 'Create an account'}
          </Link>
        </p>
      )}

      <div className="mt-6 flex items-center justify-center gap-4 text-[11.5px] text-muted">
        <Link to="/" className="hover:text-ink">
          Back to home
        </Link>
        <span className="h-3 w-px bg-line" />
        <Link to={`/login?role=${role === 'customer' ? 'rider' : 'customer'}`} className="hover:text-ink">
          {role === 'customer' ? 'Rider access' : 'Customer access'}
        </Link>
      </div>
    </AuthLayout>
  );
}
