import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const serviceAreaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    boundary: {
      type: {
        type: String,
        enum: ['Polygon', 'MultiPolygon'],
        required: true,
      },
      coordinates: { type: Schema.Types.Mixed, required: true },
    },
    center: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], required: true },
    },
    isActive: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: true },
    unavailableMessage: {
      type: String,
      default: 'Rides are paused in this area right now. Please try again later.',
    },
    source: { type: String, default: 'OpenStreetMap' },
    sourceUrl: { type: String, default: null },
  },
  { timestamps: true },
);

serviceAreaSchema.index({ boundary: '2dsphere' });
serviceAreaSchema.index({ center: '2dsphere' });
serviceAreaSchema.index({ isActive: 1 });

export type ServiceArea = InferSchemaType<typeof serviceAreaSchema>;
export type ServiceAreaDocument = HydratedDocument<ServiceArea>;

export const ServiceAreaModel = model('ServiceArea', serviceAreaSchema);
