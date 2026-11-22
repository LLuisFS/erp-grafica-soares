# Guia de Arquitetura, Monorepo e Fluxo de Execução — ERP Gráfica Soares

## 1. Cabeçalho Técnico

- **Caminho no repositório:** raiz do monorepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `docker-compose.yml`) + camada de entrada da API (`apps/api/src/env.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`)
- **Forma de importação entre workspaces:**
  ```ts
  import { loginSchema, PermissionKey } from '@soares/shared';
  import { db, users, roles, eq } from '@soares/database';
  ```
- **Issue(s) relacionada(s):** Issue #1 (Fundação do Monorepo e Docker), Issue #2 (Schema Drizzle Bloco 1.1), Issue #3 (Núcleo NestJS, Auth JWT e RBAC) e Issue #6 (Seed Idempotente)
- **Responsabilidade:** Orquestrar os 6 workspaces TypeScript do monorepo (`pnpm` + `Turborepo`) sobre PostgreSQL 16 e Redis 7 locais via Docker, padronizando o ciclo de vida de inicialização de variáveis de ambiente e o pipeline global de segurança de cada requisição HTTP na API NestJS.

---

## 2. Visão Geral & Fluxo de Execução

### 2.1 Topologia do Monorepo (`pnpm` + `Turborepo`)

```text
erp-grafica-soares/
├── apps/
│   ├── api      (@soares/api)            ──► NestJS 10 REST API (CommonJS + tsc-watch + tsx)
│   ├── web      (@soares/web)            ──► Next.js (placeholder — Issue #7)
│   └── worker   (@soares/worker)         ──► BullMQ Worker (placeholder — Issue #10)
└── packages/
    ├── shared         (@soares/shared)         ──► Catálogo RBAC + Schemas Zod (sem deps internas)
    ├── database       (@soares/database)       ──► Drizzle ORM + Schemas + Seed (depende de @soares/shared)
    └── pricing-engine (@soares/pricing-engine) ──► Motor de cálculo gráfico (depende de @soares/shared)

Dependências internas (workspace:*):
  @soares/api    ──► @soares/database, @soares/pricing-engine, @soares/shared
  @soares/web    ──► @soares/pricing-engine, @soares/shared
  @soares/worker ──► @soares/database, @soares/shared
  @soares/database ──► @soares/shared
```

### 2.2 Ordem de Boot da API e Carregamento de `.env`

```text
pnpm --filter @soares/api dev
  │
  ▼
tsc-watch -p tsconfig.json          (1. Compila TS -> apps/api/dist/*.js com emitDecoratorMetadata)
  │ --onSuccess
  ▼
tsx dist/main.js                    (2. Executa JS compilado + transpila @soares/* sob demanda)
  │
  ├─► linha 1: import './env'       (3. Carrega .env.development -> .env via process.loadEnvFile)
  ├─► linha 2: import 'reflect-metadata'
  └─► NestFactory.create(AppModule) (4. Inicializa DI Container: DatabaseModule -> AuthModule)
        ├─► JwtModule.registerAsync (5. Lê JWT_SECRET e JWT_EXPIRES_IN já presentes em process.env)
        ├─► enableCors({ origin: true, credentials: true })
        ├─► SwaggerModule.setup('docs', app, document)
        └─► app.listen(API_PORT || 3333)
```

### 2.3 Ciclo de Vida Completo de uma Requisição HTTP na API

