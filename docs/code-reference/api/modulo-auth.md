# Referência Técnica — Módulo de Autenticação & RBAC (`AuthModule`)

## 1. Cabeçalho Técnico

- **Caminho no repositório:** `apps/api/src/modules/auth/` (`auth.module.ts`, `password.service.ts`, `jwt.strategy.ts`, `auth.service.ts`, `auth.controller.ts`)
- **Forma de importação (interna em `apps/api/src/`):**
  ```ts
  import { AuthModule } from './modules/auth/auth.module';
  import { AuthService } from './modules/auth/auth.service';
  import { PasswordService } from './modules/auth/password.service';
  import { type JwtPayload } from './modules/auth/jwt.strategy';
  ```
- **Issue(s) relacionada(s):** Issue #3 (Autenticação JWT Interna, Alçada de Desconto por PIN Gerencial e Validação de RBAC)
- **Responsabilidade:** Autenticar exclusivamente colaboradores internos (`users`), emitir e validar tokens Bearer JWT com revogação imediata para contas inativas e verificar PINs gerenciais para liberação de descontos acima da alçada do vendedor.

---

## 2. Visão Geral & Fluxo de Execução

### 2.1 Fluxo de Login (`POST /auth/login`)

```text
  POST /auth/login { email, password }
        │
        ▼
  JwtAuthGuard (@Public() -> libera)
        │
        ▼
  ZodValidationPipe(loginSchema)  ──► trim + lowercase no email; password >= 6 chars
        │
        ▼
  AuthController.login() ──► AuthService.login()
        ├─► SELECT users INNER JOIN roles WHERE users.email = input.email
        ├─► Checa existência e users.active === true (senão 401)
        ├─► PasswordService.verify(password, userRecord.passwordHash) [scrypt + timingSafeEqual]
        └─► JwtService.signAsync({ sub, email, roleName }) -> { access_token, token_type, user }
```

### 2.2 Fluxo de Requisição Autenticada (`JwtStrategy`) e Validação de PIN (`POST /auth/verify-pin`)

```text
  Authorization: Bearer <token>
        │
        ▼
  JwtAuthGuard ──► JwtStrategy.validate(payload)
        ├─► Verifica assinatura (JWT_SECRET) e expiração (ignoreExpiration: false)
        ├─► SELECT users INNER JOIN roles WHERE users.id = payload.sub
        ├─► Se !record || !record.active -> 401 Unauthorized (bloqueio imediato)
        └─► Anexa AuthenticatedUser atualizado em request.user
                    │
                    ▼ (em POST /auth/verify-pin)
        AuthService.verifyPin(input, currentUser)
          ├── Caso 1 (managerUserId ou managerEmail informado):
          │     Busca o gerente específico -> checa active + permissão + PIN -> 200 ou 403
          └── Caso 2 (sem gerente informado):
                Busca todos users active=true com approval_pin_hash != null
                Prioriza currentUser.id -> testa permissão + PIN -> 200 ou 403
```

---

## 3. Mapa de Importações (Exports Públicos)

| Símbolo Exportado | Tipo | Arquivo de Origem | Para que serve |
| :--- | :--- | :--- | :--- |
| `AuthModule` | Classe (`@Module`) | `apps/api/src/modules/auth/auth.module.ts` | Registra `PassportModule`, `JwtModule.registerAsync`, `AuthController`, `JwtStrategy` e exporta `AuthService`/`PasswordService`. |
| `PasswordService` | Classe (`@Injectable`) | `apps/api/src/modules/auth/password.service.ts` | Gera e verifica hashes `scrypt` compatíveis com `seed.ts` usando `timingSafeEqual`. |
| `JwtPayload` | `interface` | `apps/api/src/modules/auth/jwt.strategy.ts` | Contrato dos claims assinados no JWT (`sub`, `email`, `roleName`). |
| `JwtStrategy` | Classe (`PassportStrategy`) | `apps/api/src/modules/auth/jwt.strategy.ts` | Extrai Bearer JWT, valida assinatura e recarrega o usuário/permissões no banco. |
| `AuthService` | Classe (`@Injectable`) | `apps/api/src/modules/auth/auth.service.ts` | Regras de negócio de `login` e `verifyPin`. |
| `AuthController` | Classe (`@Controller('auth')`) | `apps/api/src/modules/auth/auth.controller.ts` | Expõe endpoints `/auth/login`, `/auth/me`, `/auth/verify-pin` e rotas de teste RBAC/sanitização. |

