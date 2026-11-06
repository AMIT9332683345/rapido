import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { DOCUMENT_KINDS } from './enums.js';

const riderDocumentSchema = new Schema(
  {
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true, index: true },
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    number: { type: String, trim: true, maxlength: 40, default: null },
    frontUrl: { type: String, required: true },
    backUrl: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    note: { type: String, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

riderDocumentSchema.index({ rider: 1, kind: 1 }, { unique: true });

export type RiderDocument = InferSchemaType<typeof riderDocumentSchema>;
export type RiderDocumentDoc = HydratedDocument<RiderDocument>;

export const RiderDocumentModel = model('RiderDocument', riderDocumentSchema);
