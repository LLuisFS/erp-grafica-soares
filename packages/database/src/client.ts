import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getRequiredEnv } from './env';
import * as schema from './schema';

const databaseUrl = getRequiredEnv('LOCAL_DATABASE_URL');

export const queryClient = postgres(databaseUrl, {
  prepare: false,
  max: 10,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;