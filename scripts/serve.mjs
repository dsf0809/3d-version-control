// Start Form as a server reachable from other devices on the network.
import { existsSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!existsSync('dist/server/index.js')) {
  console.error(
    'No production build found. Run `pnpm build` first (or `pnpm serve`).',
  );
  process.exit(1);
}
if (process.env.FORM_TRUST_PROXY) process.env.VINEXT_TRUST_PROXY ??= '1';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 3000;
const { startProdServer } = await import('vinext/server/prod-server');
const { server } = await startProdServer({
  host,
  port,
  outDir: 'dist',
  silent: true,
});

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => `http://${a.address}:${port}`);
console.log('\n  Form workshop server is running.\n');
console.log(`  On this computer:   http://localhost:${port}`);
if (host === '0.0.0.0' || host === '::') {
  for (const url of addresses) console.log(`  On your network:    ${url}`);
  console.log(
    `  By name (if supported): http://${hostname().replace(/\.local$/, '')}.local:${port}`,
  );
} else
  console.log(
    `  Listening only on ${host}; set HOST=0.0.0.0 to allow other devices.`,
  );
console.log('\n  Data folder: ' + (process.env.FORM_DATA_DIR || 'data'));
console.log('  Press Ctrl+C to stop.\n');

// Open the database now so interrupted jobs are reconciled without waiting for a visit.
fetch(`http://127.0.0.1:${port}/api/health`).catch((e) =>
  console.error('  Startup check failed:', e.message),
);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log('\n  Stopping…');
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 5000).unref();
  });
