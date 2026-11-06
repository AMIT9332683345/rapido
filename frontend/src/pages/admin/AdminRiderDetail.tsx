import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Bike,
  CircleAlert,
  FileWarning,
  Phone,
  ShieldOff,
  Star,
  Wallet,
  X,
} from 'lucide-react';
import {
  AuthImage,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FullPageLoader,
  SectionTitle,
  Sheet,
  StatusPill,
  Textarea,
  cn,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { dateTime, km, money, relativeTime } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import type { AdminRiderDetail, RiderDocument, RiderStatus } from '../../types';

export default function AdminRiderDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const query = useQuery<AdminRiderDetail>(
    (signal) => api.get<AdminRiderDetail>(`/admin/riders/${id}`, { signal }),
    [id],
  );

  const [statusTarget, setStatusTarget] = useState<'approved' | 'rejected' | 'suspended' | null>(null);
  const [reason, setReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const [docTarget, setDocTarget] = useState<{ doc: RiderDocument; status: 'approved' | 'rejected' } | null>(
    null,
  );
  const [docNote, setDocNote] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  const detail = query.data;

  const applyStatus = async () => {
    if (!statusTarget) return;
    if (statusTarget !== 'approved' && !reason.trim()) {
      toast.warning('Add a short reason so the rider knows what to fix.');
      return;
    }
    setSavingStatus(true);
    try {
      await api.patch(`/admin/riders/${id}/status`, {
        status: statusTarget,
        reason: statusTarget === 'approved' ? undefined : reason.trim(),
      });
      query.reload();
      setStatusTarget(null);
      setReason('');
      toast.success(`Rider marked ${statusTarget}.`);
    } catch (error) {
      toast.error(errorMessage(error), 'Could not update rider');
    } finally {
      setSavingStatus(false);
    }
  };

  const applyDocument = async () => {
    if (!docTarget) return;
    setSavingDoc(true);
    try {
      await api.patch(`/admin/riders/${id}/documents/${docTarget.doc.id}`, {
        status: docTarget.status,
        note: docNote.trim() || undefined,
      });
      query.reload();
      setDocTarget(null);
      setDocNote('');
      toast.success(`Document ${docTarget.status}.`);
    } catch (error) {
      toast.error(errorMessage(error), 'Could not review document');
    } finally {
      setSavingDoc(false);
    }
  };

  if (query.loading && !detail) {
    return <FullPageLoader label="Loading rider…" />;
  }

  if (query.error || !detail) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<CircleAlert size={22} />}
          title="Rider not found"
          body={query.error ?? 'This rider may have been removed.'}
          action={
            <Button variant="outline" onClick={() => navigate('/admin/riders')}>
              Back to riders
            </Button>
          }
        />
      </div>
    );
  }

  const { rider, vehicle, documents, recentRides } = detail;
  const statusTone: Record<RiderStatus, 'mango' | 'success' | 'danger'> = {
    pending: 'mango',
    approved: 'success',
    rejected: 'danger',
    suspended: 'danger',
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <button
        type="button"
        onClick={() => navigate('/admin/riders')}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> All riders
      </button>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={rider.name} photoUrl={rider.photoUrl} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
                    {rider.name}
                  </h1>
                  <Badge tone={statusTone[rider.status]}>{rider.status}</Badge>
                  <Badge tone={rider.isOnline ? 'teal' : 'muted'}>
                    {rider.isOnline ? 'online' : 'offline'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  +91 {rider.mobile} · joined {dateTime(rider.createdAt)}
                </p>
              </div>
              <a
                href={`tel:${rider.mobile}`}
                className="grid h-10 w-10 place-items-center rounded-full bg-success text-white"
                aria-label={`Call ${rider.name}`}
              >
                <Phone size={17} />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Rating
                </p>
                <p className="mt-0.5 flex items-center gap-1 font-display text-[17px] font-semibold text-ink">
                  <Star size={13} className="fill-mango text-mango" />
                  {rider.rating.toFixed(1)}
                </p>
              </div>
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Rides
                </p>
                <p className="mt-0.5 font-display text-[17px] font-semibold text-ink">
                  {rider.totalRides}
                </p>
              </div>
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Bookings
                </p>
                <p className="mt-0.5 font-display text-[17px] font-semibold text-ink">
                  {detail.totalBookings}
                </p>
              </div>
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Earnings
                </p>
                <p className="mt-0.5 font-display text-[17px] font-semibold text-ink">
                  {money(rider.totalEarnings)}
                </p>
              </div>
            </div>

            {rider.lastLocationAt ? (
              <p className="text-[10.5px] text-muted">
                Last GPS ping {relativeTime(rider.lastLocationAt)}
                {rider.location
                  ? ` · ${rider.location.lat.toFixed(4)}, ${rider.location.lng.toFixed(4)}`
                  : ''}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {rider.status !== 'approved' ? (
                <Button
                  onClick={() => setStatusTarget('approved')}
                  icon={<BadgeCheck size={16} />}
                >
                  Approve rider
                </Button>
              ) : null}
              {rider.status !== 'rejected' ? (
                <Button
                  variant="outline"
                  onClick={() => setStatusTarget('rejected')}
                  icon={<FileWarning size={16} />}
                >
                  Reject
                </Button>
              ) : null}
              {rider.status !== 'suspended' ? (
                <Button
                  variant="danger"
                  onClick={() => setStatusTarget('suspended')}
                  icon={<ShieldOff size={16} />}
                >
                  Suspend
                </Button>
              ) : null}
              {rider.currentBooking ? (
                <Link to={`/admin/bookings/${rider.currentBooking}`}>
                  <Button variant="soft">View active ride</Button>
                </Link>
              ) : null}
            </div>

            {rider.rejectionReason ? (
              <p className="rounded-2xl bg-danger-100 px-3 py-2.5 text-[11.5px] text-danger">
                Rejection reason: {rider.rejectionReason}
              </p>
            ) : null}
            {rider.suspendedReason ? (
              <p className="rounded-2xl bg-danger-100 px-3 py-2.5 text-[11.5px] text-danger">
                Suspension reason: {rider.suspendedReason}
              </p>
            ) : null}
          </Card>

          <Card className="space-y-3">
            <SectionTitle title="Documents" action={<Badge tone="muted">{documents.length}</Badge>} />
            {documents.length ? (
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-line/70 p-2.5">
                    <div className="flex items-start gap-3">
                      <AuthImage
                        src={doc.frontUrl}
                        alt={`${doc.kind} front`}
                        className="h-20 w-28 shrink-0 rounded-xl object-cover"
                      />
                      {doc.backUrl ? (
                        <AuthImage
                          src={doc.backUrl}
                          alt={`${doc.kind} back`}
                          className="hidden h-20 w-28 shrink-0 rounded-xl object-cover sm:block"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[12.5px] font-semibold capitalize text-ink">
                            {doc.kind === 'rc' ? 'Registration certificate' : doc.kind}
                          </p>
                          <Badge
                            tone={
                              doc.status === 'approved'
                                ? 'success'
                                : doc.status === 'pending'
                                  ? 'mango'
                                  : 'danger'
                            }
                          >
                            {doc.status}
                          </Badge>
                        </div>
                        {doc.number ? (
                          <p className="mt-0.5 text-[11px] text-muted">No. {doc.number}</p>
                        ) : null}
                        <p className="text-[10.5px] text-muted">
                          Updated {relativeTime(doc.updatedAt)}
                        </p>
                        {doc.note ? (
                          <p className="mt-1 text-[10.5px] text-danger">Note: {doc.note}</p>
                        ) : null}
                        <div className="mt-2 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDocTarget({ doc, status: 'approved' });
                              setDocNote('');
                            }}
                            className="rounded-full bg-success-100 px-2.5 py-1 text-[10.5px] font-semibold text-success"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDocTarget({ doc, status: 'rejected' });
                              setDocNote('');
                            }}
                            className="rounded-full bg-danger-100 px-2.5 py-1 text-[10.5px] font-semibold text-danger"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-cream px-3 py-2.5 text-[11.5px] text-muted">
                This rider has not uploaded any documents yet.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="space-y-3">
            <SectionTitle title="Vehicle" />
            {vehicle ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-cream text-teal">
                    <Bike size={20} />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      {vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-[11px] text-muted">
                      {vehicle.type === 'scooter' ? 'Scooter' : 'Motorcycle'}
                      {vehicle.color ? ` · ${vehicle.color}` : ''}
                      {vehicle.year ? ` · ${vehicle.year}` : ''}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-ink px-3 py-2 text-center font-mono text-[12px] font-semibold tracking-wide text-cream">
                  {vehicle.registrationNumber}
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-muted">No vehicle on file.</p>
            )}
          </Card>

          <Card className="space-y-3">
            <SectionTitle title="Recent rides" action={<Badge tone="muted">{recentRides.length}</Badge>} />
            {recentRides.length ? (
              <ul className="divide-y divide-line/60">
                {recentRides.map((ride) => (
                  <li key={ride.id} className="py-2.5">
                    <Link to={`/admin/bookings/${ride.id}`} className="block">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-semibold text-teal">
                          {ride.code}
                        </span>
                        <StatusPill status={ride.status} />
                      </div>
                      <p className="mt-1 truncate text-[11.5px] font-medium text-ink">
                        {ride.pickup.label} → {ride.destination.label}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted">
                        <span>{relativeTime(ride.createdAt)}</span>
                        <span>
                          {km(ride.route.distanceMeters)} · {money(ride.fare.total)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-muted">No rides assigned yet.</p>
            )}
          </Card>

          <Card className="space-y-2">
            <SectionTitle title="Operator notes" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Approving a rider enables them to go online immediately. Suspending an account while a
              ride is active is blocked by the server — cancel or complete the ride first.
            </p>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-[10.5px] font-semibold text-muted">
              <Wallet size={11} /> Rider ID {rider.id.slice(-6)}
            </p>
          </Card>
        </div>
      </div>

      <Sheet
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title={
          statusTarget === 'approved'
            ? 'Approve this rider?'
            : statusTarget === 'rejected'
              ? 'Reject this rider'
              : 'Suspend this rider'
        }
        description={
          statusTarget === 'approved'
            ? 'They will be able to go online and accept rides right away.'
            : statusTarget === 'rejected'
              ? 'They can re-upload documents, which moves them back to pending review.'
              : 'Their account is disabled and they cannot go online. The reason is shown to them.'
        }
        footer={
          <Button
            block
            variant={statusTarget === 'approved' ? 'primary' : 'danger'}
            loading={savingStatus}
            onClick={() => void applyStatus()}
          >
            {statusTarget === 'approved' ? 'Approve rider' : `Mark ${statusTarget}`}
          </Button>
        }
      >
        {statusTarget !== 'approved' ? (
          <Field label="Reason" hint="Shown to the rider">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 300))}
              placeholder="For example: RC photo is unreadable, please upload a clearer copy."
            />
          </Field>
        ) : (
          <p className="rounded-2xl bg-cream px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            Confirm that the licence, Aadhaar and RC belong to this rider and the vehicle matches the
            registration number.
          </p>
        )}
      </Sheet>

      <Sheet
        open={docTarget !== null}
        onClose={() => setDocTarget(null)}
        title={
          docTarget?.status === 'approved'
            ? `Approve ${docTarget?.doc.kind}`
            : `Reject ${docTarget?.doc.kind}`
        }
        footer={
          <Button
            block
            variant={docTarget?.status === 'approved' ? 'primary' : 'danger'}
            loading={savingDoc}
            onClick={() => void applyDocument()}
          >
            Confirm {docTarget?.status}
          </Button>
        }
      >
        <div className="space-y-3">
          {docTarget ? (
            <div className="rounded-2xl bg-white p-2.5">
              <AuthImage
                src={docTarget.doc.frontUrl}
                alt={`${docTarget.doc.kind} preview`}
                className="max-h-64 w-full rounded-xl object-contain"
              />
            </div>
          ) : null}
          <Field label="Note" hint="Optional. Required context helps the rider fix issues.">
            <Textarea
              value={docNote}
              onChange={(event) => setDocNote(event.target.value.slice(0, 300))}
              placeholder={
                docTarget?.status === 'rejected'
                  ? 'What needs to change?'
                  : 'Anything to note for the file?'
              }
            />
          </Field>
          <p
            className={cn(
              'rounded-2xl px-3 py-2.5 text-[11.5px] leading-relaxed',
              docTarget?.status === 'approved'
                ? 'bg-success-100 text-success'
                : 'bg-danger-100 text-danger',
            )}
          >
            {docTarget?.status === 'approved'
              ? 'Approving a document notifies the rider. Account approval is a separate step.'
              : 'Rejecting a document notifies the rider with your note.'}
          </p>
          <button
            type="button"
            onClick={() => setDocTarget(null)}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted"
          >
            <X size={12} /> Cancel
          </button>
        </div>
      </Sheet>
    </div>
  );
}
