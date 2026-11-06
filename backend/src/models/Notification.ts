import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    recipientRole: {
      type: String,
      enum: ['customer', 'rider', 'admin'],
      required: true,
      index: true,
    },
    recipient: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 500 },
    type: { type: String, default: 'info' },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientRole: 1, recipient: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof notificationSchema>;
export type NotificationDocument = HydratedDocument<Notification>;

export const NotificationModel = model('Notification', notificationSchema);
