import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { NotificationModel } from '../models/Notification.js';
import { RiderModel } from '../models/Rider.js';
import { UserModel } from '../models/User.js';
import { getIo, rooms } from '../sockets/registry.js';

type RecipientRole = 'customer' | 'rider';

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

let tokenCache: { token: string; expires: number } | null = null;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

async function getFcmAccessToken(): Promise<string | null> {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) return null;
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: env.FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const privateKey = env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n');

  try {
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signingInput)
      .sign(privateKey)
      .toString('base64url');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${signingInput}.${signature}`,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn('[push] Google token request failed', response.status);
      return null;
    }
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    tokenCache = {
      token: data.access_token,
      expires: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return tokenCache.token;
  } catch (error) {
    console.warn('[push] FCM auth failed:', (error as Error).message);
    return null;
  }
}

async function sendFcmToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  const accessToken = await getFcmAccessToken();
  if (!accessToken || !env.FCM_PROJECT_ID) return;

  const link = env.FRONTEND_URL;
  const results = await Promise.allSettled(
    tokens.slice(0, 50).map(async (token) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: payload.data,
              webpush: {
                fcm_options: { link },
                notification: { icon: `${link}/icons/icon-192.png` },
              },
            },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} ${text.slice(0, 200)}`);
      }
    }),
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    console.warn(`[push] ${failures.length}/${results.length} FCM messages failed`);
  }
}

async function pushToRecipient(
  role: RecipientRole,
  recipientId: string,
  payload: PushPayload,
): Promise<void> {
  if (!env.FCM_PROJECT_ID) return;
  try {
    const tokens =
      role === 'customer'
        ? ((await UserModel.findById(recipientId).select('pushTokens').lean())?.pushTokens ?? [])
        : ((await RiderModel.findById(recipientId).select('pushTokens').lean())?.pushTokens ?? []);
    await sendFcmToTokens(tokens ?? [], payload);
  } catch (error) {
    console.warn('[push] failed:', (error as Error).message);
  }
}

export interface NotifyInput {
  recipientRole: RecipientRole;
  recipientId: string;
  title: string;
  body: string;
  type?: string;
  data?: Record<string, string>;
  push?: boolean;
}

export async function notifyRecipient(input: NotifyInput): Promise<void> {
  const data = input.data ?? {};
  try {
    const doc = await NotificationModel.create({
      recipientRole: input.recipientRole,
      recipient: input.recipientId,
      title: input.title,
      body: input.body,
      type: input.type ?? 'info',
      data,
    });

    getIo()
      ?.to(
        input.recipientRole === 'customer'
          ? rooms.customer(input.recipientId)
          : rooms.rider(input.recipientId),
      )
      .emit('notification', {
        id: String(doc._id),
        title: doc.title,
        body: doc.body,
        type: doc.type,
        data: doc.data,
        createdAt: doc.createdAt,
      });
  } catch (error) {
    console.error('[notify] failed to store notification', (error as Error).message);
  }

  if (input.push !== false) {
    void pushToRecipient(input.recipientRole, input.recipientId, {
      title: input.title,
      body: input.body,
      data,
    });
  }
}

export async function notifyAdmins(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  getIo()?.to(rooms.admin).emit(event, payload);
}
