# Referência Técnica — Pacote `@soares/shared`

## 1. Cabeçalho Técnico

- **Caminho no repositório:** `packages/shared/src/` (`index.ts`, `permissions.ts`, `auth.schemas.ts`, `customers.schemas.ts`)
- **Forma de importação:**
  ```ts
  import {
    SYSTEM_NAME,
    PERMISSIONS_CATALOG,
    ROLE_NAMES,
    FINANCIAL_RESTRICTED_ROLES,
    loginSchema,
    verifyPinSchema,
    createCustomerSchema,
    updateCustomerSchema,
    toggleActiveStatusSchema,
    lookupCustomerQuerySchema,
    listCustomersQuerySchema,
    onlyDigits,
    normalizePhoneE164,
    isValidCpfOrCnpj,
    type PermissionKey,
    type RoleName,
    type LoginInput,
    type VerifyPinInput,
    type CreateCustomerInput,
    type ToggleActiveStatusInput,
  } from '@soares/shared';
  ```
- **Issue(s) relacionada(s):** Issue #1 (Workspace Shared), Issue #3 (Contratos Zod de Auth e Catálogo RBAC), Issue #4 (Schemas de CRM, Validação CPF/CNPJ e Normalização E.164), Issue #6 (Consistência de Perfis/Permissões no Seed) e Issue #28 (Desativação Lógica e Permissão `crm.delete`)
- **Responsabilidade:** Centralizar a fonte única de verdade (SSOT) de contratos de validação Zod, catálogo de permissões RBAC e constantes de cargos compartilhados entre `@soares/api`, `@soares/database`, `@soares/pricing-engine`, `@soares/web` e `@soares/worker`.

---

## 2. Visão Geral & Fluxo de Execução

```text
                packages/shared/src/index.ts (Barrel Export)
                     ├── permissions.ts       (Catálogo RBAC + Cargos)
                     ├── auth.schemas.ts      (Contratos Zod de Login e PIN)
                     └── customers.schemas.ts (CPF/CNPJ, E.164 e CRUD CRM)
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
   @soares/api                @soares/database             @soares/web (futuro)
 • @RequirePermissions()    • seed.ts (roles.name        • Validação de formulários
 • RolesGuard                 e roles.permissions)         com o mesmo Zod schema
 • FinancialSanitizer       • dbStatus (SYSTEM_NAME)     • Controle de visibilidade
   Interceptor                                             de menus/botões por
 • ZodValidationPipe                                       PermissionKey
   (loginSchema / verifyPinSchema)
```

