import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../..');

for (const fileName of ['.env.development', '.env']) {
    const fullPath = path.join(repoRoot, fileName);
    if (fs.existsSync(fullPath) && typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(fullPath);
    }
}

export function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error (`Variável de ambiente obrigatória não definida: ${name}`);
    }
    return value;
}