```text
  Cliente HTTP (Swagger / @soares/web / Webhook)
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. JwtAuthGuard (APP_GUARD #1)                                          │
│    • Consulta @Public() via Reflector                                   │
│    • Se público -> libera; senão aciona Passport -> JwtStrategy         │
│    • JwtStrategy.validate() consulta users+roles no PG e popula         │
│      request.user (bloqueia active=false com 401)                       │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. RolesGuard (APP_GUARD #2)                                            │
│    • Consulta @RequirePermissions(...) via Reflector                    │
│    • Sem permissões exigidas ou user.permissions['system.all'] -> OK    │
│    • Exige todas as chaves em request.user.permissions (senão 403)      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. ZodValidationPipe (@Body / @Query)                                   │
│    • Executa schema.safeParse(value) (ex.: loginSchema, verifyPinSchema)│
│    • Aplica .trim(), .toLowerCase() e regex; falha retorna 400          │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Controller ──► Service ──► @Inject(DRIZZLE_DB) ──► PostgreSQL 16     │
│    • Extrai @CurrentUser() tipado como AuthenticatedUser                │
│    • Executa regra de negócio e queries Drizzle ORM                     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. FinancialSanitizerInterceptor (APP_INTERCEPTOR — fluxo de saída)     │
│    • Remove ALWAYS_STRIP_KEYS (passwordHash, approvalPinHash) SEMPRE    │
│    • Remove FINANCIAL_SENSITIVE_KEYS se perfil restrito ou sem          │
│      'os.view_financial' / 'system.all'                                 │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
                         Resposta JSON Sanitizada
```

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo / Artefato | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `packages: ["apps/*", "packages/*"]` | Configuração YAML | `pnpm-workspace.yaml` | Declara os 6 workspaces internos e política `allowBuilds` do pnpm v12. |
| `tasks` (`build`, `dev`, `lint`, `typecheck`, `test`) | Pipeline JSON | `turbo.json` | Orquestra cache local e grafo topológico (`^build`) via Turborepo. |
| `compilerOptions` base | Config TypeScript | `tsconfig.base.json` | Define `ES2022`, `strict: true`, `noUncheckedIndexedAccess: true` e `isolatedModules: true` para todo o monorepo. |
| Serviços `postgres` e `redis` | Containers Docker | `docker-compose.yml` | Sobe PostgreSQL 16 (`soares-postgres:5432`) e Redis 7 (`soares-redis:6379`) com volumes persistentes e healthchecks. |
| `AppModule` | Classe (`@Module`) | `apps/api/src/app.module.ts` | Módulo raiz que conecta `DatabaseModule`, `AuthModule`, `HealthController` e os guards/interceptors globais. |
| `bootstrap()` | Função interna | `apps/api/src/main.ts` | Ponto de entrada da API HTTP (CORS, Swagger `/docs` e porta `API_PORT`). |
| Loader de `.env` | Efeito colateral | `apps/api/src/env.ts` | Carrega `.env.development` e `.env` da raiz antes da avaliação dos módulos NestJS. |

---

## 4. Constantes, Enums e Schemas de Validação

### 4.1 Scripts de Raiz (`package.json`)

| Script (`pnpm <cmd>`) | Comando Executado | Finalidade |
| :--- | :--- | :--- |
| `pnpm dev` | `turbo run dev` | Executa o modo desenvolvimento em paralelo nos workspaces com script `dev`. |
| `pnpm build` | `turbo run build` | Compila os workspaces respeitando dependências topológicas (`^build`). |
| `pnpm typecheck` | `turbo run typecheck` | Roda `tsc --noEmit` nos 6 pacotes do monorepo. |
| `pnpm lint` / `pnpm test` | `turbo run lint` / `test` | Executa lint e testes (`vitest run` no `@soares/pricing-engine`). |
| `pnpm db:generate` | `pnpm --filter @soares/database db:generate` | Gera novas migrations SQL do Drizzle em `packages/database/.drizzle/`. |
| `pnpm db:migrate` | `pnpm --filter @soares/database db:migrate` | Aplica migrations pendentes no PostgreSQL configurado em `drizzle.config.ts`. |
| `pnpm db:seed` | `pnpm --filter @soares/database db:seed` | Executa o seed idempotente (`tsx src/seed.ts`). |
| `pnpm docker:up` / `docker:down` | `docker compose up -d` / `down` | Sobe ou encerra os containers locais `soares-postgres` e `soares-redis`. |

