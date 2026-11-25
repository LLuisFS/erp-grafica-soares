# Referência Técnica — Núcleo NestJS (`@soares/api`)

## 1. Cabeçalho Técnico

- **Caminho no repositório:** `apps/api/src/` (`env.ts`, `main.ts`, `app.module.ts`, `database/database.module.ts`, `common/{decorators,guards,interceptors,pipes}/*`)
- **Forma de importação (interna em `apps/api/src/`):**
  ```ts
  import { DRIZZLE_DB } from '../../database/database.module';
  import { Public } from '../../common/decorators/public.decorator';
  import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
  import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
  import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
  ```
- **Issue(s) relacionada(s):** Issue #3 (Setup NestJS, Swagger, Pipeline de Segurança RBAC, Validação Zod e Sanitização Financeira)
- **Responsabilidade:** Fornecer a infraestrutura transversal da API REST: conexão global com o Drizzle (`DatabaseModule`), documentação OpenAPI/Swagger (`/docs`), validação de entrada (`ZodValidationPipe`), controle de acesso (`JwtAuthGuard` + `RolesGuard`) e blindagem automática de respostas (`FinancialSanitizerInterceptor`).

---

## 2. Visão Geral & Fluxo de Execução

```text
                      Requisição HTTP (Express / NestJS)
                                     │
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ APP_GUARD #1: JwtAuthGuard                                          │
  │   Reflector.getAllAndOverride(IS_PUBLIC_KEY)                        │
  │     ├── true (@Public()) ─────────────────────────────► Pula JWT    │
  │     └── false ──► Passport 'jwt' (JwtStrategy) ──► request.user     │
  └──────────────────────────────────┬──────────────────────────────────┘
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ APP_GUARD #2: RolesGuard                                            │
  │   Reflector.getAllAndOverride(REQUIRED_PERMISSIONS_KEY)             │
  │     ├── vazio ────────────────────────────────────────► Libera      │
  │     └── hasPermission(): system.all | chave exata |                 │
  │         herança *.manage -> *.view ──────────────────► ou 403       │
  └──────────────────────────────────┬──────────────────────────────────┘
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Pipe de Rota: ZodValidationPipe(schema)                             │
  │   schema.safeParse(body) ──► sucesso: dado sanitizado | erro: 400   │
  └──────────────────────────────────┬──────────────────────────────────┘
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Controller (@CurrentUser() user) ──► Service (@Inject(DRIZZLE_DB))  │
  └──────────────────────────────────┬──────────────────────────────────┘
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ APP_INTERCEPTOR: FinancialSanitizerInterceptor                      │
  │   sanitizePayload(data, isRestrictedRole)                           │
  │     • Sempre remove ALWAYS_STRIP_KEYS (hashes de senha e PIN)       │
  │     • Se restrito, remove todas as 44 FINANCIAL_SENSITIVE_KEYS      │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo Exportado | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `AppModule` | Classe (`@Module`) | `apps/api/src/app.module.ts` | Módulo raiz com `HealthController` (`GET /health`) e registro dos providers globais. |
| `DRIZZLE_DB` | `const symbol` | `apps/api/src/database/database.module.ts` | Token simbólico de DI usado com `@Inject(DRIZZLE_DB)` nos services. |
| `DatabaseModule` | Classe (`@Global @Module`) | `apps/api/src/database/database.module.ts` | Expõe `db` de `@soares/database` globalmente para toda a API. |
| `AuthenticatedUser` | `interface` | `apps/api/src/common/decorators/current-user.decorator.ts` | Contrato tipado de `request.user` populado pela `JwtStrategy`. |
| `CurrentUser` | Param Decorator | `apps/api/src/common/decorators/current-user.decorator.ts` | Extrai `request.user` tipado nos parâmetros dos handlers de controller. |
| `IS_PUBLIC_KEY` | `const string` (`'isPublic'`) | `apps/api/src/common/decorators/public.decorator.ts` | Chave de metadado consultada pelo `JwtAuthGuard`. |
| `Public` | Method/Class Decorator | `apps/api/src/common/decorators/public.decorator.ts` | Dispensa autenticação JWT na rota ou controller decorado. |
| `REQUIRED_PERMISSIONS_KEY` | `const string` (`'requiredPermissions'`) | `apps/api/src/common/decorators/require-permissions.decorator.ts` | Chave de metadado consultada pelo `RolesGuard`. |
| `RequirePermissions` | Method/Class Decorator | `apps/api/src/common/decorators/require-permissions.decorator.ts` | Declara as `PermissionKey[]` exigidas pela rota. |
| `JwtAuthGuard` | Classe (`AuthGuard('jwt')`) | `apps/api/src/common/guards/jwt-auth.guard.ts` | Guard global de autenticação Bearer JWT com suporte a `@Public()`. |
| `RolesGuard` | Classe (`CanActivate`) | `apps/api/src/common/guards/roles.guard.ts` | Guard global RBAC que valida `@RequirePermissions()` e bypass `system.all`. |
| `FinancialSanitizerInterceptor` | Classe (`NestInterceptor`) | `apps/api/src/common/interceptors/financial-sanitizer.interceptor.ts` | Remove recursivamente credenciais sensíveis (sempre) e campos financeiros (para perfis restritos). |
| `ZodValidationPipe` | Classe (`PipeTransform`) | `apps/api/src/common/pipes/zod-validation.pipe.ts` | Integra schemas Zod de `@soares/shared` à validação de payloads NestJS. |

---

## 4. Constantes, Enums e Schemas de Validação

### 4.1 Chaves de Metadados e Token de DI

- `DRIZZLE_DB = Symbol('DRIZZLE_DB')` — uso de `Symbol` impede colisão acidental de strings no container de DI.
- `IS_PUBLIC_KEY = 'isPublic'` — metadado booleano aplicado por `@Public()`.
- `REQUIRED_PERMISSIONS_KEY = 'requiredPermissions'` — metadado `PermissionKey[]` aplicado por `@RequirePermissions(...)`.

### 4.2 Conjuntos de Sanitização (`financial-sanitizer.interceptor.ts`)

- **`ALWAYS_STRIP_KEYS` (removidas em 100% das respostas, mesmo para `ADMIN`):**
  `passwordHash`, `password_hash`, `approvalPinHash`, `approval_pin_hash`.
- **`FINANCIAL_SENSITIVE_KEYS` (44 chaves — 22 conceitos em `snake_case` e `camelCase` — removidas quando `isRestrictedRole === true`):**
  - Custos de engenharia e produção: `unit_cost`/`unitCost`, `setup_cost`/`setupCost`, `calculated_cost`/`calculatedCost`, `cost_material`/`costMaterial`, `cost_prepress`/`costPrepress`, `cost_machine`/`costMachine`, `cost_finishing`/`costFinishing`, `cost_taxes`/`costTaxes`, `cost_commission`/`costCommission`.
  - Preços e totais: `total_amount`/`totalAmount`, `total_price`/`totalPrice`, `unit_price`/`unitPrice`, `original_amount`/`originalAmount`, `paid_amount`/`paidAmount`, `default_delivery_fee`/`defaultDeliveryFee`.
  - Margens, descontos, comissão e crédito: `markup_pct`/`markupPct`, `markup_multiplier`/`markupMultiplier`, `discount_amount`/`discountAmount`, `default_discount_pct`/`defaultDiscountPct`, `max_discount_pct`/`maxDiscountPct`, `commission_pct`/`commissionPct`, `credit_limit`/`creditLimit`.

### 4.3 Regra de Ativação da Restrição Financeira

```ts
const isRestrictedRole =
  !!user &&
  (FINANCIAL_RESTRICTED_ROLES.includes(user.roleName) ||
    (user.permissions?.['system.all'] !== true &&
      user.permissions?.['os.view_financial'] !== true));
