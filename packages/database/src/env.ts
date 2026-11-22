import fs from 'node:fs';
import path from 'node:path';

/**
 * Localiza a raiz do monorepo (`pnpm-workspace.yaml`) subindo diretórios a partir de `__dirname` ou `process.cwd()`.
 * Compatível com módulos CommonJS (`@soares/api`) e ESM (`@soares/database`, `tsx`, `drizzle-kit`) sem usar `import.meta`.
 */
function findRepoRoot(startDir: string): string {
    let dir = path.resolve(startDir);
    while (true) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return startDir;
        }
        dir = parent;
    }
}

const repoRoot = findRepoRoot(typeof __dirname === 'string' ? __dirname : process.cwd());

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