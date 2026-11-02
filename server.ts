// config must be imported first: it loads .env before any service reads it
import { config, logConfigSummary } from './server/config';
import express from 'express';
import path from 'path';
import { Server } from 'http';
import { createApp } from './server/app';
import { startScheduler } from './server/scheduler';
import { db } from './server/db/database';
import { closeRemoteStores } from './server/db/remoteStores';

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled promise rejection:', reason);
});

async function attachFrontend(app: express.Express) {
  if (!config.isProduction) {
    // Loaded lazily so production never pulls in the dev toolchain
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    return;
  }

  const distPath = path.join(process.cwd(), 'dist');
  // Hashed build assets never change; index.html must always be revalidated
  app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(distPath, { index: false, maxAge: 0 }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

function listen(app: express.Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, config.host, () => resolve(server));
    server.once('error', reject);
  });
}

async function startServer() {
  logConfigSummary();
  const app = createApp();
  await attachFrontend(app);

  let server: Server;
  try {
    server = await listen(app, config.port);
  } catch (err: any) {
    // In development, fall back to the next port; in production a busy port is a deployment error
    if (err.code !== 'EADDRINUSE' || config.isProduction) throw err;
    console.warn(`Port ${config.port} is already in use, trying port ${config.port + 1}...`);
    server = await listen(app, config.port + 1);
  }

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`================================================================================`);
  console.log(`Lexicis E-Court Tracker running on http://localhost:${port} (${config.isProduction ? 'production' : 'development'})`);
  console.log(`================================================================================`);

  const scheduler = startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received: shutting down gracefully...`);
    clearInterval(scheduler);
    const forceExit = setTimeout(() => process.exit(1), 15000);
    forceExit.unref();

    server.close();
    await db.flush();
    await closeRemoteStores();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
