import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getRequiredEnv } from './env';
import * as schema from './schema';

const databaseUrl =
  process.env.DATABASE_URL?.trim() || getRequiredEnv('SUPABASE_TRANSACTION_POOLER');

export const queryClient = postgres(databaseUrl, {
  prepare: false,
  max: 10,
  ...(databaseUrl.includes('supabase.com') ? { ssl: 'require' } : {}),
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;