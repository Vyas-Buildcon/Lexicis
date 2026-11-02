/**
 * Vercel serverless entry point. Vercel serves the built front-end from /dist and
 * sends every /api request here (see vercel.json); bundled to build/vercel-handler.cjs.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { waitUntil } from '@vercel/functions';
import { createApp } from './app';
import { db } from './db/database';

const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // A cold start loads stored state (local seed, then MongoDB) before answering
  await db.ready;
  // Keep the function alive until database writes triggered by this request reach MongoDB
  res.on('finish', () => waitUntil(db.flush()));
  return app(req as any, res as any);
}
