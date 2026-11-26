# Referência Técnica — Pacote `@soares/database`

## 1. Cabeçalho Técnico

- **Caminho no repositório:** `packages/database/` (`drizzle.config.ts`, `src/index.ts`, `src/env.ts`, `src/client.ts`, `src/seed.ts`, `src/schema/{index.ts, core.ts, crm.ts, engineering.ts, relations.ts}`)
- **Forma de importação:**
  ```ts
  import {
    db,
    queryClient,
    roles,
    users,
    customers,
    machines,
    materials,
    eq,
    and,
    isNotNull,
    type Database,
    type RolePermissions,
  } from '@soares/database';
  ```
- **Issue(s) relacionada(s):** Issue #2 (Modelagem Drizzle Bloco 1.1, Índices e Migrations), Issue #5 (Soft Deactivation em Engenharia e `engineering.delete`), Issue #6 (Seed Idempotente da Gráfica Soares) e Issue #28 (Desativação Lógica em `customers` e Permissão `crm.delete`)
- **Responsabilidade:** Encapsular o acesso ao PostgreSQL via Drizzle ORM (`postgres-js`), definindo as 10 tabelas fundamentais do Bloco 1.1, suas relações de consulta, migrations versionadas em SQL e o script de carga inicial idempotente.

---

## 2. Visão Geral & Fluxo de Execução

```text
                      .env.development / .env (raiz do monorepo)
                                      │
                                      ▼
                     packages/database/src/env.ts
                  (findRepoRoot -> process.loadEnvFile)
                     │                               │
                     ▼                               ▼
     packages/database/drizzle.config.ts    packages/database/src/client.ts
     • CLI drizzle-kit generate / migrate   • queryClient = postgres(url, { prepare: false, max: 10 })
     • out: '.drizzle'                      • db = drizzle(queryClient, { schema })
                                                     │
                                                     ▼
                                     packages/database/src/index.ts
                             (reexporta drizzle-orm + client + schema/*)
                                     │                           │
                                     ▼                           ▼
                          apps/api (DatabaseModule)     packages/database/src/seed.ts
                          • @Inject(DRIZZLE_DB)         • UUIDs determinísticos (IDS)
                          • queries tipadas em runtime  • hash scrypt + onConflictDoNothing()
```

### Grafo das 10 Tabelas do Bloco 1.1 (`src/schema/`)

```text
Domínio 1 (core.ts)              Domínio 2 (crm.ts)
[roles] 1 ── N [users] 1 ── N [customers] N ── 1 [price_tables]
                                  ├── 1:N ── [customer_phones]    (CASCADE)
                                  └── 1:N ── [customer_addresses] (CASCADE)

Domínio 4 (engineering.ts)
[machines] 1 ── N [finishing_services]   (default_supplier_id nullable -> Fase 2)
     │
     └── 1:N ── [product_templates] N ── 1 [materials]
```

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo Exportado | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `db` | Instância `PostgresJsDatabase<typeof schema>` | `packages/database/src/client.ts` | Cliente Drizzle principal com tipagem de todas as tabelas e relations. |
| `queryClient` | Instância `postgres.Sql` | `packages/database/src/client.ts` | Pool de conexões `postgres-js` (`prepare: false`, `max: 10`); usado no `seed.ts` para `queryClient.end()`. |
| `Database` | `type` (`typeof db`) | `packages/database/src/client.ts` | Tipo injetado nos services da API via `@Inject(DRIZZLE_DB) db: Database`. |
| `getRequiredEnv` | Função | `packages/database/src/env.ts` | Lê variável de ambiente obrigatória (com `.trim()`) ou lança erro explícito. |
| `dbStatus` | `const string` | `packages/database/src/index.ts` | Referência de smoke-check apontando para `SYSTEM_NAME` (`@soares/shared`). |
| `RolePermissions` | `type` | `packages/database/src/schema/core.ts` | `Record<string, boolean \| number>` tipando a coluna `JSONB` `roles.permissions`. |
| `roles`, `users` | Tabelas Drizzle (`pgTable`) | `packages/database/src/schema/core.ts` | Domínio 1: cargos RBAC e equipe interna (com senha/PIN/alçada). |
| `priceTables`, `customers`, `customerPhones`, `customerAddresses` | Tabelas Drizzle (`pgTable`) | `packages/database/src/schema/crm.ts` | Domínio 2: tabelas de preço, CRM fiscal (sem login/senha), telefones E.164 e endereços. |
| `machines`, `materials`, `finishingServices`, `productTemplates` | Tabelas Drizzle (`pgTable`) | `packages/database/src/schema/engineering.ts` | Domínio 4: equipamentos, insumos, acabamentos e gabaritos gráficos. |
| `*Relations` (10 exports) | Relations Drizzle | `packages/database/src/schema/relations.ts` | Habilitam queries relacionais (`db.query.*.findMany({ with: ... })`) nos dois sentidos (`one` e `many`). |
| Operadores `eq`, `and`, `isNotNull`, `sql`, etc. | Reexport (`drizzle-orm`) | `packages/database/src/index.ts` | Evita que `apps/api` e `apps/worker` precisem declarar `drizzle-orm` diretamente para montar filtros. |

