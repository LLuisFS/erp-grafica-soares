# Referência Técnica — Módulo de CRM Interno & Clientes (`CustomersModule`)

## 1. Cabeçalho Técnico

- **Caminho no repositório:** `apps/api/src/modules/customers/` (`customers.module.ts`, `customers.service.ts`, `customers.controller.ts`)
- **Forma de importação (interna em `apps/api/src/`):**
  ```ts
  import { CustomersModule } from './modules/customers/customers.module';
  import { CustomersService, type LookupMatchSource } from './modules/customers/customers.service';
  ```
- **Issue(s) relacionada(s):** Issue #4 (CRM Interno Fiscal, Deduplicação por Telefone/CPF-CNPJ e Lookup Omnichannel para WhatsApp)
- **Responsabilidade:** Gerenciar o cadastro fiscal e comercial completo de clientes (`customers`), telefones secundários (`customer_phones`) e endereços (`customer_addresses`) sem credenciais de login (RN02), oferecendo lookup rápido E.164/documento para o atendimento WhatsApp (RF02).

---

## 2. Visão Geral & Fluxo de Execução

### 2.1 Fluxo de Lookup Omnichannel (`GET /customers/lookup`)

```text
  GET /customers/lookup?phone=(61) 99999-8888&document=11.222.333/0001-81
        │
        ▼
  JwtAuthGuard ──► RolesGuard (@RequirePermissions('crm.view') — aceita crm.manage via herança)
        │
        ▼
  ZodValidationPipe(lookupCustomerQuerySchema)
  • phone    -> normalizePhoneE164 -> '5561999998888'
  • document -> onlyDigits         -> '11222333000181'
        │
        ▼
  CustomersService.lookup(query)
    ├── 1º Busca exata em customers.whatsapp_phone   ──► matchedBy = 'WHATSAPP_PRIMARY'
    ├── 2º Busca exata em customer_phones.phone_e164 ──► matchedBy = 'SECONDARY_PHONE'
    ├── 3º Busca exata em customers.document_cpf_cnpj──► matchedBy = 'DOCUMENT'
    ├── Se nenhum match                              ──► 404 NotFoundException
    └── Carrega findById(customerId) + calcula isNewPhoneCustomer
                                                      ──► { matchedBy, isNewPhoneCustomer, customer }
```

### 2.2 Fluxo de Criação Transacional (`POST /customers`)

```text
  POST /customers { personType, name, whatsappPhone, phones?, addresses? }
        │
        ▼
  RolesGuard (@RequirePermissions('crm.manage')) ──► ZodValidationPipe(createCustomerSchema)
        │
        ▼
  CustomersService.create(body, user.id)
    ├─► Valida unicidade de documento e telefones (409 Conflict com existingCustomer)
    ├─► Resolve priceTableId (informado ou getDefaultPriceTableId -> primeira tabela ativa)
    ├─► db.transaction(async (tx) => ...)
    │     ├── INSERT customers (assignedUserId = input.assignedUserId ?? currentUserId)
    │     ├── INSERT customer_phones   (se phones.length > 0)
    │     └── INSERT customer_addresses (se addresses.length > 0)
    └─► Retorna findById(createdId) com relations completas
```

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo Exportado | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `CustomersModule` | Classe (`@Module`) | `apps/api/src/modules/customers/customers.module.ts` | Registra `CustomersController` e `CustomersService`, exportando `CustomersService` para os futuros módulos de WhatsApp e Orçamentos. |
| `LookupMatchSource` | `type` (união literal) | `apps/api/src/modules/customers/customers.service.ts` | Indica a origem do match no lookup: `'WHATSAPP_PRIMARY' \| 'SECONDARY_PHONE' \| 'DOCUMENT'`. |
| `CustomersService` | Classe (`@Injectable`) | `apps/api/src/modules/customers/customers.service.ts` | Regras de negócio, deduplicação, lookup omnichannel, paginação e CRUD transacional de clientes, telefones e endereços. |
| `CustomersController` | Classe (`@Controller('customers')`) | `apps/api/src/modules/customers/customers.controller.ts` | Expõe os 11 endpoints REST `/customers` com RBAC (`crm.view`/`crm.manage`), validação Zod e documentação Swagger. |

