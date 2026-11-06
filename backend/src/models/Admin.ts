import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mobile: { type: String, required: true, unique: true, match: /^[6-9]\d{9}$/ },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin'], default: 'admin' },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type Admin = InferSchemaType<typeof adminSchema>;
export type AdminDocument = HydratedDocument<Admin>;

export const AdminModel = model('Admin', adminSchema);