---

## 4. Constantes, Enums e Schemas de Validação

### 4.1 Configuração JWT (`auth.module.ts` e `jwt.strategy.ts`)

| Parâmetro | Origem | Valor Padrão | Observação |
| :--- | :--- | :--- | :--- |
| `secret` / `secretOrKey` | `process.env.JWT_SECRET?.trim()` | Nenhum (obrigatório em `.env.development` / produção) | Lido em runtime dentro de `JwtModule.registerAsync({ useFactory })` e no construtor da `JwtStrategy`. |
| `signOptions.expiresIn` | `process.env.JWT_EXPIRES_IN?.trim()` | `'12h'` | Tempo de expiração do access token. |
| `ignoreExpiration` | Fixo na `JwtStrategy` | `false` | Tokens expirados são sempre rejeitados. |
| `defaultStrategy` | `PassportModule.register` | `'jwt'` | Estratégia padrão usada por `AuthGuard('jwt')`. |

### 4.2 Formato de Hash (`PasswordService`)

- **Padrão armazenado:** `scrypt:<saltHex32chars>:<derivedKeyHex128chars>`
  - Salt: `randomBytes(16).toString('hex')` (16 bytes = 128 bits).
  - Derivação: `scryptSync(plainText, salt, 64)` (chave de 64 bytes = 512 bits).
  - Validação: verifica 3 segmentos separados por `:`, prefixo `'scrypt'`, tamanho idêntico dos buffers e comparação em tempo constante via `timingSafeEqual`.

### 4.3 Regra de Permissão de Aprovação de PIN (`AuthService.verifyPin`)

Um usuário só pode autorizar um desconto por PIN se:
1. `active === true`;
2. `approval_pin_hash` não for nulo e corresponder ao PIN enviado;
3. `permissions['system.all'] === true` **OU** `permissions['quote.approve_discount'] === true`.

---

## 5. Referência Detalhada (Classes, Métodos, Decorators e Guards)

### 5.1 `PasswordService` (`modules/auth/password.service.ts`)

- **Assinaturas exatas:**
  ```ts
  hash(plaintext: string): string
  verify(plainText: string, storedHash: string | null | undefined): boolean
  ```
- **O que faz:** Gera hashes salted com `scrypt` para cadastro/atualização de senha ou PIN, e valida segredos contra o hash armazenado sem vazar tempo de resposta (*timing side-channel*).
- **Como implementar (exemplo ao criar um colaborador):**
  ```ts
  const passwordHash = this.passwordService.hash(input.password);
  const approvalPinHash = input.pin ? this.passwordService.hash(input.pin) : null;
  ```
- **Exceções / Status HTTP:** Não lança exceção em `verify`; retorna `false` para hashes nulos, malformados ou divergentes.

### 5.2 `JwtStrategy` (`modules/auth/jwt.strategy.ts`)

- **Assinatura exata:**
  ```ts
  export interface JwtPayload { sub: string; email: string; roleName: string; }
  async validate(payload: JwtPayload): Promise<AuthenticatedUser>
  ```
