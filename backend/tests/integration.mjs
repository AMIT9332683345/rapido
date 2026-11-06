import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import mongoose from 'mongoose';

const BASE = (process.env.API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const API = `${BASE}/api`;
const ADMIN_MOBILE = process.env.ADMIN_MOBILE || '9876543210';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const suffix = String(Date.now()).slice(-7);
const CUSTOMER_MOBILE = `9${suffix}01`.slice(0, 10);
const RIDER_MOBILE = `9${suffix}02`.slice(0, 10);
const PASSWORD = 'Integration123';

const state = {
  customer: null,
  rider: null,
  adminToken: null,
  customerToken: null,
  riderToken: null,
  bookingId: null,
  documentId: null,
  uploadName: null,
};

function step(message) {
  console.log(`ok - ${message}`);
}

async function call(path, { token, method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data?.message || data?.error || text || response.statusText;
    const error = new Error(`${method} ${path} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { data, response };
}

async function anonymousFetch(url) {
  return fetch(url.startsWith('http') ? url : `${BASE}${url}`);
}

async function registerCustomer() {
  const { data } = await call('/auth/customer/register', {
    method: 'POST',
    body: { name: 'Integration Customer', mobile: CUSTOMER_MOBILE, password: PASSWORD },
  });
  state.customer = data.user;
  state.customerToken = data.token;
  step('customer registration and token');
}

async function registerRider() {
  const { data } = await call('/auth/rider/register', {
    method: 'POST',
    body: {
      name: 'Integration Rider',
      mobile: RIDER_MOBILE,
      password: PASSWORD,
      vehicle: {
        type: 'bike',
        make: 'Hero',
        model: 'Splendor',
        registrationNumber: `WB${suffix.slice(-4)}T${suffix.slice(0, 2)}`,
        color: 'Black',
        year: 2022,
      },
    },
  });
  state.rider = data.user;
  state.riderToken = data.token;
  step('rider registration and token');
}

async function adminLogin() {
  assert.ok(ADMIN_PASSWORD, 'ADMIN_PASSWORD must be present in backend/.env to run integration tests');
  const { data } = await call('/auth/admin/login', {
    method: 'POST',
    body: { mobile: ADMIN_MOBILE, password: ADMIN_PASSWORD },
  });
  state.adminToken = data.token;
  step('admin login');
}

async function approveRider() {
  await call(`/admin/riders/${state.rider.id}/status`, {
    token: state.adminToken,
    method: 'PATCH',
    body: { status: 'approved' },
  });
  const { data } = await call(`/admin/riders/${state.rider.id}`, { token: state.adminToken });
  assert.equal(data.rider.status, 'approved');
  step('rider approved by admin');
}

async function areaCentre() {
  const { data } = await call('/geo/service-area');
  return { center: data.center, name: data.name };
}

async function riderOnline(center) {
  await call('/rider/availability', {
    token: state.riderToken,
    method: 'PATCH',
    body: { isOnline: true, location: { lat: center.lat, lng: center.lng } },
  });
  const { data } = await call('/rider/profile', { token: state.riderToken });
  assert.equal(data.isOnline, true);
  step('rider online with GPS location');
}

async function createBooking(center) {
  const pickup = {
    label: 'Integration pickup',
    address: 'Test lane',
    lat: center.lat,
    lng: center.lng,
  };
  const destination = {
    label: 'Integration drop',
    address: 'Test market',
    lat: center.lat + 0.0035,
    lng: center.lng + 0.0045,
  };
  const { data } = await call('/customer/bookings', {
    token: state.customerToken,
    method: 'POST',
    body: { pickup, destination, note: 'Integration test ride' },
  });
  state.bookingId = data.booking.id;
  assert.equal(data.booking.status, 'SEARCHING');
  assert.ok(data.booking.fare.estimated > 0, 'booking has a server fare');
  step(`booking created (${data.booking.code}) with server fare`);
}

async function acceptAndComplete() {
  const accepted = await call(`/rider/bookings/${state.bookingId}/accept`, {
    token: state.riderToken,
    method: 'POST',
  });
  assert.equal(accepted.data.booking.status, 'ACCEPTED');
  step('rider accepted with atomic assignment');

  await call(`/rider/bookings/${state.bookingId}/arriving`, {
    token: state.riderToken,
    method: 'POST',
    body: { lat: 22.2167, lng: 88.9 },
  });
  await call(`/rider/bookings/${state.bookingId}/arrive`, {
    token: state.riderToken,
    method: 'POST',
    body: { lat: 22.2167, lng: 88.9 },
  });
  await call(`/rider/bookings/${state.bookingId}/start`, {
    token: state.riderToken,
    method: 'POST',
    body: { lat: 22.2167, lng: 88.9 },
  });
  const completed = await call(`/rider/bookings/${state.bookingId}/complete`, {
    token: state.riderToken,
    method: 'POST',
    body: { lat: 22.2170, lng: 88.9045 },
  });
  assert.equal(completed.data.booking.status, 'COMPLETED');
  assert.ok(completed.data.booking.fare.final > 0, 'final fare is calculated');
  step('arriving → arrived → in progress → completed');

  const customerView = await call(`/customer/bookings/${state.bookingId}`, {
    token: state.customerToken,
  });
  assert.equal(customerView.data.booking.status, 'COMPLETED');
  assert.ok(customerView.data.booking.rider.mobile, 'customer sees rider mobile after assignment');
  step('customer view sees completed ride and rider contact');
}

async function concurrentAcceptGuard() {
  const { data } = await call('/customer/bookings', {
    token: state.customerToken,
    method: 'POST',
    body: {
      pickup: { label: 'Guard pickup', lat: 22.2167, lng: 88.9 },
      destination: { label: 'Guard drop', lat: 22.2195, lng: 88.904 },
    },
  });
  const id = data.booking.id;

  const first = await fetch(`${API}/rider/bookings/${id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.riderToken}` },
  });
  assert.equal(first.status, 200, 'first accept succeeds');

  const second = await fetch(`${API}/rider/bookings/${id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.riderToken}` },
  });
  assert.notEqual(second.status, 200, 'second accept is rejected');
  step('double accept is rejected by the atomic guard');

  await call(`/admin/bookings/${id}/cancel`, {
    token: state.adminToken,
    method: 'POST',
    body: { reason: 'Integration cleanup' },
  });
}

async function adminEndpoints() {
  const stats = await call('/admin/stats', { token: state.adminToken });
  assert.ok(stats.data.totalRides >= 1);
  assert.ok(stats.data.customers >= 1);
  step('admin stats');

  const bookings = await call('/admin/bookings?limit=5', { token: state.adminToken });
  assert.ok(Array.isArray(bookings.data.rides));
  step('admin bookings list');

  const detail = await call(`/admin/bookings/${state.bookingId}`, { token: state.adminToken });
  assert.equal(detail.data.booking.id, state.bookingId);
  assert.ok(Array.isArray(detail.data.activity) && detail.data.activity.length > 0);
  step('admin booking detail and activity log');

  const csv = await fetch(`${API}/admin/bookings/export.csv`, {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type') || '', /text\/csv/);
  const text = await csv.text();
  assert.match(text, /"Booking ID"/);
  step('admin CSV export');

  const live = await call('/admin/live', { token: state.adminToken });
  assert.ok(Array.isArray(live.data.rides) && Array.isArray(live.data.riders));
  step('admin live snapshot');

  const reports = await call('/admin/reports?days=7', { token: state.adminToken });
  assert.equal(reports.data.series.length, 7);
  assert.ok(reports.data.totals.bookings >= 1);
  step('admin reports');

  const config = await call('/admin/fare-config', { token: state.adminToken });
  const payload = {
    name: config.data.name || 'Standard bike taxi',
    baseFare: config.data.baseFare,
    perKm: config.data.perKm,
    perMinute: config.data.perMinute,
    minimumFare: config.data.minimumFare,
    waitingFreeMinutes: config.data.waitingFreeMinutes,
    waitingPerMinute: config.data.waitingPerMinute,
    cancellationFee: config.data.cancellationFee,
    platformFee: config.data.platformFee,
  };
  const saved = await call('/admin/fare-config', {
    token: state.adminToken,
    method: 'PUT',
    body: payload,
  });
  assert.equal(saved.data.baseFare, payload.baseFare);
  step('admin fare read/write');

  const area = await call('/admin/service-area', { token: state.adminToken });
  assert.ok(area.data.boundary && area.data.center);
  step('admin service area read');

  const customers = await call(`/admin/customers?search=${CUSTOMER_MOBILE}`, {
    token: state.adminToken,
  });
  assert.ok(customers.data.customers.some((row) => row.id === state.customer.id));
  step('admin customer search');
}

async function adminMapNotes() {
  const label = `Integration note ${suffix}`;
  const created = await call('/admin/map-notes', {
    token: state.adminToken,
    method: 'POST',
    body: {
      label,
      description: 'Temporary landmark created by the integration suite',
      type: 'landmark',
      lat: 22.2167,
      lng: 88.9,
    },
  });
  const noteId = created.data.note.id;
  assert.equal(created.data.note.label, label);
  assert.equal(created.data.note.type, 'landmark');

  const listed = await call(`/admin/map-notes?search=${encodeURIComponent(label)}`, {
    token: state.adminToken,
  });
  assert.ok(listed.data.notes.some((note) => note.id === noteId));

  const patched = await call(`/admin/map-notes/${noteId}`, {
    token: state.adminToken,
    method: 'PATCH',
    body: { type: 'road', isActive: false },
  });
  assert.equal(patched.data.note.type, 'road');
  assert.equal(patched.data.note.isActive, false);

  await call(`/admin/map-notes/${noteId}`, {
    token: state.adminToken,
    method: 'DELETE',
  });
  const after = await call('/admin/map-notes', { token: state.adminToken });
  assert.ok(!after.data.notes.some((note) => note.id === noteId));
  step('map note create, list, update, and delete');
}

async function blockingFlow() {
  await call(`/admin/customers/${state.customer.id}/block`, {
    token: state.adminToken,
    method: 'PATCH',
    body: { blocked: true },
  });
  const denied = await fetch(`${API}/auth/customer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: CUSTOMER_MOBILE, password: PASSWORD }),
  });
  assert.equal(denied.status, 403, 'blocked customer cannot sign in');
  await call(`/admin/customers/${state.customer.id}/block`, {
    token: state.adminToken,
    method: 'PATCH',
    body: { blocked: false },
  });
  step('customer block and unblock enforcement');
}

