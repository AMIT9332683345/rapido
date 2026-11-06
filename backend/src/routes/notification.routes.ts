import { Router } from 'express';
import { z } from 'zod';
import { NotificationModel } from '../models/Notification.js';
import { RiderModel } from '../models/Rider.js';
import { UserModel } from '../models/User.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
router.use(authenticate, requireRole('customer', 'rider'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const [items, unread] = await Promise.all([
      NotificationModel.find({
        recipientRole: auth.role,
        recipient: auth.id,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      NotificationModel.countDocuments({
        recipientRole: auth.role,
        recipient: auth.id,
        readAt: null,
      }),
    ]);
    res.json({
      unread,
      notifications: items.map((n) => ({
        id: String(n._id),
        title: n.title,
        body: n.body,
        type: n.type,
        data: n.data,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await NotificationModel.updateMany(
      { recipientRole: auth.role, recipient: auth.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ ok: true });
  }),
);

router.post(
  '/device-token',
  asyncHandler(async (req, res) => {
    const body = z.object({ token: z.string().min(10).max(500) }).parse(req.body);
    const auth = req.auth!;
    if (auth.role === 'customer') {
      await UserModel.updateOne(
        { _id: auth.id },
        { $addToSet: { pushTokens: body.token } },
      );
    } else {
      await RiderModel.updateOne(
        { _id: auth.id },
        { $addToSet: { pushTokens: body.token } },
      );
    }
    res.json({ ok: true });
  }),
);

router.delete(
  '/device-token',
  asyncHandler(async (req, res) => {
    const body = z.object({ token: z.string().min(10).max(500) }).parse(req.body);
    const auth = req.auth!;
    if (auth.role === 'customer') {
      await UserModel.updateOne({ _id: auth.id }, { $pull: { pushTokens: body.token } });
    } else {
      await RiderModel.updateOne({ _id: auth.id }, { $pull: { pushTokens: body.token } });
    }
    res.json({ ok: true });
  }),
);

export default router;
