import { createApp } from './app';
import { env, razorpayConfigured } from './config/env';
import prisma from './lib/prisma';
import { expireAbandonedPayments } from './services/payment.service';
import { emailConfigured } from './services/email.service';
import { storageName } from './services/storage.service';

async function main() {
  const app = createApp();

  // Fail fast with a clear message if the database is unreachable.
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('[db]  connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db]  connection failed — check DATABASE_URL and that PostgreSQL is running.');
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`\n  Beyond Walls API`);
    // eslint-disable-next-line no-console
    console.log(`  ─────────────────────────────────────────`);
    // eslint-disable-next-line no-console
    console.log(`  env        ${env.nodeEnv}`);
    // eslint-disable-next-line no-console
    console.log(`  api        http://localhost:${env.port}/api`);
    // eslint-disable-next-line no-console
    console.log(`  uploads    http://localhost:${env.port}/uploads`);
    // eslint-disable-next-line no-console
    console.log(`  razorpay   ${razorpayConfigured ? 'configured' : 'NOT configured (add keys to .env)'}`);
    // eslint-disable-next-line no-console
    console.log(`  email      ${emailConfigured ? 'SMTP configured' : 'not configured (emails are logged only)'}`);
    // eslint-disable-next-line no-console
    console.log(`  storage    ${storageName()}`);
    // eslint-disable-next-line no-console
    console.log('');
  });

  /*
   * Ask the shop's own questions once, before a customer has to.
   *
   * Nothing here is slow in normal running: the filter query measures about
   * 150ms warm, and the same again on a forced cache miss, which is what every
   * other endpoint on the site costs. The exception is the first request after
   * a restart. It touches tables nothing else has touched yet and pays for the
   * query plan and the cold pages behind them -- measured once at 1.17s
   * against 150ms for every reading since.
   *
   * That cost lands on whoever opens the shop first after a deployment, which
   * is a real person paying it for no reason. Asked from here it is paid by
   * nobody. Over HTTP rather than by calling the loaders directly, so it warms
   * exactly the path a customer takes, cache and all, without any part of the
   * route having to be pulled out to be reused. Failures are ignored: this is
   * an optimisation and nothing about serving the site depends on it.
   */
  const warm = ['/api/settings', '/api/catalog/categories', '/api/catalog/filters'];
  for (const path of warm) {
    void fetch(`http://127.0.0.1:${env.port}${path}`).catch(() => undefined);
  }

  /*
   * Sweep abandoned Razorpay attempts.
   *
   * An unpaid attempt holds reserved stock, so past its TTL it is cancelled and
   * the reservation released. `unref` keeps the timer from holding the process
   * open during shutdown.
   */
  const sweepInterval = setInterval(() => {
    void expireAbandonedPayments()
      .then((count) => {
        // eslint-disable-next-line no-console
        if (count > 0) console.log(`[payments] released ${count} abandoned order(s)`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[payments] sweep failed', err instanceof Error ? err.message : err);
      });
  }, 5 * 60_000);
  sweepInterval.unref();

  const shutdown = async (signal: string) => {
    clearInterval(sweepInterval);
    // eslint-disable-next-line no-console
    console.log(`\n[${signal}] shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if connections linger.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