Como `packages/shared/package.json` define `"exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }`, qualquer alteração em `packages/shared/src/` fica imediatamente disponível aos demais workspaces sem exigir etapa prévia de empacotamento durante o desenvolvimento.

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo Exportado | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `SYSTEM_NAME` | `const string` | `packages/shared/src/index.ts` | Nome canônico do sistema (`'ERP Gráfica Soares'`). |
| `PERMISSIONS_CATALOG` | `const readonly array` | `packages/shared/src/permissions.ts` | Catálogo tipado (`as const`) das 14 chaves de permissão RBAC com módulo e rótulo em PT-BR. |
| `PermissionKey` | `type` (união literal) | `packages/shared/src/permissions.ts` | União estrita das 14 chaves de `PERMISSIONS_CATALOG`, usada em `@RequirePermissions()` e `RolesGuard`. |
| `ROLE_NAMES` | `const readonly tuple` | `packages/shared/src/permissions.ts` | Lista fixa dos 6 cargos internos da gráfica (`roles.name`). |
| `RoleName` | `type` (união literal) | `packages/shared/src/permissions.ts` | Tipo literal derivado de `ROLE_NAMES`. |
| `FINANCIAL_RESTRICTED_ROLES` | `const readonly string[]` | `packages/shared/src/permissions.ts` | Perfis operacionais de fábrica bloqueados de visualizar valores financeiros no `FinancialSanitizerInterceptor`. |
| `loginSchema` | `ZodObject` | `packages/shared/src/auth.schemas.ts` | Valida e normaliza o payload de `POST /auth/login`. |
| `LoginInput` | `type` (`z.infer`) | `packages/shared/src/auth.schemas.ts` | Tipo TypeScript inferido diretamente de `loginSchema`. |
| `verifyPinSchema` | `ZodObject` | `packages/shared/src/auth.schemas.ts` | Valida e normaliza o payload de `POST /auth/verify-pin`. |
| `VerifyPinInput` | `type` (`z.infer`) | `packages/shared/src/auth.schemas.ts` | Tipo TypeScript inferido diretamente de `verifyPinSchema`. |
| `onlyDigits`, `isValidCpf`, `isValidCnpj`, `isValidCpfOrCnpj`, `normalizePhoneE164` | Funções puras | `packages/shared/src/customers.schemas.ts` | Utilitários de sanitização numérica, dígito verificador (CPF/CNPJ) e normalização telefônica E.164. |
| `phoneE164Schema`, `cpfCnpjSchema` | `ZodEffects` | `packages/shared/src/customers.schemas.ts` | Primitivos reutilizáveis para telefone E.164 (12–15 dígitos) e CPF/CNPJ válido. |
| `customerPhoneInputSchema` / `CustomerPhoneInput` | `ZodObject` / `type` | `packages/shared/src/customers.schemas.ts` | Contrato de cadastro de telefones secundários (`customer_phones`). |
| `customerAddressInputSchema` / `updateCustomerAddressSchema` | `ZodObject` / `type` | `packages/shared/src/customers.schemas.ts` | Contratos de criação e edição parcial de endereços (`customer_addresses`). |
| `createCustomerSchema` / `updateCustomerSchema` | `ZodEffects` / `type` | `packages/shared/src/customers.schemas.ts` | Contratos de criação e atualização parcial de clientes com validação cruzada `PF`/`PJ` ↔ CPF/CNPJ (sem `active`/`deactivatedAt`). |
| `toggleActiveStatusSchema` / `ToggleActiveStatusInput` | `ZodObject` / `type` | `packages/shared/src/customers.schemas.ts` | Contrato dedicado de ativação/desativação lógica (`PATCH /customers/:id/status`). |
| `lookupCustomerQuerySchema` / `listCustomersQuerySchema` | `ZodEffects` / `ZodObject` | `packages/shared/src/customers.schemas.ts` | Contratos de query string para lookup omnichannel (RF02) e listagem paginada do CRM. |

---

## 4. Constantes, Enums e Schemas de Validação

### 4.1 Catálogo de Permissões (`PERMISSIONS_CATALOG`)

| Chave (`PermissionKey`) | Módulo (`module`) | Descrição (`label`) |
| :--- | :--- | :--- |
| `system.all` | Sistema | Acesso irrestrito (Administrador) — ativa bypass no `RolesGuard` e no `FinancialSanitizerInterceptor`. |
| `quote.create` | Comercial | Criar e editar orçamentos. |
| `quote.approve_discount` | Comercial | Autorizar descontos acima da alçada (PIN gerencial no `AuthService.verifyPin`). |
| `crm.manage` | CRM | Cadastrar e editar clientes. |
| `crm.view` | CRM | Visualizar cadastro de clientes. |
| `crm.delete` | CRM | Excluir fisicamente clientes sem vínculo histórico (exclusivo `ADMIN`). |
| `whatsapp.manage` | Atendimento | Atender conversas no WhatsApp. |
| `artwork.manage` | Produção | Subir provas digitais e validar preflight. |
| `production.view` | Produção | Visualizar Kanban da fábrica. |
| `production.update_step` | Produção | Mover OS e apontar etapas. |
| `production.manage` | Produção | Gerenciar prioridades e fila de PCP. |
| `os.view_financial` | Financeiro | Visualizar preços, custos e margens (exigida para não acionar sanitização financeira). |
| `finance.manage` | Financeiro | Gerenciar cobranças, baixas manuais e caixa. |
| `engineering.manage` | Engenharia | Editar máquinas, materiais e tabelas de preço. |

