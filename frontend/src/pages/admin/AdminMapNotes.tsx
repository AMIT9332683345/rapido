import { useMemo, useState } from 'react';
import {
  Crosshair,
  Info,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  FullPageLoader,
  IconButton,
  Input,
  SectionTitle,
  Select,
  Switch,
  Textarea,
} from '../../components/ui';
import MapView, { type MapMarker } from '../../components/MapView';
import { api, errorMessage } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_CENTER } from '../../config';
import type { LatLng, MapNote, MapNoteType } from '../../types';

const TYPE_LABEL: Record<MapNoteType, string> = {
  landmark: 'Landmark',
  road: 'Road',
  closure: 'Closure',
  other: 'Other',
};

const TYPE_TONE: Record<MapNoteType, 'teal' | 'mango' | 'danger' | 'muted'> = {
  landmark: 'teal',
  road: 'mango',
  closure: 'danger',
  other: 'muted',
};

const TYPE_OPTIONS: MapNoteType[] = ['landmark', 'road', 'closure', 'other'];

export default function AdminMapNotes() {
  const toast = useToast();
  const query = useQuery<{ notes: MapNote[] }>(
    (signal) => api.get<{ notes: MapNote[] }>('/admin/map-notes', { signal }),
    [],
  );

  const notes = query.data?.notes ?? [];

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MapNoteType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<MapNoteType>('landmark');
  const [active, setActive] = useState(true);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MapNote | null>(null);
  const [removing, setRemoving] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return notes.filter((note) => {
      if (typeFilter !== 'all' && note.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        note.label.toLowerCase().includes(needle) ||
        (note.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [notes, search, typeFilter]);

  const markers = useMemo(() => {
    const list: MapMarker[] = notes
      .filter((note) => note.isActive && note.id !== editingId)
      .map((note) => ({
        id: note.id,
        kind: 'note' as const,
        lat: note.lat,
        lng: note.lng,
        label: `${note.label} · ${TYPE_LABEL[note.type]}`,
        onClick: () => startEditing(note),
      }));

    if (position) {
      list.push({
        id: 'map-note-draft',
        kind: 'pickup',
        lat: position.lat,
        lng: position.lng,
        label: 'Draft note position — drag to adjust',
        draggable: true,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, editingId, position]);

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setDescription('');
    setType('landmark');
    setActive(true);
    setPosition(null);
    setPickMode(false);
  };

  function startEditing(note: MapNote) {
    setEditingId(note.id);
    setLabel(note.label);
    setDescription(note.description ?? '');
    setType(note.type);
    setActive(note.isActive);
    setPosition({ lat: note.lat, lng: note.lng });
    setPickMode(false);
  }

  const save = async () => {
    if (label.trim().length < 2) {
      toast.error('Give the note a label with at least 2 characters.');
      return;
    }
    if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
      toast.error('Place the note on the map or enter its coordinates.');
      return;
    }

    const payload = {
      label: label.trim(),
      description: description.trim() || null,
      type,
      lat: position.lat,
      lng: position.lng,
      isActive: active,
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/admin/map-notes/${editingId}`, payload);
        toast.success('Map note updated.');
      } else {
        await api.post('/admin/map-notes', payload);
        toast.success('Map note added.');
      }
      resetForm();
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (note: MapNote) => {
    try {
      await api.patch(`/admin/map-notes/${note.id}`, { isActive: !note.isActive });
      if (editingId === note.id) setActive(!note.isActive);
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await api.delete(`/admin/map-notes/${deleting.id}`);
      toast.success('Map note deleted.');
      if (editingId === deleting.id) resetForm();
      setDeleting(null);
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRemoving(false);
    }
  };

  if (query.loading && !query.data) return <FullPageLoader label="Loading map notes" />;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Local knowledge
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
            Map notes
          </h1>
          <p className="mt-1 max-w-xl text-[13px] text-muted">
            Mark local roads, landmarks and closures that OpenStreetMap does not capture yet.
            Notes live in your own database and never alter OpenStreetMap data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="muted">{notes.length} total</Badge>
          <Badge tone="success">{notes.filter((note) => note.isActive).length} visible</Badge>
          <Badge tone="mango">
            {notes.filter((note) => note.type === 'road').length} roads
          </Badge>
        </div>
      </div>

      {query.error ? (
        <Card className="mt-4">
          <p className="text-[13px] text-muted">{query.error}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={query.reload}>
            Retry
          </Button>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <div className="relative h-[360px] overflow-hidden rounded-3xl border border-line/80 lg:h-[500px]">
            <MapView
              center={DEFAULT_CENTER}
              zoom={13}
              markers={markers}
              fit="markers"
              fitKey={`notes:${notes.length}`}
              padding={{ top: 40, bottom: 40, left: 40, right: 40 }}
              onClick={(point) => {
                if (!pickMode) return;
                setPosition(point);
                setPickMode(false);
                toast.info('Position set. Drag the pin to fine-tune it.');
              }}
              onMarkerDragEnd={(_id, point) => setPosition(point)}
            />
            {pickMode ? (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-2xl bg-ink/85 px-3 py-2 text-center text-[11.5px] font-semibold text-cream backdrop-blur">
                Tap the map to place this note
              </div>
            ) : null}
            <div className="absolute bottom-3 left-3 flex gap-2">
              <Button
                size="sm"
                variant={pickMode ? 'ink' : 'outline'}
                icon={<Crosshair size={14} />}
                onClick={() => setPickMode((value) => !value)}
              >
                {pickMode ? 'Cancel picking' : 'Pick on map'}
              </Button>
            </div>
          </div>

          <Card>
            <SectionTitle
              title="Saved notes"
              action={<Badge tone="muted">{filtered.length} shown</Badge>}
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search label or description"
                icon={<Search size={15} />}
                className="h-10 text-[13px]"
              />
              <Select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'all' | MapNoteType)}
                className="h-10 sm:w-[150px]"
              >
                <option value="all">All types</option>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {TYPE_LABEL[option]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-cream/50 px-4 py-8 text-center">
                  <MapPin size={22} className="mx-auto text-teal" />
                  <p className="mt-2 text-[13px] font-semibold text-ink">
                    {notes.length === 0 ? 'No map notes yet' : 'Nothing matches this filter'}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {notes.length === 0
                      ? 'Add a landmark, road or closure so riders and support share the same local names.'
                      : 'Try a different search or type.'}
                  </p>
                </div>
              ) : (
                filtered.map((note) => (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEditing(note)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') startEditing(note);
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
                      editingId === note.id
                        ? 'border-teal bg-teal-100/40'
                        : 'border-line bg-white hover:border-ink/20'
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mango-100 text-[#8a5c00]">
                      <MapPin size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {note.label}
                        </span>
                        {!note.isActive ? <Badge tone="muted">Hidden</Badge> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                        {note.lat.toFixed(5)}, {note.lng.toFixed(5)} · {dateTime(note.updatedAt)}
                      </span>
                    </span>
                    <Badge tone={TYPE_TONE[note.type]}>{TYPE_LABEL[note.type]}</Badge>
                    <span onClick={(event) => event.stopPropagation()}>
                      <Switch
                        checked={note.isActive}
                        onChange={() => toggleActive(note)}
                        label={`Show ${note.label} on the map`}
                      />
                    </span>
                    <IconButton
                      label={`Delete ${note.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleting(note);
                      }}
                      className="h-8 w-8 text-muted hover:bg-danger-100 hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
            <p className="mt-3 text-[10.5px] leading-snug text-muted">
              Toggle a note off to hide its pin without deleting the information.
            </p>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <SectionTitle
              title={editingId ? 'Edit note' : 'New note'}
              action={
                editingId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus size={14} />}
                    onClick={resetForm}
                  >
                    New
                  </Button>
                ) : (
                  <Badge tone="mango">Draft</Badge>
                )
              }
            />

            <div className="mt-3 space-y-3">
              <Field label="Label" required hint="Use the name people in Gosaba actually say.">
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={120}
                  placeholder="e.g. Mollakhali ferry ghat"
                />
              </Field>

              <Field label="Type">
                <Select
                  value={type}
                  onChange={(event) => setType(event.target.value as MapNoteType)}
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {TYPE_LABEL[option]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Description" hint="Optional directions or local context.">
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  placeholder="Landmark behind the market, paved road until the school…"
                />
              </Field>

              <div>
                <span className="mb-1.5 flex items-center justify-between gap-2 text-[11.5px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Position
                  <button
                    type="button"
                    onClick={() => setPickMode(true)}
                    className="text-[10.5px] font-semibold normal-case tracking-normal text-teal"
                  >
                    Pick on map
                  </button>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Latitude">
                    <Input
                      type="number"
                      step="0.000001"
                      value={position?.lat ?? ''}
                      onChange={(event) =>
                        setPosition({
                          lat: Number(event.target.value),
                          lng: position?.lng ?? DEFAULT_CENTER.lng,
                        })
                      }
                      placeholder="22.216700"
                      className="text-[12.5px]"
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      type="number"
                      step="0.000001"
                      value={position?.lng ?? ''}
                      onChange={(event) =>
                        setPosition({
                          lat: position?.lat ?? DEFAULT_CENTER.lat,
                          lng: Number(event.target.value),
                        })
                      }
                      placeholder="88.900000"
                      className="text-[12.5px]"
                    />
                  </Field>
                </div>
                <p className="mt-1 text-[10.5px] text-muted">
                  {position
                    ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)} — drag the pin on the map to adjust.`
                    : 'No position yet. Tap “Pick on map” and choose a spot.'}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-cream/60 px-3 py-2.5">
                <div>
                  <p className="text-[12.5px] font-semibold text-ink">Visible on the map</p>
                  <p className="text-[10.5px] text-muted">Hidden notes stay saved but unpinned.</p>
                </div>
                <Switch checked={active} onChange={setActive} label="Show this note on the map" />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                block
                icon={<Save size={15} />}
                loading={saving}
                disabled={saving}
                onClick={save}
              >
                {editingId ? 'Save changes' : 'Add note'}
              </Button>
              <Button
                variant="outline"
                icon={<Undo2 size={15} />}
                onClick={resetForm}
                disabled={saving || (!editingId && !label && !position)}
              >
                Clear
              </Button>
            </div>
          </Card>

          <Card className="bg-cream/60">
            <div className="flex gap-2">
              <Info size={16} className="mt-0.5 shrink-0 text-teal" />
              <div>
                <p className="text-[12px] font-semibold text-ink">Why local notes?</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  OpenStreetMap coverage in the Sundarbans is thin. Keep ferry ghats, school
                  corners and seasonal closures here so support and riders use the same names.
                  Routing itself stays on the self-hosted OSRM road graph.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this map note?"
        body={
          deleting
            ? `“${deleting.label}” will be removed permanently. Turning it off instead keeps the information for later.`
            : ''
        }
        confirmLabel="Delete note"
        tone="danger"
        loading={removing}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
