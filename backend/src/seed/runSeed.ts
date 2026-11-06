import { connectDatabase, disconnectDatabase } from '../db/connect.js';
import { ensureSeedData } from './seed.js';

async function main() {
  await connectDatabase();
  await ensureSeedData();
  console.log('[seed] done');
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error('[seed] failed:', error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