### 4.2 Cargos Internos (`ROLE_NAMES`) e Restrição Financeira (`FINANCIAL_RESTRICTED_ROLES`)

- **`ROLE_NAMES` (`as const`):** `'ADMIN'`, `'GERENTE'`, `'ATENDENTE'`, `'ARTE_FINALISTA'`, `'OPERADOR_MAQUINA'`, `'FINANCEIRO'`.
- **`FINANCIAL_RESTRICTED_ROLES`:** `['OPERADOR_MAQUINA', 'ARTE_FINALISTA']`. Mesmo que uma rota operacional não possua `@RequirePermissions('os.view_financial')`, usuários desses dois cargos sempre têm custos, preços, markups e limites removidos das respostas pelo `FinancialSanitizerInterceptor`.

### 4.3 Schemas Zod de Autenticação (`auth.schemas.ts`)

#### `loginSchema`
| Campo | Regras Zod & Sanitização | Mensagem de Erro | Obrigatório? |
| :--- | :--- | :--- | :--- |
| `email` | `z.string().trim().toLowerCase().email(...)` | `'E-mail inválido'` | Sim |
| `password` | `z.string().min(6, ...)` | `'A senha deve ter no mínimo 6 caracteres'` | Sim |

> **Regra de sanitização:** `.trim().toLowerCase()` garante consistência com `users.email` no PostgreSQL (salvo em minúsculas pelo `seed.ts` e consultado por igualdade exata `eq(users.email, input.email)`).

#### `verifyPinSchema`
| Campo | Regras Zod & Sanitização | Mensagem de Erro | Obrigatório? |
| :--- | :--- | :--- | :--- |
| `pin` | `z.string().trim().regex(/^\d{4,6}$/, ...)` | `'O PIN gerencial deve conter de 4 a 6 dígitos numéricos'` | Sim |
| `managerUserId` | `z.string().uuid().optional()` | Padrão Zod UUID | Não |
| `managerEmail` | `z.string().trim().toLowerCase().email().optional()` | Padrão Zod e-mail | Não |

> **Regra de negócio:** Se `managerUserId` ou `managerEmail` for informado, o `AuthService.verifyPin` valida apenas aquele gerente específico; se ambos forem omitidos, tenta validar contra todos os aprovadores ativos com PIN cadastrado (priorizando o usuário autenticado).

### 4.4 Schemas Zod e Sanitizadores de Clientes (`customers.schemas.ts`)