```
A sanitização financeira entra em ação se o usuário autenticado pertencer a `OPERADOR_MAQUINA` / `ARTE_FINALISTA` **ou** não tiver `system.all` nem `os.view_financial`.

### 4.4 Configuração do Swagger e Servidor (`apps/api/src/main.ts`)

- **CORS:** `app.enableCors({ origin: true, credentials: true })`.
- **Swagger:** montado em `GET /docs` com `DocumentBuilder().setTitle('ERP Gráfica Soares — API').setVersion('0.1.0').addBearerAuth().build()`.
- **Porta HTTP:** `Number(process.env.API_PORT || 3333)`.

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

### 5.1 `DatabaseModule` e `DRIZZLE_DB` (`database/database.module.ts`)

- **Assinatura exata:**
  ```ts
  export const DRIZZLE_DB = Symbol('DRIZZLE_DB');
  @Global() @Module({ providers: [{ provide: DRIZZLE_DB, useValue: db }], exports: [DRIZZLE_DB] })
  export class DatabaseModule {}
  ```
- **O que faz:** Registra a instância singleton `db` de `@soares/database` como provider global do NestJS.
- **Como implementar:**
  ```ts
  @Injectable()
  export class CustomersService {
    constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}
  }
  ```
- **Exceções / Status HTTP:** Não lança erro na injeção; erros de conexão PostgreSQL ocorrem na execução da primeira query (`500`).

### 5.2 `@Public()`, `@RequirePermissions(...)` e `@CurrentUser()` (`common/decorators/`)

- **Assinaturas exatas:**
  ```ts
  export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
  export const RequirePermissions = (...permissions: PermissionKey[]) =>
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
  export const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
  ```
- **O que faz:**
  - `@Public()` isenta rota/controller do `JwtAuthGuard`.
  - `@RequirePermissions(...keys)` exige que o usuário possua **todas** as chaves listadas (lógica `AND`).
  - `@CurrentUser()` injeta `request.user` tipado como `AuthenticatedUser` (`id`, `email`, `name`, `roleId`, `roleName`, `permissions`, `maxDiscountPct`).
- **Como implementar:**
  ```ts
  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
  ```
- **Exceções / Status HTTP:** Indiretas via `JwtAuthGuard` (`401`) e `RolesGuard` (`403`).

### 5.3 `JwtAuthGuard` (`common/guards/jwt-auth.guard.ts`)

- **Assinatura exata:**
  ```ts
  @Injectable()
  export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private readonly reflector: Reflector);
    override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>;
    override handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser;
  }
  ```
- **O que faz:** Em `canActivate`, verifica `@Public()` no handler e na classe via `reflector.getAllAndOverride`. Se não for público, delega ao Passport (`JwtStrategy`). Em `handleRequest`, padroniza a mensagem de erro quando não há usuário válido.
- **Como implementar:** Registrado globalmente via `APP_GUARD` em `AppModule` (não precisa aplicar `@UseGuards(JwtAuthGuard)` manualmente).
- **Exceções / Status HTTP:** `401 Unauthorized` — `'Token JWT ausente, expirado ou usuário inativo.'` (ou propaga `err` se já for instância de `Error`, ex.: `UnauthorizedException` vinda da `JwtStrategy`).

### 5.4 `RolesGuard` (`common/guards/roles.guard.ts`)

- **Assinatura exata:**
  ```ts
  @Injectable()
  export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
  }
  ```
- **O que faz:** Lê `REQUIRED_PERMISSIONS_KEY` via `Reflector`. Se vazio, libera; caso contrário exige `requiredPermissions.every((p) => hasPermission(user.permissions, p))`. A função interna `hasPermission` libera quando `permissions['system.all'] === true`, quando a chave exata é `true`, ou por **herança de escrita para leitura** (se a rota exige `*.view` e o usuário possui `*.manage`, ex.: `crm.manage` satisfaz `crm.view`).
- **Como implementar:** Registrado globalmente como segundo `APP_GUARD` em `AppModule`.
- **Exceções / Status HTTP:**
  - `403 Forbidden` — `'Usuário não autenticado.'` (se faltar `request.user`).
  - `403 Forbidden` — `` `Acesso negado para o perfil ${user.roleName}. Permissão necessária: ${requiredPermissions.join(', ')}` ``.

### 5.5 `ZodValidationPipe` (`common/pipes/zod-validation.pipe.ts`)

- **Assinatura exata:**
  ```ts
  @Injectable()
  export class ZodValidationPipe implements PipeTransform {
    constructor(private readonly schema: ZodSchema);
    transform(value: unknown): unknown;
  }
  ```
- **O que faz:** Executa `this.schema.safeParse(value)` e retorna `result.data` já transformado pelo Zod (com `.trim()`, `.toLowerCase()`, coerções e remoção de campos desconhecidos).
- **Como implementar:**
  ```ts
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) { ... }
  ```
- **Exceções / Status HTTP:** `400 Bad Request` com payload `{ message: 'Erro de validação nos dados enviados', errors: result.error.flatten().fieldErrors }`.

### 5.6 `FinancialSanitizerInterceptor` (`common/interceptors/financial-sanitizer.interceptor.ts`)

- **Assinatura exata:**
  ```ts
  @Injectable()
  export class FinancialSanitizerInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
  }
  ```
- **O que faz:** Aplica `sanitizePayload(data, isRestrictedRole)` sobre o stream RxJS (`map`) de toda resposta HTTP, percorrendo recursivamente arrays e objetos aninhados (preservando instâncias de `Date`).
- **Como implementar:** Registrado globalmente como `APP_INTERCEPTOR` em `AppModule`. Atua de forma transparente em todas as rotas (testável em `GET /auth/test/production-os-preview`).
- **Exceções / Status HTTP:** Não lança exceções HTTP; transforma silenciosamente o corpo da resposta antes da serialização JSON.

---

## 6. Receita Rápida: Como Estender este Módulo

### Como proteger uma nova rota com permissão e validação Zod

```ts
@ApiTags('Engenharia')
@Controller('machines')
export class MachinesController {
  @Post()
  @ApiBearerAuth()
  @RequirePermissions('engineering.manage')
  create(
    @Body(new ZodValidationPipe(createMachineSchema)) body: CreateMachineInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.machinesService.create(body, user.id);
  }
}
```

### Como ocultar um novo campo financeiro no interceptor

1. Adicione as variantes `snake_case` e `camelCase` da coluna no `Set` `FINANCIAL_SENSITIVE_KEYS` em `apps/api/src/common/interceptors/financial-sanitizer.interceptor.ts`.
2. Teste autenticando com um usuário `OPERADOR_MAQUINA` ou `ARTE_FINALISTA` para confirmar que o campo foi omitido da resposta JSON.

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **Ordem dos `APP_GUARD` em `AppModule` é crítica:** `JwtAuthGuard` **deve** vir antes de `RolesGuard`. Se inverter, `request.user` ainda será `undefined` quando `RolesGuard` rodar e toda rota com `@RequirePermissions` retornará `403`.
2. **Interceptors rodam depois dos Guards e do Controller (na saída):** O `FinancialSanitizerInterceptor` lê `request.user` já populado pelo `JwtAuthGuard` e filtra o objeto retornado pelo controller — portanto, nunca retorne instâncias de classe com getters não-enumeráveis se esperar que `Object.entries()` as percorra (prefira objetos planos retornados pelo Drizzle).
3. **Preservação de `Date` na sanitização recursiva:** Em `sanitizePayload`, a checagem `!(value instanceof Date)` evita que `Object.entries(new Date())` transforme timestamps (`createdAt`, `updatedAt`) em objetos vazios `{}`.
4. **Rotas de webhook externas (WhatsApp / Asaas):** Como o `JwtAuthGuard` é global, webhooks precisam de `@Public()` somado à sua própria validação criptográfica de assinatura/token (ex.: `ASAAS_WEBHOOK_TOKEN`, `WA_WEBHOOK_VERIFY_TOKEN`).

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado | Benefício Arquitetural |
| :--- | :--- | :--- |
| **Inversão de Controle e Injeção de Dependência (DIP — SOLID)** | `DatabaseModule` (`DRIZZLE_DB`) + construtores gerenciados pelo NestJS | Desacopla services da criação da conexão com o banco, facilitando mocks em testes unitários e troca de provedor. |
| **Reflection & Custom Metadata (AOP)** | `@Public()`, `@RequirePermissions()` + `Reflector.getAllAndOverride()` | Programação Orientada a Aspectos: regras transversais de segurança ficam declarativas junto à rota sem poluir a regra de negócio. |
| **Decorator & Interceptor Pattern** | `FinancialSanitizerInterceptor` com RxJS `map()` | Aplica filtragem transversal de privacidade/sigilo em todas as saídas HTTP sem alterar nenhum controller ou service. |
| **Data Transfer Validation (Pipe)** | `ZodValidationPipe` | Centraliza tratamento de entrada inválida em um único componente reutilizável, garantindo respostas `400` padronizadas. |
