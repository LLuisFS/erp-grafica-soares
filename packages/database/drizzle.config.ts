import { defineConfig } from 'drizzle-kit';
import { getRequiredEnv } from './src/env';

export default defineConfig ({
    dialect: 'postgresql',
    schema: './src/schema/index.ts',
    out: '.drizzle',
    dbCredentials: {
        url: getRequiredEnv('LOCAL_DATABASE_URL'),
    },
    verbose: true,
    strict: true,
});