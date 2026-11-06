import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const vehicleSchema = new Schema(
  {
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true, unique: true },
    type: { type: String, enum: ['bike', 'scooter'], default: 'bike' },
    make: { type: String, required: true, trim: true, maxlength: 60 },
    model: { type: String, required: true, trim: true, maxlength: 60 },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 16,
    },
    color: { type: String, trim: true, maxlength: 30, default: null },
    year: { type: Number, min: 1980, max: 2100, default: null },
    photoUrl: { type: String, default: null },
  },
  { timestamps: true },
);

export type Vehicle = InferSchemaType<typeof vehicleSchema>;
export type VehicleDocument = HydratedDocument<Vehicle>;

export const VehicleModel = model('Vehicle', vehicleSchema);