---

## 4. Constantes, Enums e Schemas de Validação

### 4.1 Variáveis de Conexão e Configuração do Pool

- **`client.ts` (runtime da API e `seed.ts`):** utiliza `process.env.DATABASE_URL?.trim() || getRequiredEnv('SUPABASE_TRANSACTION_POOLER')` (Transaction Pooler na porta `6543`, compatível com IPv4). Quando a URL aponta para `supabase.com`, ativa automaticamente `ssl: 'require'`.
- **`drizzle.config.ts` (CLI `drizzle-kit generate` / `migrate`):** utiliza `process.env.DIRECT_URL?.trim() || getRequiredEnv('SUPABASE_DIRECT_CONNECTION')` (Session Pooler na porta `5432`, evitando falhas de `ENOTFOUND` em redes IPv4 contra o host IPv6-only `db.<ref>.supabase.co`).
- **Alternativa local via Docker:** basta apontar `DATABASE_URL` e `DIRECT_URL` para `LOCAL_DATABASE_URL` (`postgresql://soares:soares_dev_password@localhost:5432/erp_grafica_soares`).
- **Opções do driver `postgres-js`:**
  - `prepare: false` — obrigatório para compatibilidade com PgBouncer / Supabase Transaction Pooler em modo transação.
  - `max: 10` — limita o pool de conexões simultâneas por instância.

### 4.2 Constraints `CHECK`, Índices e Padrões de Coluna

