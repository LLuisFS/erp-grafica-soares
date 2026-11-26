# Referência Técnica — Módulo de Engenharia Gráfica (`EngineeringModule`)

## 1. Cabeçalho Técnico

- **Caminho no repositório:** `apps/api/src/modules/engineering/` (`engineering.module.ts`, `engineering-delete.helper.ts`, `price-tables/*`, `machines/*`, `materials/*`, `finishing-services/*`, `product-templates/*`)
- **Forma de importação (interna em `apps/api/src/`):**
  ```ts
  import { EngineeringModule } from './modules/engineering/engineering.module';
  import { PriceTablesService } from './modules/engineering/price-tables/price-tables.service';
  import { MachinesService } from './modules/engineering/machines/machines.service';
  import { MaterialsService } from './modules/engineering/materials/materials.service';
  import { FinishingServicesService } from './modules/engineering/finishing-services/finishing-services.service';
  import { ProductTemplatesService } from './modules/engineering/product-templates/product-templates.service';
  ```
- **Issue(s) relacionada(s):** Issue #5 (CRUD de Engenharia Gráfica, Conversão Automática de Custo de Insumos, Hodômetro, Ajuste de Estoque e Soft Deactivation)
- **Responsabilidade:** Gerenciar os 5 cadastros técnicos que alimentam o `@soares/pricing-engine` e a orçamentação (`price_tables`, `machines`, `materials`, `finishing_services`, `product_templates`), garantindo cálculo automático de custo unitário na unidade de consumo, ciclo de vida lógico (`active`/`deactivated_at`) e proteção contra exclusão física com vínculos (`23503`).

---

## 2. Visão Geral & Fluxo de Execução

### 2.1 Arquitetura Interna do `EngineeringModule`

```text
  Requisição HTTP (/engineering/<recurso>)
        │
        ▼
  JwtAuthGuard ──► RolesGuard
                    • GET    -> @RequirePermissions('engineering.view')   [herdado por engineering.manage]
                    • POST   -> @RequirePermissions('engineering.manage')
                    • PATCH  -> @RequirePermissions('engineering.manage')
                    • DELETE -> @RequirePermissions('engineering.delete') [exclusivo ADMIN]
        │
        ▼
  ZodValidationPipe (schemas de @soares/shared/engineering.schemas.ts + .strict() no PATCH)
        │
        ▼
  ┌────────────────────────── EngineeringModule ──────────────────────────┐
  │ • PriceTablesController       ──► PriceTablesService       ──► price_tables       │
  │ • MachinesController          ──► MachinesService          ──► machines           │
  │ • MaterialsController         ──► MaterialsService         ──► materials          │
  │ • FinishingServicesController ──► FinishingServicesService ──► finishing_services │
  │ • ProductTemplatesController  ──► ProductTemplatesService  ──► product_templates  │
  │                   (todos injetando @Inject(DRIZZLE_DB) + executeSafeHardDelete)   │
  └──────────────────────────────────┬────────────────────────────────────┘
                                     ▼
                       FinancialSanitizerInterceptor
                       (omissão automática de unitCost/setupCost para perfis sem visão financeira)
```

### 2.2 Fluxo de Cálculo Automático de Custo em `MaterialsService`

```text
  POST /engineering/materials { purchasePrice: 85.00, conversionFactor: 250, ... }
        │
        ▼
  createMaterialSchema.refine(purchasePrice !== undefined || unitCost !== undefined)
        │
        ▼
  MaterialsService.resolveUnitCost(purchasePrice, unitCost, conversionFactor)
    ├── Se purchasePrice informado -> (85.00 / 250).toFixed(4) = '0.3400'
    └── Senão usa unitCost direto  -> unitCost.toFixed(4)
        │
        ▼
  INSERT INTO materials (..., conversion_factor='250.0000', unit_cost='0.3400', ...)
```

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo Exportado | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `EngineeringModule` | Classe (`@Module`) | `apps/api/src/modules/engineering/engineering.module.ts` | Agrupa os 5 controllers/services de engenharia e exporta todos os 5 services para reuso nos futuros módulos de Orçamentos/PCP. |
| `executeSafeHardDelete` | Função auxiliar | `apps/api/src/modules/engineering/engineering-delete.helper.ts` | Executa `DELETE` físico capturando violação de FK (`23503`, direta ou em `error.cause.code`) e lançando `409 ConflictException`. |
| `PriceTablesService` / `PriceTablesController` | Service / Controller | `apps/api/src/modules/engineering/price-tables/*` | CRUD, unicidade de nome (`409`) e soft deactivation em `price_tables`. |
| `MachinesService` / `MachinesController` | Service / Controller | `apps/api/src/modules/engineering/machines/*` | CRUD técnico de equipamentos (`machines`), hodômetro monotônico (`PATCH .../meter`) e soft deactivation. |
| `MaterialsService` / `MaterialsController` | Service / Controller | `apps/api/src/modules/engineering/materials/*` | CRUD de insumos (`materials`), unicidade de SKU (`409`), cálculo `purchasePrice / conversionFactor` e ajuste manual de estoque (`POST .../stock-adjustment`). |
| `FinishingServicesService` / `FinishingServicesController` | Service / Controller | `apps/api/src/modules/engineering/finishing-services/*` | CRUD de acabamentos (`finishing_services`) carregando `with: { machine: true }` e soft deactivation. |
| `ProductTemplatesService` / `ProductTemplatesController` | Service / Controller | `apps/api/src/modules/engineering/product-templates/*` | CRUD de gabaritos (`product_templates`) carregando `defaultMachine` e `defaultMaterial` e soft deactivation. |

