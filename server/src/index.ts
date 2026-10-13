import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { logger } from './logger';
import { runMigrations } from './migrate';

async function main() {
  if (config.RUN_MIGRATIONS) await runMigrations();

  const app = createApp();
  const server = app.listen(config.PORT, '0.0.0.0', () => logger.info({ port: config.PORT, env: config.NODE_ENV }, 'MedMedia listening'));

  // Must be longer than the load balancer's idle timeout (usually 60s) or you get random 502s under load.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    // Finish in-flight requests, then close DB connections. Force exit if it takes too long.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await pool.end().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1); // let the platform restart a clean process
});

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
