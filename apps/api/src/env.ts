import fs from 'node:fs';
import path from 'node:path';

/**
 * Carrega `.env.development` / `.env` da raiz do monorepo como efeito colateral de módulo.
 * Deve ser importado na linha 1 de `main.ts` para popular `process.env` antes dos demais módulos NestJS.
 */
const repoRoot = path.resolve(__dirname, '../../..');

for (const fileName of ['.env.development', '.env']) {
  const fullPath = path.join(repoRoot, fileName);
  if (fs.existsSync(fullPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(fullPath);
  }
}