| Tabela | Colunas-Chave / Precisão | Constraints `CHECK` e Índices |
| :--- | :--- | :--- |
| `roles` | `id` UUID PK, `name` `UNIQUE`, `permissions` `JSONB` (default `{}`) | `roles_name_unique` |
| `users` | `email` `UNIQUE`, `password_hash`, `approval_pin_hash`, `max_discount_pct` `NUMERIC(5,2)`, `commission_pct` `NUMERIC(5,2)`, `active` default `true` | FK `role_id -> roles.id` |
| `price_tables` | `name` `UNIQUE`, `markup_multiplier` `NUMERIC(6,4)` default `'1.0000'`, `default_discount_pct` `NUMERIC(5,2)` default `'0.00'`, `active` default `true`, `deactivated_at` `TIMESTAMPTZ` | `price_tables_name_unique` |
| `customers` | `document_cpf_cnpj` `VARCHAR(14) UNIQUE`, `whatsapp_phone` `NOT NULL`, `billing_type` default `'AVISTA'`, `credit_limit` `NUMERIC(12,2)`, `active` `BOOLEAN` default `true`, `deactivated_at` `TIMESTAMPTZ` | `CHECK person_type IN ('PF', 'PJ')`, `CHECK billing_type in ('AVISTA', 'FATURADO_MENSAL')`, índices `idx_customers_whatsapp_phone` e `idx_customers_active` |
| `customer_phones` | `phone_e164` `VARCHAR(20) UNIQUE`, `customer_id` (`ON DELETE CASCADE`) | Índice `idx_customer_phones_e164` |
| `customer_addresses` | `address_type` default `'AMBOS'`, `state` `CHAR(2)`, `default_delivery_fee` `NUMERIC(10,2)`, `customer_id` (`ON DELETE CASCADE`) | `CHECK address_type IN ('ENTREGA', 'COBRANCA', 'AMBOS')` |
| `machines` | `unit_cost` `NUMERIC(10,4)`, `setup_cost` `NUMERIC(10,2)`, `max_width_mm`, `max_height_mm`, `gripper_margin_mm` default `10`, `current_odometer` `BIGINT` (`mode: 'number'`), `active` default `true`, `deactivated_at` `TIMESTAMPTZ` | `CHECK sector IN ('PRE_IMPRESSAO', 'DIGITAL', 'OFFSET', 'COM_VISUAL', 'ACABAMENTO')`, `CHECK billing_unit IN ('CLIQUE', 'HORA', 'M2')` |
| `materials` | `sku` `UNIQUE`, `conversion_factor` / `unit_cost` / `stock_qty` / `min_stock_qty` em `NUMERIC(12,4)`, `active` default `true`, `deactivated_at` `TIMESTAMPTZ` | `CHECK category IN ('PAPEL', 'LONA_VINIL', 'CHAPA_RIGIDA', 'TINTA_INSUMO', 'EMBALAGEM')` |
| `finishing_services` | `setup_cost` `NUMERIC(10,2)`, `unit_cost` `NUMERIC(10,4)`, `default_supplier_id` UUID nullable **sem FK** (preparado para Fase 2), `active` default `true`, `deactivated_at` `TIMESTAMPTZ` | `CHECK calc_basis IN ('POR_UNIDADE', 'POR_FOLHA', 'POR_M2', 'FIXO_SETUP')` |
| `product_templates` | `default_width_mm`, `default_height_mm`, `bleed_mm` default `3`, `spacing_mm` default `2`, `active` default `true`, `deactivated_at` `TIMESTAMPTZ` | `CHECK category IN ('DIGITAL', 'OFFSET', 'COM_VISUAL')` |

### 4.3 Variáveis e Dados do Seed Idempotente (`src/seed.ts`)

| Variável de Ambiente | Fallback de Desenvolvimento | Uso |
| :--- | :--- | :--- |
| `SEED_ADMIN_NAME` | `'Luis Fernando Soares'` | Nome do usuário administrador inicial. |
| `SEED_ADMIN_EMAIL` | `'admin@graficasoares.com.br'` | E-mail de login (normalizado com `.toLowerCase()`). |
| `SEED_ADMIN_PASSWORD` | `'Admin@Soares2026'` | Senha inicial convertida em hash `scrypt`. |
| `SEED_ADMIN_PIN` | `'1234'` | PIN gerencial inicial convertido em hash `scrypt`. |

**Volume populado pelo `seed.ts` (com UUIDs determinísticos `IDS`):**
- **6 `roles`**: `ADMIN`, `GERENTE`, `ATENDENTE`, `ARTE_FINALISTA`, `OPERADOR_MAQUINA`, `FINANCEIRO` (`10000000-...`)
- **1 `users`**: Administrador inicial com `maxDiscountPct: '100.00'` (`20000000-...`)
- **3 `price_tables`**: Balcão (`1.0000`), Agência/Revenda (`0.8200`), Corporativo (`0.9200` + `5.00%` desc.) (`30000000-...`)
- **4 `machines`**: Epson WF-C5390, Konica Minolta C360i, Guilhotina Industrial, Plotter Eco-Solvente 1600mm (`40000000-...`)
- **12 `materials`**: Papéis Couchê/Offset/Supremo/Adesivo, Vinil, Lona 440g e BOPP Fosco (`50000000-...`)
- **6 `finishing_services`**: Laminação Fosca, Refile em Guilhotina, Vinco/Dobra, Ilhós, Solda/Bainha, Cantos Arredondados (`60000000-...`)
- **5 `product_templates`**: Cartão de Visita 90x50mm, Flyer A5, Banner Lona 440g, Adesivo Vinil, Papel Timbrado A4 (`70000000-...`)

