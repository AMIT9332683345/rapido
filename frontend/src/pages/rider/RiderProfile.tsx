import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  BellRing,
  Bike,
  Camera,
  ChevronRight,
  Download,
  FileBadge,
  FileText,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Smartphone,
  Upload,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/layout';
import NotificationsButton from '../../components/NotificationsButton';
import {
  AuthImage,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FullPageLoader,
  Input,
  SectionTitle,
  Select,
  Sheet,
  Spinner,
  cn,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage, uploadFile } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { getPosition } from '../../lib/geolocation';
import { canInstall, isStandalone, promptInstall, subscribeInstall } from '../../lib/install';
import { enablePush, pushPermission } from '../../lib/push';
import { useQuery } from '../../lib/useQuery';
import type {
  DocumentKind,
  PublicConfig,
  RiderDocument,
  RiderStatus,
  UserProfile,
  Vehicle,
} from '../../types';

interface RiderProfileData {
  id: string;
  name: string;
  mobile: string;
  photoUrl: string | null;
  status: RiderStatus;
  rejectionReason: string | null;
  suspendedReason: string | null;
  isOnline: boolean;
  rating: number;
  ratingCount: number;
  totalRides: number;
  totalEarnings: number;
  currentBooking: string | null;
  vehicle: Vehicle | null;
  documents: RiderDocument[];
}

const DOC_META: { kind: DocumentKind; label: string; hint: string }[] = [
  { kind: 'licence', label: 'Driving licence', hint: 'Front side, clearly readable' },
  { kind: 'aadhaar', label: 'Aadhaar', hint: 'Front and back if available' },
  { kind: 'rc', label: 'Registration certificate', hint: 'RC for the bike you ride' },
  { kind: 'insurance', label: 'Insurance', hint: 'Optional but recommended' },
  { kind: 'permit', label: 'Permit', hint: 'If your vehicle requires one' },
  { kind: 'other', label: 'Other document', hint: 'Anything support asked for' },
];

function statusTone(status: RiderDocument['status']): 'success' | 'mango' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'mango';
  return 'danger';
}