---

## 4. Constantes, Enums e Schemas de Validação

Todos os contratos de entrada e normalização consumidos por `CustomersController` vêm de `@soares/shared` (`packages/shared/src/customers.schemas.ts`):

- **Validação de rota (`@Param`):** todos os parâmetros `:id`, `:phoneId` e `:addressId` passam por `ParseUUIDPipe` do NestJS antes de chegar ao service (rejeita IDs inválidos com `400 Bad Request`).
- **Normalização automática antes do Service:**
  - `whatsappPhone` / `phoneE164` / `phone`: convertidos para E.164 sem `+` (ex.: `(61) 99999-8888` → `5561999998888`).
  - `documentCpfCnpj` / `document`: salvos e consultados apenas com dígitos (`11` para `PF`, `14` para `PJ`) com validação matemática de dígitos verificadores.
  - `zipCode`: somente 8 dígitos; `state`: 2 letras maiúsculas; `creditLimit` e `defaultDeliveryFee`: normalizados como string decimal com 2 casas (`'0.00'`).
- **Formato padronizado de conflito (`409 ConflictException`):**
  ```json
  {
    "message": "Este telefone já está cadastrado como WhatsApp principal de outro cliente.",
    "conflictField": "whatsappPhone",
    "existingCustomer": {
      "id": "uuid",
      "name": "Razão Social ou Nome",
      "documentCpfCnpj": "11222333000181",
      "whatsappPhone": "5561998887766"
    }
  }
  ```
  O campo `existingCustomer` permite à interface do atendente oferecer imediatamente o vínculo do cliente existente em vez de duplicar o cadastro.

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

### 5.1 `CustomersService.lookup`

- **Assinatura exata:**
  ```ts
  async lookup(query: LookupCustomerQuery): Promise<{
    matchedBy: LookupMatchSource;
    isNewPhoneCustomer: boolean;
    customer: Awaited<ReturnType<CustomersService['findById']>>;
  }>
  ```
- **O que faz:** Executa busca em cascata (1. `customers.whatsapp_phone` → 2. `customer_phones.phone_e164` → 3. `customers.document_cpf_cnpj`). Quando o cliente é encontrado pelo documento usando um telefone ainda não cadastrado, devolve `isNewPhoneCustomer: true` para o painel sugerir `POST /customers/:id/phones`.
- **Como implementar (exemplo futuro no webhook do WhatsApp):**
  ```ts
  const { matchedBy, isNewPhoneCustomer, customer } =
    await this.customersService.lookup({ phone: incomingPhone });
  ```
- **Exceções / Status HTTP:** `400` (Zod sem `phone`/`document`), `404 NotFoundException` se nenhum cliente corresponder.

### 5.2 `CustomersService.list` e `CustomersService.findById`

- **Assinaturas exatas:**
  ```ts
  async list(query: ListCustomersQuery): Promise<{
    data: CustomerWithRelations[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>

  async findById(id: string): Promise<CustomerWithRelations>
  ```
- **O que faz:**
  - `list`: aplica filtros opcionais (`personType`, `billingType`, `search` com `ILIKE` em `name`, `tradeName`, `email`, `whatsappPhone` e dígitos em `documentCpfCnpj`/`whatsappPhone`), executando `findMany` e `COUNT(*)` em paralelo via `Promise.all`.
  - `findById`: carrega `priceTable`, `assignedUser` (apenas `id`, `name`, `email` — nunca hashes), `phones` e `addresses`.
- **Exceções / Status HTTP:** `404 NotFoundException` (`'Cliente não encontrado.'`) em `findById`.

### 5.3 `CustomersService.create`, `update` e `remove`

- **Assinaturas exatas:**
  ```ts
  async create(input: CreateCustomerInput, currentUserId: string)
  async update(id: string, input: UpdateCustomerInput)
  async remove(id: string): Promise<{ deleted: true; id: string }>
  ```
