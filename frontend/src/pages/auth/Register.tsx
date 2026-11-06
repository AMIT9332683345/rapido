import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bike, Info, Lock, Phone, UserRound } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { RoleTabs } from './RoleTabs';
import { Button, Field, Input, PasswordInput, Select } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/api';
import { homeForRole } from '../../lib/session';
import type { Role } from '../../types';

type RegisterRole = 'customer' | 'rider';

export default function Register() {
  const [params, setParams] = useSearchParams();
  const role: RegisterRole = params.get('role') === 'rider' ? 'rider' : 'customer';
  const { session, registerCustomer, registerRider } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [vehicleType, setVehicleType] = useState<'bike' | 'scooter'>('bike');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicleYears = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 26 }, (_, index) => current - index);
  }, []);

  if (session) {
    return <Navigate to={homeForRole(session.role)} replace />;
  }

  const changeRole = (value: Role) => {
    if (value === 'admin') return;
    const updated = new URLSearchParams(params);
    updated.set('role', value);
    setParams(updated, { replace: true });
    setError(null);
  };

  const validate = (): string | null => {
    if (name.trim().length < 2) return 'Enter your full name.';
    if (mobile.replace(/\D/g, '').length !== 10) return 'Enter a valid 10 digit Indian mobile number.';
    if (password.length < 8) return 'Use a password with at least 8 characters.';
    if (password !== confirm) return 'Those passwords do not match.';
    if (role === 'rider') {
      if (!make.trim()) return 'Enter your vehicle make, for example Honda.';
      if (!model.trim()) return 'Enter your vehicle model.';
      if (!/^[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{0,3}[-\s]?\d{1,4}$/i.test(registrationNumber.trim())) {
        return 'Enter a valid vehicle registration number, for example WB-49-AB-1234.';
      }
    }
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (role === 'rider') {
        const result = await registerRider({
          name: name.trim(),
          mobile: mobile.replace(/\D/g, ''),
          password,
          vehicle: {
            type: vehicleType,
            make: make.trim(),
            model: model.trim(),
            registrationNumber: registrationNumber.trim().toUpperCase(),
            color: color.trim() || null,
            year: year ? Number(year) : null,
          },
        });
        toast.success('Account created. Upload your documents for approval.', 'Welcome');
        navigate(homeForRole(result.role), { replace: true });
      } else {
        const result = await registerCustomer({
          name: name.trim(),
          mobile: mobile.replace(/\D/g, ''),
          password,
        });
        toast.success(`Welcome to Amit, ${result.user.name.split(' ')[0]}.`);
        navigate(homeForRole(result.role), { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={role === 'rider' ? 'Become a rider' : 'Create your account'}
      subtitle={
        role === 'rider'
          ? 'Tell us about you and your bike. An admin verifies your documents before your first trip.'
          : 'One account for booking, tracking and keeping every receipt in one place.'
      }
    >
      <RoleTabs value={role} onChange={changeRole} allowed={['customer', 'rider']} />

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Field label="Full name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Amit Mondal"
            autoComplete="name"
            icon={<UserRound size={17} />}
            disabled={busy}
          />
        </Field>

        <Field label="Mobile number" hint="+91 · 10 digits" required>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" hint="At least 8 characters" required>
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              autoComplete="new-password"
              disabled={busy}
            />
          </Field>
          <Field label="Confirm password" required>
            <PasswordInput
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              disabled={busy}
            />
          </Field>
        </div>

        {role === 'rider' ? (
          <div className="space-y-4 rounded-3xl border border-line bg-white/70 p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-mango-100 text-[#8a5c00]">
                <Bike size={17} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink">Your vehicle</p>
                <p className="text-[11.5px] text-muted">This is what customers see when you arrive.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vehicle type" required>
                <Select
                  value={vehicleType}
                  onChange={(event) => setVehicleType(event.target.value as 'bike' | 'scooter')}
                  disabled={busy}
                >
                  <option value="bike">Motorcycle</option>
                  <option value="scooter">Scooter</option>
                </Select>
              </Field>
              <Field label="Registration number" required>
                <Input
                  value={registrationNumber}
                  onChange={(event) =>
                    setRegistrationNumber(event.target.value.toUpperCase().slice(0, 16))
                  }
                  placeholder="WB-49-AB-1234"
                  autoCapitalize="characters"
                  disabled={busy}
                />
              </Field>
              <Field label="Make" required>
                <Input
                  value={make}
                  onChange={(event) => setMake(event.target.value)}
                  placeholder="Hero, Honda, TVS"
                  disabled={busy}
                />
              </Field>
              <Field label="Model" required>
                <Input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="Splendor Plus"
                  disabled={busy}
                />
              </Field>
              <Field label="Colour">
                <Input
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  placeholder="Black"
                  disabled={busy}
                />
              </Field>
              <Field label="Year">
                <Select
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Not sure</option>
                  {vehicleYears.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex gap-2.5 rounded-2xl bg-cream px-3.5 py-3 text-[12px] leading-relaxed text-muted">
              <Info size={16} className="mt-0.5 shrink-0 text-teal" />
              <p>
                After registering, upload your licence, Aadhaar and RC from the rider profile.
                You can only go online once an admin approves them.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-danger-100 px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" block loading={busy} icon={<ArrowRight size={18} />}>
          {role === 'rider' ? 'Create rider account' : 'Create account'}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
          <Lock size={12} />
          Passwords are hashed with bcrypt. We never store them in plain text.
        </p>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        Already registered?{' '}
        <Link
          to={`/login?role=${role}`}
          className="font-semibold text-ink underline decoration-mango decoration-2 underline-offset-4"
        >
          Sign in
        </Link>
      </p>

      <div className="mt-6 flex items-center justify-center gap-4 text-[11.5px] text-muted">
        <Link to="/" className="hover:text-ink">
          Back to home
        </Link>
        <span className="h-3 w-px bg-line" />
        <Link
          to={`/register?role=${role === 'customer' ? 'rider' : 'customer'}`}
          className="hover:text-ink"
        >
          {role === 'customer' ? 'Register as a rider' : 'Create a customer account'}
        </Link>
      </div>
    </AuthLayout>
  );
}
