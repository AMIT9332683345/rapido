import mongoose from 'mongoose';
import { env } from '../config/env.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: true,
    maxPoolSize: 15,
  });

  const { host, name } = mongoose.connection;
  console.log(`[db] connected to ${host}/${name}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