- **O que faz:**
  - `create`: valida unicidade de documento/telefones, garante que nenhum telefone secundário repita `whatsappPhone`, busca `getDefaultPriceTableId()` se `priceTableId` não for informado e insere cliente + telefones + endereços dentro de `this.db.transaction(...)`.
  - `update`: valida compatibilidade cruzada entre `nextPersonType` e `nextDocument`, checa unicidade ignorando o próprio `id` (`ne(customers.id, id)`) e atualiza `updatedAt = new Date()`.
  - `remove`: confirma existência via `findById` e deleta o cliente (telefones e endereços são removidos por `ON DELETE CASCADE`).
- **Exceções / Status HTTP:** `400 BadRequestException` (telefone duplicado no próprio payload, `PF`/`PJ` incompatível com documento ou nenhuma tabela de preço ativa), `404 NotFoundException`, `409 ConflictException` (CPF/CNPJ ou telefone já em uso).

### 5.4 Sub-recursos de Telefones e Endereços (`addPhone`, `removePhone`, `addAddress`, `updateAddress`, `removeAddress`)

- **Assinaturas exatas:**
  ```ts
  async addPhone(customerId: string, input: CustomerPhoneInput)
  async removePhone(customerId: string, phoneId: string): Promise<{ deleted: true; id: string }>
  async addAddress(customerId: string, input: CustomerAddressInput)
  async updateAddress(customerId: string, addressId: string, input: UpdateCustomerAddressInput)
  async removeAddress(customerId: string, addressId: string): Promise<{ deleted: true; id: string }>
  ```
- **O que faz:** Todas as operações validam primeiro a existência do `customerId` e restringem `UPDATE`/`DELETE` por `and(eq(child.id, childId), eq(child.customerId, customerId))`, impedindo alteração cruzada entre clientes diferentes (IDOR).
- **Exceções / Status HTTP:** `404 NotFoundException` se o cliente ou o sub-recurso não pertencer ao cliente; `409 ConflictException` em `addPhone` se o número já existir como principal ou secundário.

### 5.5 Endpoints de `CustomersController` (`modules/customers/customers.controller.ts`)

| Método e Rota | Permissão RBAC | Validação de Entrada | Descrição |
| :--- | :--- | :--- | :--- |
| `GET /customers/lookup` | `crm.view` *(ou `crm.manage`)* | `ZodValidationPipe(lookupCustomerQuerySchema)` | Busca rápida E.164 / CPF-CNPJ para WhatsApp (RF02). |
| `GET /customers` | `crm.view` *(ou `crm.manage`)* | `ZodValidationPipe(listCustomersQuerySchema)` | Listagem paginada com busca e filtros. |
| `GET /customers/:id` | `crm.view` *(ou `crm.manage`)* | `ParseUUIDPipe` | Detalhe completo do cliente com relations. |
| `POST /customers` | `crm.manage` | `ZodValidationPipe(createCustomerSchema)` + `@CurrentUser()` | Cadastra cliente PF/PJ + telefones/endereços em transação. |
| `PATCH /customers/:id` | `crm.manage` | `ParseUUIDPipe` + `ZodValidationPipe(updateCustomerSchema)` | Atualização parcial cadastral/fiscal. |
| `DELETE /customers/:id` | `crm.manage` | `ParseUUIDPipe` | Remove cliente (cascade em telefones e endereços). |
| `POST /customers/:id/phones` | `crm.manage` | `ParseUUIDPipe` + `ZodValidationPipe(customerPhoneInputSchema)` | Vincula telefone secundário (`customer_phones`). |
| `DELETE /customers/:id/phones/:phoneId` | `crm.manage` | `ParseUUIDPipe` (2x) | Remove telefone secundário do cliente. |
| `POST /customers/:id/addresses` | `crm.manage` | `ParseUUIDPipe` + `ZodValidationPipe(customerAddressInputSchema)` | Adiciona endereço fiscal/entrega (`customer_addresses`). |
| `PATCH /customers/:id/addresses/:addressId` | `crm.manage` | `ParseUUIDPipe` (2x) + `ZodValidationPipe(updateCustomerAddressSchema)` | Atualiza parcialmente um endereço do cliente. |
| `DELETE /customers/:id/addresses/:addressId` | `crm.manage` | `ParseUUIDPipe` (2x) | Remove endereço do cliente. |