async function uploadPrivacy() {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX9sAAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const upload = await call('/uploads', {
    token: state.riderToken,
    method: 'POST',
    form,
  });
  state.uploadName = upload.data.url.split('/').pop();

  const publicImage = await anonymousFetch(upload.data.url);
  assert.equal(publicImage.status, 200, 'profile uploads are publicly readable');
  step('non-document upload is publicly readable');

  const doc = await call('/rider/documents', {
    token: state.riderToken,
    method: 'POST',
    body: { kind: 'licence', number: 'TEST-0001', frontUrl: upload.data.url },
  });
  state.documentId = doc.data.document?.id ?? doc.data.id ?? null;

  const anonymousDoc = await anonymousFetch(upload.data.url);
  assert.equal(anonymousDoc.status, 401, 'documents are not public');
  const customerDoc = await fetch(`${BASE}${upload.data.url}`, {
    headers: { Authorization: `Bearer ${state.customerToken}` },
  });
  assert.equal(customerDoc.status, 403, 'customers cannot read rider documents');
  const riderDoc = await fetch(`${BASE}${upload.data.url}`, {
    headers: { Authorization: `Bearer ${state.riderToken}` },
  });
  assert.equal(riderDoc.status, 200, 'owning rider can read the document');
  step('document upload privacy enforced');
}

