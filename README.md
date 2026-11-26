# ERP / MIS Gráfica Soares (`erp-grafica-soares`)

Sistema interno de gestão gráfica (MIS/ERP) desenvolvido em monorepo TypeScript com **atendimento omnichannel via WhatsApp**, **motor puro de imposição e precificação multi-tiragem**, **cobrança modular** e **controle de produção (PCP)**.

---

## Stack Tecnológica

| Camada | Tecnologia | Workspace |
| :--- | :--- | :--- |
| **Monorepo & Build** | `pnpm` Workspaces + `Turborepo` | Raiz (`@soares/*`) |
| **Contratos & RBAC** | TypeScript + `Zod` | `@soares/shared` |
| **Banco de Dados** | PostgreSQL 16 (Supabase / Docker) + `Drizzle ORM` (`postgres-js`) | `@soares/database` |
| **Motor de Cálculo** | TypeScript puro + `Vitest` | `@soares/pricing-engine` |
| **API REST & Auth** | `NestJS 10` + `Passport JWT` + `Swagger/OpenAPI` | `@soares/api` |
| **Frontend Web** | `Next.js` (App Router) *(Issue #7+)* | `@soares/web` |
| **Filas & Webhooks** | `BullMQ` + `Redis 7` *(Issue #10+)* | `@soares/worker` |

---

## Estrutura do Monorepo

```text
erp-grafica-soares/
├── apps/
│   ├── api/                 # API REST NestJS (Auth/RBAC, CRM, Engenharia, etc.)
│   ├── web/                 # Painel Web Next.js (3 Shells + rotas públicas tokenizadas)
│   └── worker/              # Workers assíncronos BullMQ (WhatsApp, mídia, PDFs, pagamentos)
├── packages/
│   ├── shared/              # Catálogo RBAC, permissões e schemas Zod compartilhados
│   ├── database/            # Schemas Drizzle, relations, migrations SQL e seed idempotente
│   └── pricing-engine/      # Motor puro de imposição geométrica e composição de custos
├── design/                  # Assets visuais e layouts de impressão (brand / pdf-layouts)
├── docs/
│   ├── specs/               # Requisitos (RF/RN/RNF) e Casos de Uso (UC01–UC25)
│   ├── architecture/        # Mapeamento de telas/shells do MVP e decisões arquiteturais
│   ├── database/            # Dicionário completo das 38 tabelas (dicionario-de-dados.md)
│   └── code-reference/      # Referência técnica detalhada (7 seções por módulo/pacote)
└── docker-compose.yml       # PostgreSQL 16 + Redis 7 para ambiente offline/local
```

---

## Pré-requisitos

- **Node.js** `>= 20.0.0` (recomendado Node 22+ com suporte nativo a `process.loadEnvFile`)
- **pnpm** `>= 9.0.0` (testado com `pnpm v12.21.0`; no Windows PowerShell use `pnpm.cmd` se scripts `.ps1` estiverem restritos)
- **Conta Supabase** (PostgreSQL gerenciado) **ou** **Docker Desktop** para rodar PostgreSQL + Redis localmente

---

## Setup e Execução Local

### 1. Instalar dependências do monorepo

```powershell
pnpm.cmd install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env.development` na raiz do repositório e preencha as credenciais:

- **Banco Supabase (padrão atual em `packages/database`):**
  - `DATABASE_URL` / `SUPABASE_TRANSACTION_POOLER`: conexão **Transaction Pooler** (porta `6543`, IPv4) usada pela API em runtime (`prepare: false`).
  - `DIRECT_URL` / `SUPABASE_DIRECT_CONNECTION`: conexão **Session Pooler** (porta `5432`, IPv4) usada pelo `drizzle-kit` para migrations.
- **Alternativa offline com Docker (`docker-compose.yml`):**
  - Suba os containers com `pnpm.cmd docker:up` (Postgres na porta `5432` com banco `erp_grafica_soares` + Redis na porta `6379`) e configure `DATABASE_URL` / `DIRECT_URL` para `LOCAL_DATABASE_URL` (`postgresql://soares:soares_dev_password@localhost:5432/erp_grafica_soares`).
- **API & Seed:** configure `API_PORT` (padrão `3333`), `JWT_SECRET`, `JWT_EXPIRES_IN` (`12h`) e, opcionalmente, `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` e `SEED_ADMIN_PIN`.

### 3. Aplicar Migrations e Popular o Banco (Seed Idempotente)

```powershell
pnpm.cmd db:migrate
pnpm.cmd db:seed
```

> Credenciais padrão do seed em desenvolvimento: `admin@graficasoares.com.br` / `Admin@Soares2026` (PIN gerencial: `1234`).

### 4. Subir a API em Desenvolvimento

```powershell
pnpm.cmd --filter @soares/api dev
```

- **API REST:** `http://localhost:3333` (`GET /health`)
- **Swagger / OpenAPI:** `http://localhost:3333/docs`

### 5. Comandos Úteis do Monorepo

| Comando | O que executa |
| :--- | :--- |
| `pnpm.cmd dev` | Sobe os workspaces com script `dev` via Turborepo |
| `pnpm.cmd typecheck` | Valida TypeScript (`tsc --noEmit`) nos 6 workspaces |
| `pnpm.cmd build` | Compila os workspaces respeitando dependências topológicas |
| `pnpm.cmd test` | Executa a suíte de testes (`Vitest` em `@soares/pricing-engine`) |
| `pnpm.cmd db:generate -- --name <nome>` | Gera nova migration SQL em `packages/database/.drizzle/` |
| `pnpm.cmd db:migrate` | Aplica migrations pendentes no PostgreSQL |
| `pnpm.cmd db:seed` | Popula cargos RBAC, admin inicial, tabelas de preço, máquinas, insumos, acabamentos e gabaritos |
| `pnpm.cmd docker:up` / `docker:down` | Sobe ou encerra PostgreSQL 16 e Redis 7 locais |

---

## Documentação do Projeto (`docs/`)

- **Especificação de Requisitos:** [docs/specs/requisitos.md](docs/specs/requisitos.md)
- **Casos de Uso (UC01–UC25):** [docs/specs/casos-de-uso.md](docs/specs/casos-de-uso.md)
- **Telas, Shells e Layouts PDF do MVP:** [docs/architecture/telas-e-shells-mvp.md](docs/architecture/telas-e-shells-mvp.md)
- **Dicionário de Dados (38 tabelas):** [docs/database/dicionario-de-dados.md](docs/database/dicionario-de-dados.md)
- **Referência Técnica do Código:** [docs/code-reference/00-guia-arquitetura-fluxo.md](docs/code-reference/00-guia-arquitetura-fluxo.md)

---

## Status das Entregas

- **Issue #1:** Fundação do Monorepo (`pnpm` + `Turborepo`), Docker Compose (`postgres` + `redis`) e pacotes base — **Concluída**
- **Issue #2:** Schema Drizzle Bloco 1.1 (10 tabelas), índices, relations e migrations iniciais — **Concluída**
- **Issue #3:** Núcleo NestJS, Swagger `/docs`, Auth JWT (`scrypt` + `verify-pin`), RBAC (`RolesGuard`) e `FinancialSanitizerInterceptor` — **Concluída**
- **Issue #4 & #28:** Módulo CRM Interno (`/customers`, lookup E.164/CPF-CNPJ, sub-recursos, soft deactivation `active`/`deactivated_at`, reativação automática e `crm.delete`) — **Concluída**
- **Issue #5:** Módulo Engenharia Gráfica (`/engineering/*`: tabelas de preço, máquinas + hodômetro, materiais + cálculo `purchasePrice / conversionFactor` + ajuste de estoque, acabamentos, gabaritos e `engineering.delete`) — **Concluída**
- **Issue #6:** Seed idempotente com UUIDs determinísticos e 6 perfis RBAC — **Concluída**
- **Próximas etapas:** Front-end Next.js (`@soares/web` — Issue #7) e primeiro deploy (Supabase + API + Web)