export default function RiderProfile() {
  const { user, mergeUser, logout } = useAuth();
  const toast = useToast();
  const photoRef = useRef<HTMLInputElement>(null);
  const docFrontRef = useRef<HTMLInputElement>(null);
  const docBackRef = useRef<HTMLInputElement>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [installable, setInstallable] = useState(canInstall());
  const [toggling, setToggling] = useState(false);

  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState<'bike' | 'scooter'>('bike');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);

  const [docOpen, setDocOpen] = useState(false);
  const [docKind, setDocKind] = useState<DocumentKind>('licence');
  const [docNumber, setDocNumber] = useState('');
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);

  const query = useQuery<RiderProfileData>(
    (signal) => api.get<RiderProfileData>('/rider/profile', { signal }),
    [],
  );
  const profile = query.data;

  const configQuery = useQuery<PublicConfig>(
    (signal) => api.get<PublicConfig>('/config', { auth: false, signal }),
    [],
  );

  useEffect(() => subscribeInstall(() => setInstallable(canInstall())), []);
  useEffect(() => setName(profile?.name ?? ''), [profile?.name]);

  const openVehicle = () => {
    if (!profile) return;
    setVehicleType(profile.vehicle?.type ?? 'bike');
    setMake(profile.vehicle?.make ?? '');
    setModel(profile.vehicle?.model ?? '');
    setRegistrationNumber(profile.vehicle?.registrationNumber ?? '');
    setColor(profile.vehicle?.color ?? '');
    setYear(profile.vehicle?.year ? String(profile.vehicle.year) : '');
    setVehicleOpen(true);
  };

  const saveVehicle = async () => {
    if (!make.trim() || !model.trim() || !registrationNumber.trim()) {
      toast.warning('Make, model and registration number are required.');
      return;
    }
    setSavingVehicle(true);
    try {
      await api.put('/rider/vehicle', {
        type: vehicleType,
        make: make.trim(),
        model: model.trim(),
        registrationNumber: registrationNumber.trim(),
        color: color.trim() || null,
        year: year ? Number(year) : null,
      });
      query.reload();
      setVehicleOpen(false);
      toast.success('Vehicle details saved.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not save vehicle');
    } finally {
      setSavingVehicle(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Choose an image smaller than 5 MB.', 'Photo too large');
      return;
    }
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadFile(file);
      const result = await api.patch<UserProfile>('/rider/profile', { photoUrl: uploaded.url });
      mergeUser({ photoUrl: result.photoUrl });
      query.reload();
      toast.success('Profile photo updated.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not upload photo');
    } finally {
      setUploadingPhoto(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) {
      toast.warning('Enter your full name.');
      return;
    }
    setSavingName(true);
    try {
      await api.patch('/rider/profile', { name: name.trim() });
      mergeUser({ name: name.trim() });
      query.reload();
      setEditOpen(false);
      toast.success('Name updated.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not update name');
    } finally {
      setSavingName(false);
    }
  };

  const openDocument = (kind?: DocumentKind) => {
    setDocKind(kind ?? 'licence');
    setDocNumber('');
    setFrontFile(null);
    setBackFile(null);
    setDocOpen(true);
  };

  const saveDocument = async () => {
    if (!frontFile) {
      toast.warning('Choose the front image of the document.');
      return;
    }
    setSavingDoc(true);
    try {
      const front = await uploadFile(frontFile);
      const back = backFile ? await uploadFile(backFile) : null;
      await api.post('/rider/documents', {
        kind: docKind,
        number: docNumber.trim() || null,
        frontUrl: front.url,
        backUrl: back?.url ?? null,
      });
      query.reload();
      setDocOpen(false);
      toast.success('Document uploaded. An admin will review it.', 'Submitted');
    } catch (error) {
      toast.error(errorMessage(error), 'Upload failed');
    } finally {
      setSavingDoc(false);
    }
  };

  const toggleAvailability = async () => {
    if (!profile) return;
    if (profile.status !== 'approved') {
      toast.warning('Your account must be approved first.');
      return;
    }
    setToggling(true);
    try {
      let location;
      if (!profile.isOnline) {
        const coords = await getPosition();
        location = { lat: coords.lat, lng: coords.lng };
      }
      await api.patch('/rider/availability', { isOnline: !profile.isOnline, location });
      query.reload();
      mergeUser({ isOnline: !profile.isOnline });
      toast.success(profile.isOnline ? 'You are offline.' : 'You are online.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not change availability');
    } finally {
      setToggling(false);
    }
  };

  const turnOnAlerts = async () => {
    const result = await enablePush();
    if (result.ok) toast.success(result.message, 'Notifications');
    else toast.warning(result.message, 'Notifications');
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) toast.success('Amit is installing on your device.');
  };

  if (query.loading && !profile) {
    return (
      <div className="grid h-full place-items-center">
        <FullPageLoader label="Loading your profile…" />
      </div>
    );
  }

  if (query.error || !profile) {
    return (
      <div className="grid h-full place-items-center px-5">
        <EmptyState
          icon={<FileText size={22} />}
          title="Profile unavailable"
          body={query.error ?? 'Try signing in again.'}
          action={
            <Button variant="outline" onClick={query.reload}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const supportPhone = configQuery.data?.app.supportPhone ?? null;
  const supportEmail = configQuery.data?.app.supportEmail ?? null;

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-24">
      <PageHeader
        title="Rider profile"
        subtitle="Documents, vehicle and app settings"
        right={<NotificationsButton />}
      />

      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-3">
        <Card className="space-y-3">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              {profile.photoUrl ? (
                <AuthImage
                  src={profile.photoUrl}
                  alt={profile.name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <Avatar name={profile.name} size={64} />
              )}
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-mango text-ink"
              >
                {uploadingPhoto ? <Spinner size={13} /> : <Camera size={13} />}
              </button>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[19px] font-semibold text-ink">
                {profile.name}
              </p>
              <p className="text-[12.5px] text-muted">+91 {profile.mobile}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge
                  tone={
                    profile.status === 'approved'
                      ? 'success'
                      : profile.status === 'pending'
                        ? 'mango'
                        : 'danger'
                  }
                >
                  <ShieldCheck size={10} /> {profile.status}
                </Badge>
                <Badge tone={profile.isOnline ? 'teal' : 'muted'}>
                  {profile.isOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit name"
              className="grid h-9 w-9 place-items-center rounded-full bg-cream text-muted"
            >
              <Pencil size={15} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-cream px-3 py-2.5 text-center">
              <p className="font-display text-[17px] font-semibold text-ink">
                {profile.rating.toFixed(1)}
              </p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                Rating
              </p>
            </div>
            <div className="rounded-2xl bg-cream px-3 py-2.5 text-center">
              <p className="font-display text-[17px] font-semibold text-ink">{profile.totalRides}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                Rides
              </p>
            </div>
            <div className="rounded-2xl bg-cream px-3 py-2.5 text-center">
              <p className="font-display text-[17px] font-semibold text-ink">
                ₹{Math.round(profile.totalEarnings)}
              </p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                Earned
              </p>
            </div>
          </div>

          {profile.status === 'rejected' && profile.rejectionReason ? (
            <p className="rounded-2xl bg-danger-100 px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              {profile.rejectionReason}
            </p>
          ) : null}
          {profile.status === 'suspended' && profile.suspendedReason ? (
            <p className="rounded-2xl bg-danger-100 px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              {profile.suspendedReason}
            </p>
          ) : null}

          <Button
            variant={profile.isOnline ? 'outline' : 'ink'}
            block
            loading={toggling}
            onClick={() => void toggleAvailability()}
          >
            {profile.isOnline ? 'Go offline' : 'Go online'}
          </Button>
        </Card>

        <Card className="space-y-3">
          <SectionTitle
            title="Vehicle"
            action={
              <button
                type="button"
                onClick={openVehicle}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal"
              >
                <Pencil size={12} /> Edit
              </button>
            }
          />
          {profile.vehicle ? (
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-cream text-teal">
                <Bike size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">
                  {profile.vehicle.make} {profile.vehicle.model}
                </p>
                <p className="text-[11.5px] text-muted">
                  {profile.vehicle.type === 'scooter' ? 'Scooter' : 'Motorcycle'}
                  {profile.vehicle.color ? ` · ${profile.vehicle.color}` : ''}
                  {profile.vehicle.year ? ` · ${profile.vehicle.year}` : ''}
                </p>
              </div>
              <span className="rounded-lg bg-ink px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-cream">
                {profile.vehicle.registrationNumber}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={openVehicle}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white py-4 text-[12.5px] font-semibold text-ink"
            >
              <Plus size={15} className="text-teal" /> Add your vehicle
            </button>
          )}
        </Card>

        <Card className="space-y-3">
          <SectionTitle
            title="Documents"
            action={
              <button
                type="button"
                onClick={() => openDocument()}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal"
              >
                <Upload size={12} /> Upload
              </button>
            }
          />
          <p className="text-[11.5px] leading-relaxed text-muted">
            Documents are private. Only you and the reviewing admin can open them. Re-uploading a
            rejected document automatically returns your account to review.
          </p>
          {profile.documents.length ? (
            <div className="space-y-2">
              {profile.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-2xl border border-line/70 bg-white p-2.5"
                >
                  <AuthImage
                    src={doc.frontUrl}
                    alt={`${doc.kind} document`}
                    className="h-14 w-20 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold capitalize text-ink">
                      {doc.kind === 'rc' ? 'Registration certificate' : doc.kind}
                    </p>
                    <p className="text-[10.5px] text-muted">
                      {doc.number ? `${doc.number} · ` : ''}
                      {doc.updatedAt ? shortDate(doc.updatedAt) : ''}
                    </p>
                    {doc.note ? (
                      <p className="mt-0.5 text-[10.5px] leading-snug text-danger">{doc.note}</p>
                    ) : null}
                  </div>
                  <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-cream px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
              Upload your licence, Aadhaar and RC to start the approval process.
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {DOC_META.slice(0, 3).map((doc) => (
              <button
                key={doc.kind}
                type="button"
                onClick={() => openDocument(doc.kind)}
                className={cn(
                  'rounded-xl border px-2 py-2 text-[10.5px] font-semibold',
                  profile.documents.some((item) => item.kind === doc.kind)
                    ? 'border-line bg-white text-muted'
                    : 'border-mango/50 bg-mango-100 text-[#7a5200]',
                )}
              >
                {doc.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </Card>

        <Card className="divide-y divide-line/60 p-0">
          <button
            type="button"
            onClick={() => void turnOnAlerts()}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
          >
            <BellRing size={17} className="text-teal" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">Notifications</span>
              <span className="block text-[11px] text-muted">
                {pushPermission() === 'granted'
                  ? 'Alerts are allowed on this device'
                  : 'Turn on new request and account alerts'}
              </span>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>

          {!isStandalone() && installable ? (
            <button
              type="button"
              onClick={() => void install()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <Download size={17} className="text-teal" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">Install Amit</span>
                <span className="block text-[11px] text-muted">Add the rider app to your home screen</span>
              </span>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Smartphone size={17} className="text-teal" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">Installed app</span>
                <span className="block text-[11px] text-muted">
                  {isStandalone()
                    ? 'Running as an installed app'
                    : 'Use your browser menu → Add to home screen'}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 px-4 py-3.5">
            <ShieldCheck size={17} className="text-teal" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">Safety guidelines</span>
              <span className="block text-[11px] leading-snug text-muted">
                Helmet for both, no night trips outside the service area, call support for issues.
              </span>
            </span>
          </div>
        </Card>

        <Card className="space-y-2.5">
          <p className="text-[13px] font-semibold text-ink">Rider support</p>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Document rejected, account suspended, or a fare dispute? Contact the operator with your
            rider mobile number.
          </p>
          <div className="flex flex-wrap gap-2">
            {supportPhone ? (
              <a
                href={`tel:${supportPhone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-2 text-[11.5px] font-semibold text-ink"
              >
                <Phone size={13} /> {supportPhone}
              </a>
            ) : null}
            {supportEmail ? (
              <a
                href={`mailto:${supportEmail}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-2 text-[11.5px] font-semibold text-ink"
              >
                <Mail size={13} /> {supportEmail}
              </a>
            ) : null}
          </div>
        </Card>

        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3 text-[13px] font-semibold text-danger"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit your name"
        footer={
          <Button block loading={savingName} onClick={() => void saveName()}>
            Save name
          </Button>
        }
      >
        <Field label="Full name">
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
      </Sheet>

      <Sheet
        open={vehicleOpen}
        onClose={() => setVehicleOpen(false)}
        title="Vehicle details"
        description="Keep this accurate — customers see your bike number at pickup."
        footer={
          <Button block loading={savingVehicle} onClick={() => void saveVehicle()}>
            Save vehicle
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required>
            <Select
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value as 'bike' | 'scooter')}
            >
              <option value="bike">Motorcycle</option>
              <option value="scooter">Scooter</option>
            </Select>
          </Field>
          <Field label="Registration" required>
            <Input
              value={registrationNumber}
              onChange={(event) => setRegistrationNumber(event.target.value.toUpperCase().slice(0, 16))}
              placeholder="WB-49-AB-1234"
            />
          </Field>
          <Field label="Make" required>
            <Input value={make} onChange={(event) => setMake(event.target.value)} placeholder="Honda" />
          </Field>
          <Field label="Model" required>
            <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Shine" />
          </Field>
          <Field label="Colour">
            <Input value={color} onChange={(event) => setColor(event.target.value)} placeholder="Black" />
          </Field>
          <Field label="Year">
            <Input
              value={year}
              onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="2021"
              inputMode="numeric"
            />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="Upload document"
        description="Choose a clear photo or PDF. Admin review usually happens the same day."
        footer={
          <Button block loading={savingDoc} onClick={() => void saveDocument()}>
            Submit for review
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Document type" required>
            <Select value={docKind} onChange={(event) => setDocKind(event.target.value as DocumentKind)}>
              {DOC_META.map((doc) => (
                <option key={doc.kind} value={doc.kind}>
                  {doc.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Document number" hint="Optional, but speeds up review">
            <Input
              value={docNumber}
              onChange={(event) => setDocNumber(event.target.value.slice(0, 40))}
              placeholder="Licence or Aadhaar number"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => docFrontRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line bg-white px-3 py-4 text-[11.5px] font-semibold text-ink"
            >
              <FileBadge size={20} className="text-teal" />
              {frontFile ? frontFile.name.slice(0, 18) : 'Front image'}
            </button>
            <button
              type="button"
              onClick={() => docBackRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line bg-white px-3 py-4 text-[11.5px] font-semibold text-ink"
            >
              <FileBadge size={20} className="text-muted" />
              {backFile ? backFile.name.slice(0, 18) : 'Back image (optional)'}
            </button>
          </div>
          <input
            ref={docFrontRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => setFrontFile(event.target.files?.[0] ?? null)}
          />
          <input
            ref={docBackRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => setBackFile(event.target.files?.[0] ?? null)}
          />

          <p className="rounded-2xl bg-cream-200/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            Documents are stored on the server and served only to you and admins. Never send
            document photos over chat.
          </p>
        </div>
      </Sheet>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Sign out of Amit?"
        body="If you are online you will stop receiving requests. Sign back in with your mobile and password."
        confirmLabel="Sign out"
        tone="danger"
        onConfirm={logout}
      />
    </div>
  );
}