### 4.4 Migrations Versionadas (`packages/database/.drizzle/`)

1. `0000_init_core_crm_engineering.sql` — Criação das 10 tabelas, PKs UUID, FKs, `CHECK`s e `idx_customers_whatsapp_phone`.
2. `0001_fix_column_typos.sql` — `RENAME COLUMN` (`max_dicount_pct` → `max_discount_pct`, `comission_pct` → `commission_pct`, `max_heigth_mm` → `max_height_mm`) e correção de aspas em `customer_addresses_type_check`.
3. `0002_add_customer_phones_index.sql` — Criação do índice `idx_customer_phones_e164`.
4. `0003_add_customers_soft_deactivation.sql` — Adição de `active` (`DEFAULT true NOT NULL`), `deactivated_at` (`TIMESTAMPTZ`) e índice `idx_customers_active` na tabela `customers`.
5. `0004_add_engineering_soft_deactivation.sql` — Adição de `deactivated_at` em `price_tables`, `machines`, `materials`, `finishing_services` e `product_templates`, adição de `active` em `product_templates`, default `'1.0000'` em `price_tables.markup_multiplier` e padronização de `machines_sector_check` para `'PRE_IMPRESSAO'`.

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

### 5.1 `getRequiredEnv(name: string): string` (`src/env.ts`)

- **Assinatura exata:**
  ```ts
  export function getRequiredEnv(name: string): string
  ```
- **O que faz:** Garante que `.env.development` / `.env` da raiz (descoberta via `findRepoRoot` procurando `pnpm-workspace.yaml`) foram carregados e retorna `process.env[name]?.trim()`.
- **Como implementar (exemplo real em `src/client.ts`):**
  ```ts
  const databaseUrl =
    process.env.DATABASE_URL?.trim() || getRequiredEnv('SUPABASE_TRANSACTION_POOLER');
  ```
- **Exceções:** Lança `Error('Variável de ambiente obrigatória não definida: <name>')` imediatamente na subida da aplicação (Fail-Fast).

### 5.2 `db` e `queryClient` (`src/client.ts`)

- **Assinatura exata:**
  ```ts
  export const queryClient = postgres(databaseUrl, {
    prepare: false,
    max: 10,
    ...(databaseUrl.includes('supabase.com') ? { ssl: 'require' } : {}),
  });

  export const db = drizzle(queryClient, { schema });
  export type Database = typeof db;
  ```
- **O que faz:** Disponibiliza tanto o Query Builder SQL (`db.select().from(...)`) quanto a Relational Query API (`db.query.customers.findMany({ with: { phones: true, addresses: true } })`).
- **Como implementar (exemplo real em `apps/api/src/modules/auth/auth.service.ts`):**
  ```ts
  const [userRecord] = await this.db
    .select({ id: users.id, email: users.email, roleName: roles.name, permissions: roles.permissions })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, input.email))
    .limit(1);
  ```
- **Exceções:** `AggregateError` (`ECONNREFUSED`) se o PostgreSQL estiver inacessível; `PostgresError` (ex.: código `23505` unique violation, `23514` check violation, `23503` foreign key violation).

### 5.3 `hashSecret` e `seed()` (`src/seed.ts`)

- **Assinatura exata:**
  ```ts
  function hashSecret(plainText: string): string
  async function seed(): Promise<void>
  ```
- **O que faz:** `hashSecret` gera salt aleatório de 16 bytes e deriva chave de 64 bytes com `scryptSync`, retornando `scrypt:<saltHex>:<derivedKeyHex>` (mesmo formato validado por `PasswordService.verify` na API). `seed()` insere os 7 grupos de dados base usando UUIDs fixos em `IDS` + `.onConflictDoNothing()`, encerrando o pool com `await queryClient.end()` no bloco `.finally()`.
- **Como executar:**
  ```powershell
  pnpm.cmd db:seed
  ```
