import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      validate: {
        validator: (value: number[]) =>
          Array.isArray(value) && value.length === 2 && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90,
        message: 'Invalid GeoJSON coordinates',
      },
    },
  },
  { _id: false },
);

const mapNoteSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: null },
    type: {
      type: String,
      enum: ['landmark', 'road', 'closure', 'other'],
      default: 'landmark',
      index: true,
    },
    location: { type: pointSchema, required: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

mapNoteSchema.index({ location: '2dsphere' });

export type MapNote = InferSchemaType<typeof mapNoteSchema>;
export type MapNoteDocument = HydratedDocument<MapNote>;

export const MapNoteModel = model('MapNote', mapNoteSchema);