async function cleanup() {
  if (state.uploadName) {
    const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    await unlink(path.join(uploadDir, state.uploadName)).catch(() => undefined);
  }
  if (!process.env.MONGODB_URI) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) return;
    const customers = await db.collection('users').find({ mobile: CUSTOMER_MOBILE }).toArray();
    const riders = await db.collection('riders').find({ mobile: RIDER_MOBILE }).toArray();
    const customerIds = customers.map((row) => row._id);
    const riderIds = riders.map((row) => row._id);
    if (customerIds.length || riderIds.length) {
      await db
        .collection('bookings')
        .deleteMany({ $or: [{ customer: { $in: customerIds } }, { rider: { $in: riderIds } }] });
      await db.collection('payments').deleteMany({
        $or: [{ customer: { $in: customerIds } }, { rider: { $in: riderIds } }],
      });
      await db.collection('ridelocations').deleteMany({ rider: { $in: riderIds } });
      await db.collection('rideactivitylogs').deleteMany({ rider: { $in: riderIds } });
      await db.collection('riderdocuments').deleteMany({ rider: { $in: riderIds } });
      await db.collection('vehicles').deleteMany({ rider: { $in: riderIds } });
      await db.collection('notifications').deleteMany({
        $or: [
          { recipient: { $in: [...customerIds, ...riderIds] } },
          { recipientId: { $in: [...customerIds, ...riderIds] } },
        ],
      });
      await db.collection('users').deleteMany({ _id: { $in: customerIds } });
      await db.collection('riders').deleteMany({ _id: { $in: riderIds } });
    }
    await db.collection('mapnotes').deleteMany({
      label: { $regex: `^Integration note ${suffix}$` },
    });
    step('test records cleaned up');
  } catch (error) {
    console.warn(`warn - cleanup skipped: ${(error).message}`);
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

async function main() {
  console.log(`Integration run against ${API}`);
  const area = await areaCentre();
  step(`public service area (${area.name})`);

  await adminLogin();
  await registerCustomer();
  await registerRider();
  await approveRider();
  await riderOnline(area.center);
  await createBooking(area.center);
  await acceptAndComplete();
  await concurrentAcceptGuard();
  await adminEndpoints();
  await adminMapNotes();
  await blockingFlow();
  await uploadPrivacy();

  console.log('All integration checks passed.');
}

try {
  await main();
} catch (error) {
  console.error(`\nIntegration failure: ${error.message}`);
  if (error.data) console.error(JSON.stringify(error.data));
  process.exitCode = 1;
} finally {
  await cleanup();
}