---

## 6. Receita Rápida: Como Estender este Módulo

### 6.1 Como consumir `CustomersService` no futuro módulo de WhatsApp (Issue #10+)

Como `CustomersModule` exporta `CustomersService`, importe `CustomersModule` no `WhatsappModule`:

```ts
@Module({
  imports: [CustomersModule],
  providers: [WhatsappWebhookService],
})
export class WhatsappModule {}
```

E utilize `lookup` para vincular automaticamente a conversa ao cliente:
```ts
const match = await this.customersService.lookup({ phone: normalizedPhone });
```

### 6.2 Como adicionar sub-recurso `customer_contacts` (Fase 2 — Bloco 2.3)

1. Crie a tabela `2.5 customer_contacts` em `packages/database/src/schema/crm.ts` e adicione `contacts: many(customerContacts)` em `relations.ts`.
2. Crie `customerContactInputSchema` em `packages/shared/src/customers.schemas.ts`.
3. Adicione `addContact`/`updateContact`/`removeContact` em `CustomersService` (sempre escopando `WHERE id = :contactId AND customer_id = :customerId`) e exponha `POST/PATCH/DELETE /customers/:id/contacts` com `@ApiBody` no `CustomersController`.

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **Ordem da rota `@Get('lookup')` antes de `@Get(':id')`:** No `CustomersController`, `GET /customers/lookup` **precisa** vir declarada antes de `GET /customers/:id`. Caso contrário, o Express/NestJS capturaria `'lookup'` como parâmetro `:id` e o `ParseUUIDPipe` retornaria `400 Validation failed (uuid is expected)`.
2. **Swagger com tipos inferidos do Zod (`@ApiBody` obrigatório):** Como `CreateCustomerInput`, `CustomerPhoneInput` e afins são `type` TypeScript (não classes), toda nova rota `POST`/`PATCH` no controller precisa de `@ApiBody({ schema: ... })` para exibir o editor JSON no Swagger `/docs`.
3. **Interação com `FinancialSanitizerInterceptor`:** Campos como `creditLimit`, `defaultDeliveryFee`, `markupMultiplier` e `defaultDiscountPct` presentes nas respostas de `GET /customers` e `GET /customers/:id` são removidos automaticamente caso um perfil operacional sem `os.view_financial` acesse a rota.
4. **Atenção na chamada de deduplicação de documento em `create`:** Verifique em `CustomersService.create` que `ensureDocumentAvailable(...)` receba `input.documentCpfCnpj` (e não `input.whatsappPhone`) para disparar o `409 Conflict` enriquecido antes da constraint `UNIQUE` do banco.

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado | Benefício Arquitetural |
| :--- | :--- | :--- |
| **Atomicidade ACID (Unit of Work / Transaction)** | `this.db.transaction(...)` em `CustomersService.create` | Garante que cliente, telefones secundários e endereços iniciais sejam gravados em conjunto ou integralmente revertidos em caso de erro. |
| **Hierarchical Permission Inheritance (RBAC)** | `RolesGuard` (`crm.manage` implica `crm.view`) | Reduz verbosidade na matriz de permissões dos cargos (`ATENDENTE` possui `crm.manage` e herda automaticamente leitura nas rotas `GET /customers`). |
| **Prevenção de IDOR (Insecure Direct Object Reference)** | `and(eq(child.id, childId), eq(child.customerId, customerId))` | Impede que uma requisição manipule telefones ou endereços de outro cliente trocando apenas o UUID filho na URL. |
| **Execução Concorrente de Consultas (`Promise.all`)** | `CustomersService.list` (`findMany` + `COUNT(*)`) | Reduz latência da listagem paginada executando dados e contagem total em paralelo no pool de conexões. |
| **Rich Domain Conflict Responses (`409`)** | `ensureDocumentAvailable` / `ensurePhoneAvailable` | Transforma falhas de unicidade em respostas acionáveis (`conflictField` + `existingCustomer`) para o fluxo de atendimento omnichannel. |
