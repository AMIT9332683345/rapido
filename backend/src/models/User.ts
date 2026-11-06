import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mobile: {
      type: String,
      required: true,
      unique: true,
      match: /^[6-9]\d{9}$/,
    },
    passwordHash: { type: String, required: true, select: false },
    photoUrl: { type: String, default: null },
    isBlocked: { type: Boolean, default: false },
    pushTokens: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.pushTokens;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ createdAt: -1 });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);
