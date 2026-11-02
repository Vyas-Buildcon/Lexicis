/**
 * Connections to the optional remote persistence targets:
 * MongoDB Atlas, Supabase via direct PostgreSQL, and Supabase via REST.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';
import { config } from '../config';

export const COURT_STATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS public.court_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`;

// --- MongoDB Atlas ---

let mongoClientInstance: MongoClient | null = null;

export async function getMongoDb() {
  if (!config.mongoUrl) return null;
  try {
    if (!mongoClientInstance) {
      mongoClientInstance = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 8000 });
      await mongoClientInstance.connect();
      console.log(`Connected to MongoDB Atlas successfully (${config.mongoDbName}).`);
    }
    return mongoClientInstance.db(config.mongoDbName);
  } catch (e) {
    console.warn("MongoDB connection warning:", e);
    // Allow the next call to retry instead of reusing a client that never connected
    mongoClientInstance?.close().catch(() => {});
    mongoClientInstance = null;
    return null;
  }
}

// --- Supabase: direct PostgreSQL ---

let pgPool: pg.Pool | null = null;
let activePgConnString: string | null = null;

export function getPgPool(): pg.Pool | null {
  try {
    const rawDbUrl = process.env.DATABASE_URL || '';
    const isPostgres = rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://');
    const dbUrl = (isPostgres ? rawDbUrl : null) ||
      process.env.SUPABASE_DIRECT_URL ||
      (process.env.SUPABASE_KEY?.startsWith('postgres') ? process.env.SUPABASE_KEY : null) ||
      (process.env.SUPABASE_URL?.startsWith('postgres') ? process.env.SUPABASE_URL : null);

    if (!dbUrl || dbUrl.includes('bpclndzcfojkltdejmus') || (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://'))) {
      if (pgPool) {
        pgPool.end().catch(() => {});
        pgPool = null;
      }
      activePgConnString = null;
      return null;
    }

    if (!pgPool || activePgConnString !== dbUrl) {
      pgPool = new pg.Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      activePgConnString = dbUrl;
      console.log("Supabase PostgreSQL Direct Pool initialized successfully.");
    }
    return pgPool;
  } catch (err) {
    console.error("Failed to initialize PostgreSQL Direct Pool:", err);
    pgPool = null;
    return null;
  }
}

// --- Supabase: REST client ---

let supabase: any = null;
let activeKey: string | null = null;
let activeUrl: string | null = null;

export function getSupabaseClient() {
  try {
    const currentUrl = process.env.SUPABASE_URL || '';
    const currentKey = process.env.SUPABASE_KEY || '';

    if (!currentUrl || currentUrl.includes('bpclndzcfojkltdejmus') || !currentKey || currentKey.startsWith('postgres') || currentKey.startsWith('sb_publishable_qIvcOAved')) {
      supabase = null;
      activeKey = null;
      activeUrl = null;
      return null;
    }

    if (!supabase || activeKey !== currentKey || activeUrl !== currentUrl) {
      supabase = createClient(currentUrl, currentKey);
      activeKey = currentKey;
      activeUrl = currentUrl;
      console.log("Supabase Client initialized successfully for project:", currentUrl);
    }
    return supabase;
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    supabase = null;
    return null;
  }
}

/** Closes open remote connections (used on shutdown). */
export async function closeRemoteStores() {
  await Promise.allSettled([
    mongoClientInstance?.close(),
    pgPool?.end()
  ]);
  mongoClientInstance = null;
  pgPool = null;
}

/** Races a promise against a timeout, rejecting with `message` if it takes longer than `ms`. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}
