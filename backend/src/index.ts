import http from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { ensureSeedData } from './seed/seed.js';
import { initSockets } from './sockets/index.js';
import { startDispatchSweeper, stopDispatchSweeper } from './services/bookingService.js';

async function main() {
  await connectDatabase();
  await ensureSeedData();

  const server = http.createServer(app);
  initSockets(server);
  startDispatchSweeper();

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[api] ${env.APP_NAME} API listening on http://localhost:${env.PORT}`);
    console.log(`[api] environment: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    stopDispatchSweeper();
    server.close(async () => {
      await disconnectDatabase().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error) => {
  console.error('[api] failed to start:', error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