---

## 4. Constantes, Enums e Schemas de Validação

Todos os contratos são importados de `@soares/shared` (`packages/shared/src/engineering.schemas.ts`):

- **Listagem (`listEngineeringQuerySchema`):** `search` (opcional, busca `ILIKE` por nome — e também por `sku` em `materials`) e `includeInactive` (`boolean`, padrão `false` → retorna apenas registros com `active = true`).
- **Blindagem de edição (`.strict()` + `.omit()`):**
  - Todos os schemas de `PATCH` usam `.strict()`, rejeitando com `400 Bad Request` qualquer tentativa de enviar `active`, `deactivatedAt` ou campos não reconhecidos no payload cadastral.
  - `updateMachineSchema` omite `currentOdometer` (obrigando o uso de `PATCH /engineering/machines/:id/meter`).
  - `updateMaterialSchema` omite `stockQty` (obrigando o uso de `POST /engineering/materials/:id/stock-adjustment`).
- **Precisão numérica na persistência (`NUMERIC` como `string`):**
  - 4 casas decimais (`.toFixed(4)`): `markupMultiplier`, `machines.unitCost`, `materials.conversionFactor`, `materials.unitCost`, `materials.stockQty`, `materials.minStockQty`, `finishingServices.unitCost`.
  - 2 casas decimais (`.toFixed(2)`): `defaultDiscountPct`, `machines.setupCost`, `finishingServices.setupCost`.

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

### 5.1 `executeSafeHardDelete` (`engineering-delete.helper.ts`)

- **Assinatura exata:**
  ```ts
  export async function executeSafeHardDelete(
    deleteFn: () => Promise<void>,
    resourceLabel: string,
    statusRouteExample: string,
  ): Promise<void>
  ```
- **O que faz:** Executa a função de `DELETE` recebida e inspeciona `error?.code ?? error?.cause?.code`. Se for `'23503'` (*foreign key violation*), lança `ConflictException` orientando a rota `PATCH .../:id/status` com `{ "active": false }`.
- **Exceções / Status HTTP:** `409 ConflictException` em violação de integridade referencial; repropaga demais erros.

### 5.2 Regras Específicas dos Serviços

#### `PriceTablesService`
- **`create` / `update`**: garantem unicidade de `price_tables.name` (ignorando o próprio `id` com `ne(priceTables.id, id)` no `update`), lançando `409 ConflictException` antes da constraint `UNIQUE`.

#### `MachinesService`
- **`updateMeter(id: string, input: UpdateMachineMeterInput)`**: garante monotonicidade do contador — se `input.readingValue < current.currentOdometer`, lança `400 BadRequestException`.

#### `MaterialsService`
- **`resolveUnitCost(purchasePrice, unitCost, conversionFactor)`**: se `purchasePrice` for enviado, retorna `(purchasePrice / conversionFactor).toFixed(4)`; caso contrário usa `unitCost.toFixed(4)`. No `update`, se `purchasePrice` ou `unitCost` for enviado, recalcula usando `input.conversionFactor ?? Number(current.conversionFactor)`.
- **`create` / `update`**: garantem unicidade de `sku` (com `ne(materials.id, id)` no `update`), lançando `409 ConflictException`.
- **`adjustStock(id: string, input: AdjustMaterialStockInput)`**: calcula `nextQty = Number(current.stockQty) + input.qtyDelta`; se `nextQty < 0`, lança `400 BadRequestException` (`Saldo insuficiente...`). Retorna `{ material, adjustment: { qtyDelta, reason } }`.

#### `FinishingServicesService` & `ProductTemplatesService`
- Retornam automaticamente as relações via Drizzle Relational Query API (`with: { machine: true }` em acabamentos; `with: { defaultMachine: true, defaultMaterial: true }` em gabaritos).

### 5.3 Mapa Completo dos 32 Endpoints REST (`/engineering/*`)