| Schema / Função | Regras de Sanitização e Validação | Defaults / Observações |
| :--- | :--- | :--- |
| `phoneE164Schema` | `.trim()` → `normalizePhoneE164` (remove não dígitos e zeros à esquerda; prefixa `55` em 10/11 dígitos) → `/^\d{12,15}$/` | Compatível com `customers.whatsapp_phone`, `customer_phones.phone_e164` e webhooks Meta/Evolution. |
| `cpfCnpjSchema` | `.trim()` → `onlyDigits` → `11` ou `14` dígitos → `isValidCpfOrCnpj` (rejeita sequências repetidas e valida dígitos verificadores) | Salva sempre apenas dígitos em `customers.document_cpf_cnpj`. |
| `customerAddressInputSchema` | `addressType` (`ENTREGA\|COBRANCA\|AMBOS`), `zipCode` (`onlyDigits`, exatos 8 dígitos), `state` (`.toUpperCase()` + `/^[A-Z]{2}$/`), `defaultDeliveryFee` (`Number(v).toFixed(2)`, `>= 0`) | Defaults: `addressType: 'AMBOS'`, `defaultDeliveryFee: '0.00'`. |
| `createCustomerSchema` | Campos de `customers` + arrays opcionais `phones` e `addresses` + `.superRefine` cruzando `personType` (`PF` = 11 dígitos; `PJ` = 14 dígitos) | Defaults: `billingType: 'AVISTA'`, `creditLimit: '0.00'`, `phones: []`, `addresses: []`. |
| `updateCustomerSchema` | Todos os campos opcionais + `.superRefine` validando `personType` ↔ `documentCpfCnpj` quando ambos são enviados; omite intencionalmente `active`/`deactivatedAt` | Usado em `PATCH /customers/:id`. |
| `toggleActiveStatusSchema` | `active: z.boolean(...)` obrigatório com mensagens customizadas (`required_error`, `invalid_type_error`) | Usado exclusivamente em `PATCH /customers/:id/status`. |
| `lookupCustomerQuerySchema` | `phone` (`normalizePhoneE164`, opcional) e `document` (`onlyDigits`, opcional) + `.refine` exigindo ao menos um dos dois | Usado em `GET /customers/lookup` (RF02). |
| `listCustomersQuerySchema` | `search` (opcional), `personType`, `billingType`, `page` (`z.coerce.number().int().min(1)`), `limit` (`min(1).max(100)`), `includeInactive` (`boolean \| 'true' \| 'false'` → `boolean`) | Defaults: `page: 1`, `limit: 20`, `includeInactive: false`. |

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

Este pacote não contém classes com estado nem dependências de framework (NestJS/React/Drizzle), expondo exclusivamente **constantes imutáveis**, **schemas Zod** e **tipos TypeScript puros**.

### 5.1 `loginSchema` e `LoginInput`

- **Assinatura exata:**
  ```ts
  export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  });

  export type LoginInput = z.infer<typeof loginSchema>;
  ```
- **O que faz:** Valida o corpo de autenticação de colaboradores internos e já devolve o `email` normalizado (sem espaços nas extremidades e em letras minúsculas).
- **Como implementar (exemplo real em `apps/api/src/modules/auth/auth.controller.ts`):**
  ```ts
  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.authService.login(body);
  }
  ```
- **Exceções / Status HTTP:** Quando usado com `ZodValidationPipe`, falhas de validação disparam `400 Bad Request` no formato `{ message: 'Erro de validação nos dados enviados', errors: { email?: string[], password?: string[] } }`.

### 5.2 `verifyPinSchema` e `VerifyPinInput`

- **Assinatura exata:**
  ```ts
  export const verifyPinSchema = z.object({
    pin: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, 'O PIN gerencial deve conter de 4 a 6 dígitos numéricos'),
    managerUserId: z.string().uuid().optional(),
    managerEmail: z.string().trim().toLowerCase().email().optional(),
  });

  export type VerifyPinInput = z.infer<typeof verifyPinSchema>;
  ```
- **O que faz:** Garante que o PIN gerencial contenha estritamente entre 4 e 6 dígitos numéricos (`^\d{4,6}$`) antes de acionar derivação criptográfica `scrypt` no banco, evitando processamento desnecessário com entradas malformadas.
- **Como implementar (exemplo real em `apps/api/src/modules/auth/auth.controller.ts`):**
  ```ts
  @Post('verify-pin')
  verifyPin(
    @Body(new ZodValidationPipe(verifyPinSchema)) body: VerifyPinInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.verifyPin(body, user);
  }
  ```
- **Exceções / Status HTTP:** `400 Bad Request` via `ZodValidationPipe` se `pin`, `managerUserId` ou `managerEmail` forem inválidos.

### 5.3 `PermissionKey` e `PERMISSIONS_CATALOG`

- **Assinatura exata:**
  ```ts
  export type PermissionKey = (typeof PERMISSIONS_CATALOG)[number]['key'];
  ```
- **O que faz:** Converte em tempo de compilação qualquer typo em `@RequirePermissions('...')` em erro TypeScript (`TS2345`), eliminando falhas silenciosas de autorização em produção.
- **Como implementar (exemplo real em `apps/api/src/modules/auth/auth.controller.ts`):**
  ```ts
  @Get('test/financial-preview')
  @RequirePermissions('os.view_financial')
  financialPreview() { ... }
  ```