### 4.2 Infraestrutura Local (`docker-compose.yml`)

| Serviço | Imagem | Container | Porta | Credenciais / Configuração Padrão |
| :--- | :--- | :--- | :--- | :--- |
| `postgres` | `postgres:16-alpine` | `soares-postgres` | `5432:5432` | Usuário `soares`, senha `soares_dev_password`, banco `erp_grafica_soares`, `TZ=America/Sao_Paulo`, volume `soares_postgres_data`. |
| `redis` | `redis:7-alpine` | `soares-redis` | `6379:6379` | Persistência AOF (`redis-server --appendonly yes`), volume `soares_redis_data`. |

### 4.3 Política de Build (`pnpm-workspace.yaml`) e Variáveis de Ambiente

- **`allowBuilds` (`pnpm-workspace.yaml`):** `esbuild: true` (necessário para `tsx` e `vitest`), `'@nestjs/core': false` e `'@scarf/scarf': false` (dispensa scripts pós-instalação de telemetria/opencollective no pnpm v12).
- **Precedência de `.env`:** tanto `apps/api/src/env.ts` quanto `packages/database/src/env.ts` iteram `['.env.development', '.env']` usando `process.loadEnvFile(fullPath)`. Como a API nativa do Node **não sobrescreve** chaves já definidas em `process.env`, a ordem real de precedência é:
  1. Variáveis já injetadas no shell/SO (maior prioridade — produção/CI).
  2. `.env.development` na raiz do repositório.
  3. `.env` na raiz do repositório (fallback).

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

### 5.1 Configuração Base TypeScript (`tsconfig.base.json` vs. `apps/api/tsconfig.json`)

