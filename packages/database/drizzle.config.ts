import { defineConfig } from 'drizzle-kit';
import { getRequiredEnv } from './src/env';

export default defineConfig ({
    dialect: 'postgresql',
    schema: './src/schema/index.ts',
    out: '.drizzle',
    dbCredentials: {
        url: process.env.DIRECT_URL?.trim() || getRequiredEnv('SUPABASE_DIRECT_CONNECTION'),
    },
    verbose: true,
    strict: true,
});