- **Exceções:** Em caso de erro, loga em `console.error`, define `process.exitCode = 1` e ainda fecha o pool de conexões no `.finally()` para não travar o processo Node.

---

## 6. Receita Rápida: Como Estender este Módulo

### Como adicionar uma nova tabela (ex.: `1.3 audit_logs` ou Domínio 3 `wa_conversations`)

1. **Crie ou edite o arquivo de domínio** em `packages/database/src/schema/` (os marcadores `// 1.3 audit_logs`, `// 2.5 customer_contacts`, `// 4.5 suppliers` já indicam o ponto exato).
2. **Adicione as relações bidirecionais** (`one` / `many`) em `packages/database/src/schema/relations.ts`.
3. **Se criou um novo arquivo de domínio** (ex.: `whatsapp.ts`), reexporte-o em `packages/database/src/schema/index.ts`.
4. **Gere e aplique a migration SQL:**
   ```powershell
   pnpm.cmd --filter @soares/database db:generate --name add_audit_logs
   pnpm.cmd db:migrate
   ```
5. **Valide os tipos em todo o monorepo:**
   ```powershell
   pnpm.cmd typecheck
   ```

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **Nunca use `Float` / `doublePrecision` para dinheiro ou custos unitários:** O projeto adota `numeric(..., { precision, scale })` (que retorna `string` no Drizzle) — `scale: 4` para custos unitários de clique/folha/$m^2$ e `scale: 2` para totais financeiros — eliminando erros de ponto flutuante IEEE-754 em tiragens altas.
2. **Sempre mantenha `prepare: false` no `postgres-js`:** Sem isso, ao alternar para o Transaction Pooler do Supabase (PgBouncer porta `6543`), consultas subsequentes falham com erro de *prepared statement already exists*.
3. **`machines_sector_check` padronizado sem acento (`'PRE_IMPRESSAO'`):** A migration `0004` corrigiu o antigo valor `'PRE_IMPRESSÃO'` para `'PRE_IMPRESSAO'`, garantindo alinhamento total com `machineSectorEnum` em `@soares/shared`.
4. **Idempotência no `seed.ts`:** Como tabelas como `machines` e `finishing_services` não possuem `UNIQUE` em `name`, a idempotência depende dos **UUIDs determinísticos** em `IDS` combinados com `.onConflictDoNothing()`. Nunca troque esses UUIDs por `defaultRandom()` dentro do seed.
5. **Compatibilidade CommonJS + ESM em `env.ts`:** Evite `import.meta.url` dentro de `packages/database/src/`, pois o pacote é importado em formato `.ts` diretamente pelo `@soares/api` (`CommonJS`). Use `findRepoRoot` baseado em `__dirname` / `process.cwd()`.

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado | Benefício Arquitetural |
| :--- | :--- | :--- |
| **Schema-as-Code & Versioned Migrations** | `src/schema/*.ts` + `.drizzle/*.sql` | Rastreabilidade completa da evolução do banco em Git, reprodutibilidade entre máquinas e validação de tipos em tempo de compilação. |
| **Idempotência de Carga Inicial** | `src/seed.ts` (`IDS` determinísticos + `ON CONFLICT DO NOTHING`) | Permite reexecutar `pnpm db:seed` em CI/CD ou deploy sem duplicar registros nem corromper dados já alterados. |
| **Separação Equipe vs. Cliente** | `users` (com `password_hash`/`approval_pin_hash`) isolado de `customers` (sem colunas de autenticação) | Reduz superfície de ataque e respeita a fronteira arquitetural do ERP interno (portal futuro ficará isolado em `customer_auth_accounts`). |
| **Evolução Aditiva (Zero-Breaking Schema)** | `finishing_services.default_supplier_id` nullable sem FK até a Fase 2 | Permite desenvolver o MVP completo sem reescrever tabelas quando o módulo de fornecedores/compras entrar. |
| **Fail-Fast Configuration** | `getRequiredEnv(name)` | Falha imediatamente na inicialização se uma credencial estiver ausente, evitando erros tardios em runtime. |