- **Assinatura de configuração:**
  - Base (`tsconfig.base.json`): `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `strict: true`, `noUncheckedIndexedAccess: true`, `isolatedModules: true`, `declaration: true`, `sourceMap: true`.
  - Sobrescrita da API (`apps/api/tsconfig.json`): `module: "CommonJS"`, `moduleResolution: "node"`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `strictPropertyInitialization: false`.
- **O que faz:** Mantém rigor máximo de tipagem (`strict` + `noUncheckedIndexedAccess`) em todos os pacotes, enquanto adapta `@soares/api` para emitir metadados de decorators (`design:paramtypes`) exigidos pela Injeção de Dependência do NestJS.
- **Como usar (validação global):**
  ```powershell
  pnpm.cmd typecheck
  ```
- **Exceções / Falhas comuns:** Erro `TS1343` caso algum pacote consumido por `@soares/api` utilize `import.meta` (resolvido em `packages/database/src/env.ts` via `findRepoRoot`).

### 5.2 Pipeline Global no `AppModule` (`apps/api/src/app.module.ts`)

- **Assinatura exata:**
  ```ts
  @Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [HealthController],
    providers: [
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_INTERCEPTOR, useClass: FinancialSanitizerInterceptor },
    ],
  })
  export class AppModule {}
  ```
- **O que faz:** Ativa autenticação JWT, controle de permissões RBAC e sanitização financeira de forma **opt-out** (segurança por padrão em todas as rotas da API).
- **Como implementar / testar disponibilidade:**
  ```http
  GET http://localhost:3333/health
  ```
  Retorna `200 OK`:
  ```json
  {
    "status": "ok",
    "service": "erp-grafica-soares-api",
    "timestamp": "2026-11-22T15:55:13.097Z"
  }
  ```
- **Exceções / Status HTTP:**
  - `200 OK` em `/health` (decorado com `@Public()`).
  - `401 Unauthorized` em qualquer outra rota sem Bearer JWT válido.
  - `403 Forbidden` quando o perfil não possui a permissão exigida em `@RequirePermissions(...)`.

---

## 6. Receita Rápida: Como Estender este Módulo

### Como adicionar um novo workspace ou módulo de domínio ao monorepo

1. **Novo módulo na API (`apps/api/src/modules/<dominio>/`):**
   - Crie `<dominio>.module.ts`, `<dominio>.controller.ts` e `<dominio>.service.ts`.
   - Injete o banco usando `@Inject(DRIZZLE_DB) private readonly db: Database` (não precisa importar `DatabaseModule`, pois ele é `@Global()`).
   - Registre o novo módulo no array `imports` de `apps/api/src/app.module.ts`.
2. **Novo contrato compartilhado (`packages/shared/src/`):**
   - Crie `<dominio>.schemas.ts` com schemas Zod e reexporte em `packages/shared/src/index.ts`.
   - Importe normalmente em `@soares/api` ou `@soares/web` via `import { ... } from '@soares/shared'`.
3. **Validação antes do commit/merge:**
   ```powershell
   pnpm.cmd typecheck
   pnpm.cmd --filter @soares/api build
   ```

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **`tsx watch src/main.ts` quebra Injeção de Dependência no NestJS:** O `tsx` usa `esbuild`, que **não emite `emitDecoratorMetadata`** (`design:paramtypes`), fazendo `Reflector` ou services chegarem como `undefined` nos construtores. Por isso, o script `dev` da API usa `tsc-watch -p tsconfig.json --onSuccess "tsx dist/main.js"` — o `tsc` emite os metadados completos e o `tsx` executa o JS compilado resolvendo os `.ts` de `@soares/*`.
2. **Hoisting de imports estáticos antes de `process.loadEnvFile`:** Em Node/TypeScript, todos os `import` estáticos são avaliados antes de código imperativo no topo do `main.ts`. Mantenha `import './env'` **sempre na linha 1** de `apps/api/src/main.ts` e use `registerAsync` em módulos que leem `process.env`.
3. **`AggregateError` (HTTP `500`) nas rotas que consultam o banco:** Indica que o container `soares-postgres` (`localhost:5432`) está parado (Docker Desktop fechado). Abra o Docker Desktop e rode `pnpm.cmd docker:up`.
4. **PowerShell bloqueando `pnpm.ps1` no Windows:** Caso a ExecutionPolicy bloqueie `pnpm`, utilize `pnpm.cmd` ou libere `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
5. **UTF-8 BOM em arquivos `.json`:** O `pnpm` v12 rejeita `package.json` com BOM (`EF BB BF`) ao executar scripts via Turborepo. Salve sempre todos os `.json` como UTF-8 **sem BOM**.

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado no Projeto | Benefício Arquitetural |
| :--- | :--- | :--- |
| **Monorepo com Build Graph (DAG)** | `pnpm-workspace.yaml` + `turbo.json` | Compartilha tipos, schemas Zod e ORM entre API, Web e Worker com cache incremental e fonte única de verdade (SSOT). |
| **Chain of Responsibility / Pipeline** | `JwtAuthGuard` → `RolesGuard` → `ZodValidationPipe` → `Controller` → `FinancialSanitizerInterceptor` | Separa autenticação, autorização, validação de entrada, lógica de domínio e sanitização de saída em camadas desacopladas. |
| **Princípio da Responsabilidade Única (SRP — SOLID)** | Separação entre `apps/*` (aplicações executáveis) e `packages/*` (bibliotecas de domínio puras) | Permite evoluir banco, precificação e validações de forma independente e testável. |
| **Security by Default (Fail-Closed)** | `APP_GUARD` global com `JwtAuthGuard` em `AppModule` | Toda nova rota nasce protegida por padrão; exposição pública exige intenção explícita via `@Public()`. |
| **Defense in Depth** | `RolesGuard` (bloqueio por rota) + `FinancialSanitizerInterceptor` (filtragem de campos na resposta) | Mesmo que uma rota operacional retorne um objeto contendo custos/margens, o interceptor impede vazamento financeiro. |
