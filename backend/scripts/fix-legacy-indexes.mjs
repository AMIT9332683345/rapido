// One-off, idempotent cleanup of indexes left behind by the previous
// database schema. Mongoose only creates the indexes declared on the current
// models; it never removes unrelated ones, so a stale unique index can block
// writes that are valid for this app.
//
// Usage: npm run db:fix-indexes  (add --dry-run to only report)
import 'dotenv/config';
import mongoose from 'mongoose';

const DRY_RUN = process.argv.includes('--dry-run');

// `payments` is shared with the earlier print-shop schema. Its
// `providerOrderId_1` index is unique AND non-sparse, so every ride payment
// (which has no providerOrderId) stores `null` and the second payment collides
// with E11000. The field is not part of this app's Payment model.
const LEGACY_INDEXES = [{ collection: 'payments', index: 'providerOrderId_1' }];

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to backend/.env first.');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');

  for (const { collection, index } of LEGACY_INDEXES) {
    const existing = await db.collection(collection).indexes();
    const target = existing.find((entry) => entry.name === index);
    if (!target) {
      console.log(`skip - ${collection}.${index} does not exist`);
      continue;
    }
    if (!target.unique || target.sparse) {
      console.log(`skip - ${collection}.${index} is not the conflicting unique/non-sparse index`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`would drop - ${collection}.${index} ${JSON.stringify(target.key)}`);
      continue;
    }
    await db.collection(collection).dropIndex(index);
    console.log(`dropped - ${collection}.${index}`);
  }

  console.log('done - legacy index check complete');
} finally {
  await mongoose.disconnect().catch(() => undefined);
}
