import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  Bike,
  Camera,
  ChevronRight,
  Download,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../../components/layout';
import NotificationsButton from '../../components/NotificationsButton';
import PlaceSearch from '../../components/PlaceSearch';
import {
  AuthImage,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Sheet,
  Spinner,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage, uploadFile } from '../../lib/api';
import { canInstall, isStandalone, promptInstall, subscribeInstall } from '../../lib/install';
import { enablePush, pushPermission } from '../../lib/push';
import { useQuery } from '../../lib/useQuery';
import { APP_NAME } from '../../config';
import type { Place, PublicConfig, SavedLocation, UserProfile } from '../../types';

export default function CustomerProfile() {
  const { user, mergeUser, logout } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [savedPick, setSavedPick] = useState<Place | null>(null);
  const [savedLabel, setSavedLabel] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const [installable, setInstallable] = useState(canInstall());

  const profileQuery = useQuery<{ id: string; stats: { rides: number; completed: number; active: number } }>(
    (signal) => api.get(`/customer/profile`, { signal }),
    [],
  );

  const savedQuery = useQuery<SavedLocation[]>(
    (signal) => api.get<SavedLocation[]>('/customer/saved-locations', { signal }),
    [],
  );

  const configQuery = useQuery<PublicConfig>(
    (signal) => api.get<PublicConfig>('/config', { auth: false, signal }),
    [],
  );

  useEffect(() => subscribeInstall(() => setInstallable(canInstall())), []);
  useEffect(() => setName(user?.name ?? ''), [user?.name]);

  const uploadPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Choose an image smaller than 5 MB.', 'Photo too large');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      const result = await api.patch<UserProfile>('/customer/profile', { photoUrl: uploaded.url });
      mergeUser({ photoUrl: result.photoUrl });
      toast.success('Profile photo updated.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not upload photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) {
      toast.warning('Enter your full name.');
      return;
    }
    setSavingName(true);
    try {
      const result = await api.patch<UserProfile>('/customer/profile', { name: name.trim() });
      mergeUser({ name: result.name });
      setEditOpen(false);
      toast.success('Your name was updated.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not update name');
    } finally {
      setSavingName(false);
    }
  };

  const addSavedLocation = async () => {
    if (!savedPick || savedLabel.trim().length < 1) return;
    setSavingPlace(true);
    try {
      await api.post('/customer/saved-locations', {
        label: savedLabel.trim().slice(0, 40),
        address: savedPick.address ?? null,
        lat: savedPick.lat,
        lng: savedPick.lng,
      });
      savedQuery.reload();
      setSavedPick(null);
      setSavedLabel('');
      toast.success('Saved place added.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not save place');
    } finally {
      setSavingPlace(false);
    }
  };

  const removeSaved = async (id: string) => {
    try {
      await api.delete(`/customer/saved-locations/${id}`);
      savedQuery.reload();
      toast.info('Saved place removed.');
    } catch (error) {
      toast.error(errorMessage(error), 'Could not remove place');
    }
  };

  const turnOnAlerts = async () => {
    const result = await enablePush();
    if (result.ok) toast.success(result.message, 'Notifications');
    else toast.warning(result.message, 'Notifications');
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) toast.success(`${APP_NAME} is installing on your device.`);
  };

  const supportPhone = configQuery.data?.app.supportPhone ?? null;
  const supportEmail = configQuery.data?.app.supportEmail ?? null;
  const stats = profileQuery.data?.stats;

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-24">
      <PageHeader
        title="Profile"
        subtitle="Account, saved places and app settings"
        right={<NotificationsButton />}
      />

      <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-3">
        <Card className="space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              {user?.photoUrl ? (
                <AuthImage
                  src={user.photoUrl}
                  alt={user.name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <Avatar name={user?.name ?? 'Flash'} size={64} />
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-mango text-ink"
              >
                {uploading ? <Spinner size={13} /> : <Camera size={13} />}
              </button>
              <input
                ref={fileRef}
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
                {user?.name ?? 'Customer'}
              </p>
              <p className="text-[12.5px] text-muted">+91 {user?.mobile ?? ''}</p>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal"
              >
                <Pencil size={12} /> Edit name
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Rides', value: stats?.rides ?? '—', icon: Bike },
              { label: 'Completed', value: stats?.completed ?? '—', icon: ShieldCheck },
              { label: 'Active', value: stats?.active ?? '—', icon: Star },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-cream px-3 py-2.5 text-center">
                <item.icon size={14} className="mx-auto text-teal" />
                <p className="mt-1 font-display text-[17px] font-semibold text-ink">{item.value}</p>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <SectionTitle
            title="Saved places"
            action={
              <button
                type="button"
                onClick={() => setSavedOpen(true)}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal"
              >
                <Plus size={13} /> Add
              </button>
            }
          />
          {savedQuery.loading && !savedQuery.data ? (
            <div className="flex justify-center py-4">
              <Spinner size={18} />
            </div>
          ) : savedQuery.data?.length ? (
            <ul className="divide-y divide-line/60">
              {savedQuery.data.map((place) => (
                <li key={place.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mango-100 text-[#8a5c00]">
                    <MapPin size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{place.label}</p>
                    {place.address ? (
                      <p className="truncate text-[11px] text-muted">{place.address}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSaved(place.id)}
                    aria-label={`Remove ${place.label}`}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-danger-100 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-cream px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
              Save home, work or the ferry ghat so booking takes one tap. Saved places appear in
              the search sheet.
            </p>
          )}
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
                  : 'Turn on ride and account alerts'}
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
                <span className="block text-[13px] font-semibold text-ink">Install {APP_NAME}</span>
                <span className="block text-[11px] text-muted">Add the app to your home screen</span>
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

          <a href="tel:112" className="flex items-center gap-3 px-4 py-3.5">
            <ShieldCheck size={17} className="text-teal" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">Safety</span>
              <span className="block text-[11px] text-muted">
                Share your ride code with family · emergency 112
              </span>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </a>
        </Card>

        <Card className="space-y-2.5">
          <div className="flex items-center gap-2">
            <HelpCircle size={16} className="text-teal" />
            <p className="text-[13px] font-semibold text-ink">Support</p>
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Missing road, wrong pin or a fare question? Contact the operator and include your ride
            code. Map data comes from OpenStreetMap and local corrections are welcome.
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

        <p className="pb-2 text-center text-[10.5px] leading-relaxed text-muted">
          <Link to="/about" className="hover:text-ink">About Flash</Link> ·{' '}
          {new Date().getFullYear()} · Map data © OpenStreetMap contributors
        </p>
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
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        title="Add a saved place"
        description="Pick a point, then give it a short name like Home or Work."
        footer={
          <Button
            block
            loading={savingPlace}
            disabled={!savedPick || !savedLabel.trim()}
            onClick={() => void addSavedLocation()}
          >
            Save place
          </Button>
        }
      >
        <div className="space-y-3">
          {savedPick ? (
            <div className="rounded-2xl bg-white px-3 py-2.5 text-[12px]">
              <p className="font-semibold text-ink">{savedPick.label}</p>
              <p className="text-[11px] text-muted">{savedPick.address}</p>
              <button
                type="button"
                onClick={() => setSavedPick(null)}
                className="mt-1 text-[11px] font-semibold text-teal"
              >
                Choose a different point
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSavedOpen(false);
                setPlaceSearchOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white py-3 text-[12.5px] font-semibold text-ink"
            >
              <MapPin size={15} className="text-teal" /> Search for a place
            </button>
          )}
          <Field label="Name" hint="Up to 40 characters">
            <Input
              value={savedLabel}
              onChange={(event) => setSavedLabel(event.target.value.slice(0, 40))}
              placeholder="Home"
            />
          </Field>
        </div>
      </Sheet>

      <PlaceSearch
        open={placeSearchOpen}
        onClose={() => setPlaceSearchOpen(false)}
        title="Choose a place"
        onSelect={(place) => {
          setSavedPick(place);
          setPlaceSearchOpen(false);
          setSavedOpen(true);
        }}
      />

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title={`Sign out of ${APP_NAME}?`}
        body="Your saved places and ride history stay on this account. You can sign back in with your mobile and password."
        confirmLabel="Sign out"
        tone="danger"
        onConfirm={logout}
      />
    </div>
  );
}