- **O que faz:** Após o Passport validar assinatura e expiração do Bearer JWT, busca o colaborador em `users` (`INNER JOIN roles`) pelo `payload.sub`. Se o usuário foi desativado (`active = false`) ou removido, bloqueia imediatamente mesmo com token ainda dentro da validade de 12h.
- **Como implementar:** Acionada automaticamente pelo `JwtAuthGuard` em toda rota não marcada com `@Public()`.
- **Exceções / Status HTTP:** `401 Unauthorized` — `'Usuário inativo ou não encontrado.'`.

### 5.3 `AuthService.login` (`modules/auth/auth.service.ts`)

- **Assinatura exata:**
  ```ts
  async login(input: LoginInput): Promise<{
    access_token: string;
    token_type: string;
    user: {
      id: string;
      name: string;
      email: string;
      roleId: string;
      roleName: string;
      permissions: RolePermissions;
      maxDiscountPct: string;
    };
  }>
  ```
- **O que faz:** Consulta usuário e cargo por `input.email`, valida `active` e `passwordHash` via `PasswordService.verify`, e assina o token JWT com `{ sub, email, roleName }`.
- **Como implementar:** Chamado por `AuthController.login`.
- **Exceções / Status HTTP:**
  - `401 Unauthorized` — `'Credenciais inválidas'` / `'Credenciais inválidas.'` (e-mail inexistente ou senha incorreta).
  - `401 Unauthorized` — `'Usuário inativo. Contate o administrador da gráfica'`.

### 5.4 `AuthService.verifyPin` (`modules/auth/auth.service.ts`)

- **Assinatura exata:**
  ```ts
  async verifyPin(
    input: VerifyPinInput,
    currentUser: AuthenticatedUser,
  ): Promise<{
    authorized: true;
    authorizedBy: { id: string; name: string; roleName: string };
  }>
  ```
- **O que faz:**
  - **Caso 1 (`managerUserId` ou `managerEmail` informado):** consulta apenas o gerente indicado, valida `active`, permissão de aprovação e PIN.
  - **Caso 2 (apenas `pin` informado):** busca todos os usuários ativos com `approval_pin_hash IS NOT NULL`, ordena colocando `currentUser.id` primeiro e testa o PIN até encontrar o aprovador correspondente.
- **Como implementar (exemplo de uso futuro no módulo de Orçamentos):**
  ```ts
  const { authorizedBy } = await this.authService.verifyPin(
    { pin: dto.managerPin, managerEmail: dto.managerEmail },
    currentUser,
  );
  // Salva authorizedBy.id em quotes.discount_authorized_by
  ```
- **Exceções / Status HTTP:** `403 Forbidden` — `'PIN gerencial inválido ou usuário sem permissão de aprovação.'`.

### 5.5 Endpoints de `AuthController` (`modules/auth/auth.controller.ts`)

| Método e Rota | Proteção | Validação / Entrada | Retorno (`200 OK`) | Status de Erro |
| :--- | :--- | :--- | :--- | :--- |
| `POST /auth/login` | `@Public()` | `ZodValidationPipe(loginSchema)` | `{ access_token, token_type: 'Bearer', user }` | `400` (Zod), `401` (credenciais/inativo) |
| `GET /auth/me` | JWT obrigatório | `@CurrentUser()` | `AuthenticatedUser` do usuário logado | `401` |
| `POST /auth/verify-pin` | JWT obrigatório | `ZodValidationPipe(verifyPinSchema)` + `@CurrentUser()` | `{ authorized: true, authorizedBy: { id, name, roleName } }` | `400` (Zod), `401`, `403` (PIN/alçada) |
| `GET /auth/test/financial-preview` | JWT + `@RequirePermissions('os.view_financial')` | — | `{ message, total_amount, markup_pct }` | `401`, `403` (perfis de fábrica) |
| `GET /auth/test/production-os-preview` | JWT obrigatório | — | Dados de OS (com `unit_cost`, `total_amount` e `markup_pct` **omitidos** para perfis sem visão financeira) | `401` |

---

## 6. Receita Rápida: Como Estender este Módulo