- **Exceções / Status HTTP:** Em runtime, ausência da chave no `request.user.permissions` resulta em `403 Forbidden` pelo `RolesGuard`.

---

## 6. Receita Rápida: Como Estender este Módulo

### 6.1 Como adicionar uma nova permissão RBAC

1. Adicione o novo objeto ao array `PERMISSIONS_CATALOG` em `packages/shared/src/permissions.ts` seguindo o padrão `<dominio>.<acao>`:
   ```ts
   { key: 'quotes.export_pdf', module: 'Comercial', label: 'Exportar proposta em PDF' },
   ```
2. Automaticamente, `PermissionKey` passará a aceitar `'quotes.export_pdf'` em todos os decorators `@RequirePermissions(...)`.
3. Atualize o mapa `permissions` dos perfis correspondentes em `packages/database/src/seed.ts` (e atualize os registros existentes no banco em ambientes já populados).
4. Rode `pnpm.cmd typecheck` para validar todo o monorepo.

### 6.2 Como adicionar um novo arquivo de schemas Zod (ex.: CRM / Clientes)

1. Crie `packages/shared/src/crm.schemas.ts` exportando os schemas (`createCustomerSchema`, etc.) e os tipos inferidos (`export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;`).
2. Reexporte em `packages/shared/src/index.ts`:
   ```ts
   export * from './crm.schemas';
   ```
3. Consuma o schema diretamente no `ZodValidationPipe` do controller da API e nos formulários do `@soares/web`.

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **Nunca importe `@nestjs/*` ou `drizzle-orm` dentro de `@soares/shared`:** Este pacote também é importado pelo `@soares/web` (browser/Next.js). Mantê-lo dependente apenas de `zod` evita erros de bundle no frontend e dependências circulares.
2. **Não remova `as const` de `PERMISSIONS_CATALOG` e `ROLE_NAMES`:** Sem `as const`, o TypeScript alarga `PermissionKey` e `RoleName` para `string`, destruindo o autocomplete e a proteção contra typos nos controllers.
3. **Ordem de encadeamento no Zod (`.trim().toLowerCase().email()`):** Coloque `.trim()` **antes** de `.email()` e `.regex(...)`; caso contrário, um espaço acidental no final do e-mail ou PIN fará a validação falhar antes de limpar a string.
4. **Atenção à versão do `zod` entre `@soares/shared` e `@soares/api`:** Ambos usam `zod@^3.24.1` para garantir que `ZodSchema` em `ZodValidationPipe` seja 100% compatível com os schemas exportados por `@soares/shared`.

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado | Benefício Arquitetural |
| :--- | :--- | :--- |
| **Single Source of Truth (SSOT)** | `PERMISSIONS_CATALOG`, `loginSchema`, `verifyPinSchema` | Elimina duplicação de regras de validação entre backend (NestJS) e frontend (Next.js) e evita divergência de nomes de permissões. |
| **Design by Contract & Parse, Don't Validate** | `z.infer<typeof ...>` + transformações `.trim()`/`.toLowerCase()` | O dado validado entra na camada de serviço já normalizado e fortemente tipado, reduzindo código defensivo repetitivo. |
| **Type-Level Programming (`as const` + Indexed Access)** | `PermissionKey = (typeof PERMISSIONS_CATALOG)[number]['key']` | Deriva tipos estáticos diretamente de metadados de runtime, garantindo sincronia permanente entre UI de permissões e Guards. |
| **RBAC (Role-Based Access Control)** | `ROLE_NAMES` + `PERMISSIONS_CATALOG` + `FINANCIAL_RESTRICTED_ROLES` | Modela o controle de acesso baseado em cargos internos com granularidade por capacidade (`capability-based permissions`). |