| Recurso (Prefixo) | Rotas Padrão (6 por recurso) | Rotas Dedicadas Extras |
| :--- | :--- | :--- |
| `/engineering/price-tables` | `GET`, `GET :id`, `POST`, `PATCH :id`, `PATCH :id/status`, `DELETE :id` | — |
| `/engineering/machines` | `GET`, `GET :id`, `POST`, `PATCH :id`, `PATCH :id/status`, `DELETE :id` | `PATCH :id/meter` (`engineering.manage`) — hodômetro monotônico |
| `/engineering/materials` | `GET`, `GET :id`, `POST`, `PATCH :id`, `PATCH :id/status`, `DELETE :id` | `POST :id/stock-adjustment` (`engineering.manage`) — ajuste de saldo |
| `/engineering/finishing-services` | `GET`, `GET :id`, `POST`, `PATCH :id`, `PATCH :id/status`, `DELETE :id` | — |
| `/engineering/product-templates` | `GET`, `GET :id`, `POST`, `PATCH :id`, `PATCH :id/status`, `DELETE :id` | — |

**Matriz RBAC aplicada em todos os 5 controllers:**
- `GET` / `GET :id`: `@RequirePermissions('engineering.view')` *(satisfeita também por `engineering.manage` via herança no `RolesGuard` e por `system.all`)*.
- `POST` / `PATCH :id` / `PATCH :id/status` / `PATCH :id/meter` / `POST :id/stock-adjustment`: `@RequirePermissions('engineering.manage')`.
- `DELETE :id`: `@RequirePermissions('engineering.delete')` *(exclusivo `ADMIN`)*.

---

## 6. Receita Rápida: Como Estender este Módulo

### 6.1 Como consumir os serviços de engenharia no módulo de Orçamentos (Issue #8+)

Como `EngineeringModule` exporta todos os 5 services, importe-o no `QuotesModule` e injete o serviço necessário:

```ts
@Module({
  imports: [EngineeringModule],
  providers: [QuotesService],
})
export class QuotesModule {}
```

### 6.2 Como acoplar histórico de movimentações na Fase 2 (`stock_movements` e `machine_odometer_logs`)

1. Em `MaterialsService.adjustStock`, envolva o `UPDATE materials.stock_qty` e o `INSERT stock_movements` dentro de `this.db.transaction(...)`, gravando `qtyDelta`, `reason` e o `user.id` vindo de `@CurrentUser()`.
2. Em `MachinesService.updateMeter`, envolva o `UPDATE machines.current_odometer` e o `INSERT machine_odometer_logs` na mesma transação atômica.

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **Bloqueio `.strict()` no Zod em atualizações parciais:** Enviar `active` ou `stockQty` no `PATCH /engineering/materials/:id` retorna `400 Bad Request` intencionalmente — alterações de status, estoque e hodômetro devem passar sempre pelas rotas dedicadas para facilitar auditoria futura.
2. **Alteração isolada de `conversionFactor` sem `purchasePrice` no `PATCH /engineering/materials/:id`:** O `MaterialsService.update` só recalcula `unitCost` quando `purchasePrice` ou `unitCost` é informado no payload, evitando sobrescrever acidentalmente um custo unitário já negociado sem saber o novo preço de compra.
3. **Isolamento financeiro de chão de fábrica:** Perfis `OPERADOR_MAQUINA` e `ARTE_FINALISTA` recebem `403 Forbidden` em `/engineering/*` (não possuem `engineering.view`) e, mesmo quando dados de máquinas/materiais aparecem em relações de OSs no futuro, o `FinancialSanitizerInterceptor` remove `unitCost`, `setupCost` e `markupMultiplier` automaticamente.
4. **Compatibilidade do `CHECK` `machines_sector_check`:** A migration `0004` padronizou o valor de `'PRE_IMPRESSÃO'` para `'PRE_IMPRESSAO'` (sem acento), mantendo 100% de alinhamento com `machineSectorEnum` em `@soares/shared`.

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado | Benefício Arquitetural |
| :--- | :--- | :--- |
| **DRY & Helper de Cross-Cutting Error Translation** | `executeSafeHardDelete` compartilhado pelos 5 serviços | Centraliza o mapeamento do erro técnico de SGBD (`23503`) para uma resposta de domínio acionável (`409 Conflict`). |
| **Command Segregation (Rotas Dedicadas para Estado Crítico)** | `PATCH .../status`, `PATCH .../meter`, `POST .../stock-adjustment` + `.omit()`/`.strict()` | Separa edição cadastral de transições sensíveis (estoque, hodômetro, ciclo de vida), preparando o terreno para *Event Sourcing* / auditoria na Fase 2. |
| **Normalização de Unidades de Medida (Domain Calculation)** | `MaterialsService.resolveUnitCost` (`purchasePrice / conversionFactor` com 4 casas) | Elimina erro humano de conversão entre unidade de compra (resma/bobina) e consumo (folha/$m^2$), protegendo a margem real do motor de precificação. |
| **Invariante Monotônica** | `MachinesService.updateMeter` (`readingValue >= currentOdometer`) | Garante consistência física do contador de cliques/metros para auditoria de contratos de outsourcing de impressão. |
| **Dependency Injection (`@Inject(DRIZZLE_DB)`)** | Todos os 5 serviços de engenharia | Mantém baixo acoplamento com o banco de dados e uniformidade arquitetural com `AuthService` e `CustomersService`. |