### 6.1 Como reutilizar `PasswordService` ou `AuthService` em outro módulo (ex.: `UsersModule` ou `QuotesModule`)

Como `AuthModule` já exporta `[AuthService, PasswordService]`, basta importar `AuthModule` no módulo consumidor:

```ts
@Module({
  imports: [AuthModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
```

Depois, injete diretamente no construtor do service:
```ts
constructor(
  @Inject(DRIZZLE_DB) private readonly db: Database,
  private readonly authService: AuthService,
) {}
```

### 6.2 Como registrar trilha de auditoria no `verifyPin` (Fase 2)

Quando a tabela `1.3 audit_logs` for criada, basta registrar um evento `'OVERRIDE_DISCOUNT'` contendo `userId: authorizedBy.id` logo após `authService.verifyPin(...)` retornar `authorized: true`.

---

## 7. Dicas, Armadilhas Comuns (Pitfalls) & Base para TCC

### Armadilhas Comuns (Pitfalls)

1. **`JWT_SECRET` obrigatório no `.env.development`:** Tanto `AuthModule` quanto `JwtStrategy` leem `process.env.JWT_SECRET?.trim()` **sem fallback hardcoded**. Se `JWT_SECRET` não estiver definida no `.env.development`, o Passport/JWT lançará erro ao iniciar ou assinar tokens — garanta que a chave esteja preenchida em todos os ambientes.
2. **Por que `JwtModule.registerAsync` em vez de `JwtModule.register`:** Com `register()`, `process.env.JWT_SECRET` seria lido no instante do `import` do arquivo (antes do `main.ts` terminar de inicializar), criando risco de assinatura divergente entre `JwtService` e `JwtStrategy`. O `registerAsync` atrasa a leitura para o bootstrap do container DI.
3. **Recarregamento no banco a cada requisição (`JwtStrategy.validate`):** Apesar de adicionar 1 query indexada por PK (`users.id`), garante que a inativação de um ex-funcionário (`active = false`) ou a troca de cargo/permissões tenha **efeito imediato**, sem esperar as 12h de expiração do JWT.
4. **Rotas `/auth/test/*` são endpoints de validação do MVP:** As rotas `test/financial-preview` e `test/production-os-preview` existem para validar rapidamente o `RolesGuard` e o `FinancialSanitizerInterceptor` via Swagger; avalie removê-las ou condicioná-las a ambiente de desenvolvimento antes do deploy em produção.

### Base Teórica para TCC — Padrões de Engenharia de Software Aplicados

| Padrão / Conceito | Onde é Aplicado | Benefício Arquitetural |
| :--- | :--- | :--- |
| **Strategy Pattern** | `JwtStrategy extends PassportStrategy(Strategy)` | Isola o mecanismo de autenticação Bearer JWT do restante da API, permitindo adicionar outras estratégias no futuro sem alterar controllers. |
| **KDF Resistente a Força Bruta (`scrypt`)** | `PasswordService.hash` / `seed.ts` | Função de derivação de chave *memory-hard* com salt aleatório único por usuário, dificultando ataques de *rainbow tables* e GPU cracking. |
| **Comparação em Tempo Constante (`timingSafeEqual`)** | `PasswordService.verify` | Mitiga ataques de canal lateral (*timing attacks*) que tentam inferir bytes válidos de hashes/PINs medindo diferenças de latência. |
| **Princípio do Menor Privilégio & Alçada Dual** | `AuthService.verifyPin` + `users.max_discount_pct` | Vendedores operam com autonomia até seu limite individual; descontos excepcionais exigem escalonamento explícito por PIN gerencial auditável. |
| **Stateless Auth com Revogação Dinâmica** | JWT assinado (`sub`) + verificação de `users.active` na `JwtStrategy` | Combina a portabilidade do Bearer JWT com revogação instantânea de sessão sem necessidade de manter tabela de sessões opacas. |
