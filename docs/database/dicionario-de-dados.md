# Dicionário de Dados — ERP Gráfica Soares

Documentação completa das **38 tabelas** do banco de dados relacional (`PostgreSQL`), detalhando chaves, cardinalidades, status de implementação (`Bloco 1.1` no Drizzle ORM vs. `schema-v1.sql` para os blocos seguintes) e regras de aplicação no código.

---

## Regras Arquiteturais Globais

- **Chaves Primárias (`UUID`):** Todas as tabelas utilizam `gen_random_uuid()` para evitar enumeração sequencial em rotas públicas (`/upload/[token]`, `/aprovar/[token]`) e permitir geração antecipada de IDs na aplicação.
- **Timestamps com Fuso (`TIMESTAMPTZ`):** Armazenados em UTC no PostgreSQL e formatados para `America/Sao_Paulo` na interface.
- **Valores Monetários (`NUMERIC(12,2)` / `NUMERIC(12,4)`):** Custos unitários de insumos/cliques utilizam 4 casas decimais (`scale: 4`) para evitar erro de arredondamento em altas tiragens; totais financeiros utilizam 2 casas (`scale: 2`).
- **Fronteira Equipe vs. Cliente:** `users` autentica exclusivamente a equipe interna da gráfica; `customers` não possui login no ERP (o acesso futuro do e-commerce fica isolado em `customer_auth_accounts`).

---

## Domínio 1: Core — Equipe Interna, Permissões (RBAC) e Auditoria

```text
[roles] 1 ─── N [users] 1 ─── N [audit_logs]
```

### 1.1 `roles` `[Implementada — Bloco 1.1]`
Define os cargos da equipe interna e a matriz de permissões granulares consumida pelos *Guards* do NestJS (`@RequirePermissions`) e pelo menu lateral do Next.js.
- **Relacionamentos:** `1:N` com `users`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador único do cargo. |
| `name` | `VARCHAR(50)` (`UNIQUE`) | Não | Código fixo do perfil (`ADMIN`, `GERENTE`, `ATENDENTE`, `ARTE_FINALISTA`, `OPERADOR_MAQUINA`, `FINANCEIRO`). |
| `permissions` | `JSONB` (default `{}`) | Não | Mapa chave-valor lido pelo `RolesGuard` (ex.: `{"os.view_financial": false, "quote.create": true}`). |
| `created_at` | `TIMESTAMPTZ` | Não | Data de criação do registro. |

---

### 1.2 `users` `[Implementada — Bloco 1.1]`
Representa exclusivamente os colaboradores internos da Gráfica Soares.
- **Relacionamentos:** `N:1` com `roles`; `1:N` com `customers`, `wa_conversations`, `wa_messages`, `quotes`, `service_orders`, `artwork_files`, `production_steps`, `production_scrap_logs`, `stock_movements`, `machine_odometer_logs` e `audit_logs`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador único do colaborador. |
| `role_id` | `UUID` (`FK -> roles.id`) | Não | Define o perfil de acesso e visibilidade de dados financeiros. |
| `name` | `VARCHAR(120)` | Não | Nome exibido no chat, orçamentos e apontamentos de produção. |
| `email` | `VARCHAR(150)` (`UNIQUE`) | Não | Credencial de login no painel do ERP (normalizar para lowercase). |
| `password_hash` | `TEXT` | Não | Senha criptografada (`scrypt:<salt>:<key>` via `PasswordService` / `seed.ts`). Nunca retornar nas respostas da API (removida globalmente pelo `FinancialSanitizerInterceptor`). |
| `approval_pin_hash` | `TEXT` | Sim | Hash de PIN numérico (4–6 dígitos) usado por gerentes para autorizar descontos acima da alçada. |
| `max_discount_pct` | `NUMERIC(5,2)` (default `0.00`) | Não | Percentual máximo de desconto que este vendedor pode conceder sem pedir PIN gerencial. |
| `commission_pct` | `NUMERIC(5,2)` (default `0.00`) | Não | Percentual de comissão calculado sobre vendas fechadas pelo usuário. |
| `active` | `BOOLEAN` (default `true`) | Não | Inativação lógica; bloqueia login imediatamente sem quebrar o histórico de OSs antigas. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de cadastro do colaborador. |
| `updated_at` | `TIMESTAMPTZ` | Sim | Última atualização cadastral ou de senha. |

---

### 1.3 `audit_logs` `[Modelada SQL — Fase 2 / Bloco 2.1]`
Trilha imutável de auditoria para ações sensíveis (alteração de preço, baixa manual de pagamento, liberação via PIN).
- **Relacionamentos:** `N:1` opcional com `users` (nulo quando a ação partir de um worker/webhook automático).

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador único do evento de auditoria. |
| `user_id` | `UUID` (`FK -> users.id`) | Sim | Colaborador que executou a ação (ou autorizou via PIN). |
| `entity_name` | `VARCHAR(60)` | Não | Nome da tabela afetada (ex.: `'quotes'`, `'payment_transactions'`). |
| `entity_id` | `UUID` | Não | UUID do registro alterado na tabela alvo. |
| `action` | `VARCHAR(40)` | Não | Verbo padronizado da operação (ex.: `'CONFIRM_MANUAL_PAYMENT'`, `'OVERRIDE_DISCOUNT'`). |
| `old_data` | `JSONB` | Sim | Snapshot dos campos antes da alteração. |
| `new_data` | `JSONB` | Sim | Snapshot dos campos após a alteração. |
| `ip_address` | `VARCHAR(45)` | Sim | Endereço IPv4/IPv6 de origem da requisição. |
| `created_at` | `TIMESTAMPTZ` | Não | Momento exato do evento (tabela append-only; nunca executar `UPDATE` ou `DELETE`). |

---

## Domínio 2: CRM Interno & Clientes

```text
[price_tables] 1 ─── N [customers] 1 ─── N [customer_phones]
                            │      ├── 1:N ── [customer_addresses]
                            │      ├── 1:N ── [customer_contacts]
                            │      └── 1:1 ── [customer_auth_accounts] (Site futuro)
```

### 2.1 `price_tables` `[Implementada — Bloco 1.1]`
Perfis de precificação aplicados automaticamente conforme a categoria do cliente (Balcão, Agência/Revenda, Corporativo).
- **Relacionamentos:** `1:N` com `customers`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador único da tabela comercial. |
| `name` | `VARCHAR(80)` (`UNIQUE`) | Não | Nome exibido no cadastro do cliente e no simulador de orçamento. |
| `markup_multiplier` | `NUMERIC(6,4)` (default `1.0000`) | Não | Fator multiplicador aplicado pelo `@soares/pricing-engine` sobre o custo base (ex.: `1.0000` balcão, `0.8500` revenda). |
| `default_discount_pct` | `NUMERIC(5,2)` (default `0.00`) | Não | Desconto padrão pré-aplicado para clientes vinculados a esta tabela. |
| `active` | `BOOLEAN` (default `true`) | Não | Permite descontinuar tabelas antigas sem afetar clientes existentes. |

---

### 2.2 `customers` `[Implementada — Bloco 1.1]`
Cadastro central de clientes (Pessoa Física ou Jurídica) para atendimento via WhatsApp, faturamento e emissão fiscal. **Não possui credenciais de login.**
- **Relacionamentos:** `N:1` com `price_tables` e `users` (`assigned_user_id`); `1:N` com `customer_phones`, `customer_addresses`, `customer_contacts`, `wa_conversations`, `quotes`, `service_orders`, `billing_batches` e `financial_titles`; `1:1` opcional com `customer_auth_accounts`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador único do cliente. |
| `price_table_id` | `UUID` (`FK -> price_tables.id`) | Não | Define qual tabela de preço o motor de orçamento carrega por padrão para este cliente. |
| `assigned_user_id` | `UUID` (`FK -> users.id`) | Sim | Vendedor/atendente dono da carteira deste cliente. |
| `person_type` | `VARCHAR(2)` (`CHECK 'PF'\|'PJ'`) | Sim | Define validação de CPF (11 dígitos) ou CNPJ (14 dígitos) no Zod (atualmente nullable no schema Drizzle). |
| `name` | `VARCHAR(160)` | Não | Nome completo (PF) ou Razão Social (PJ) — usado na Nota Fiscal. |
| `trade_name` | `VARCHAR(160)` | Sim | Nome Fantasia (PJ), útil na busca rápida do atendente. |
| `document_cpf_cnpj` | `VARCHAR(14)` (`UNIQUE`) | Sim | **Salvar apenas dígitos** (sem `.`, `-`, `/`). Chave principal de busca quando o cliente chama de outro telefone e para emissão de NF. |
| `state_registration` | `VARCHAR(30)` | Sim | Inscrição Estadual (ou `'ISENTO'`), exigida na emissão de NF-e para PJ. |
| `email` | `VARCHAR(150)` | Sim | Destino para envio de DANFE/XML de Nota Fiscal (não usado para login). |
| `whatsapp_phone` | `VARCHAR(20)` (`INDEX`) | Não | Telefone principal no formato E.164 (ex.: `5561999998888`). |
| `billing_type` | `VARCHAR(20)` (`CHECK`, default `'AVISTA'`) | Não | `'AVISTA'` (exige pagamento antes de gerar OS) ou `'FATURADO_MENSAL'` (clientes PJ com contrato). |
| `credit_limit` | `NUMERIC(12,2)` (default `0.00`) | Não | Limite de crédito aprovado para clientes `FATURADO_MENSAL`. |
| `notes` | `TEXT` | Sim | Observações internas de atendimento ou preferências de acabamento. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de cadastro. |
| `updated_at` | `TIMESTAMPTZ` | Sim | Data da última atualização cadastral. |

---

### 2.3 `customer_phones` `[Implementada — Bloco 1.1]`
Permite vincular múltiplos números de WhatsApp/telefone ao mesmo cliente (ex.: celular pessoal e celular da empresa).
- **Relacionamentos:** `N:1` com `customers` (`ON DELETE CASCADE`).

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do vínculo telefônico. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Não | Cliente proprietário deste número. |
| `phone_e164` | `VARCHAR(20)` (`UNIQUE`, `INDEX`) | Não | Número normalizado em E.164. Consultado automaticamente pelo webhook do WhatsApp quando não encontra em `customers.whatsapp_phone`. |
| `label` | `VARCHAR(40)` | Sim | Rótulo descritivo (ex.: `'Celular Pessoal'`, `'Setor de Compras'`). |
| `created_at` | `TIMESTAMPTZ` | Não | Data em que o número foi associado ao cadastro. |

---

### 2.4 `customer_addresses` `[Implementada — Bloco 1.1]`
Endereços de entrega e faturamento fiscal coletados já no primeiro atendimento para emissão de NF e cálculo de frete/motoboy.
- **Relacionamentos:** `N:1` com `customers` (`ON DELETE CASCADE`); `1:N` com `deliveries`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do endereço. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Não | Cliente ao qual o endereço pertence. |
| `address_type` | `VARCHAR(20)` (`CHECK`) | Não | `'ENTREGA'`, `'COBRANCA'` ou `'AMBOS'`. |
| `zip_code` | `VARCHAR(10)` | Não | CEP (salvar apenas 8 dígitos para integração com ViaCEP/Correios). |
| `street` | `VARCHAR(160)` | Não | Logradouro (rua, avenida, quadra). |
| `number` | `VARCHAR(20)` | Não | Número ou `'S/N'`. |
| `complement` | `VARCHAR(80)` | Sim | Sala, bloco, conjunto, ponto de referência. |
| `neighborhood` | `VARCHAR(80)` | Não | Bairro / Setor. |
| `city` | `VARCHAR(80)` | Não | Município (ex.: `'Planaltina'`, `'Brasília'`). |
| `state` | `CHAR(2)` | Não | Sigla da UF em maiúsculas (ex.: `'GO'`, `'DF'`). |
| `default_delivery_fee` | `NUMERIC(10,2)` (default `0.00`) | Não | Taxa padrão de motoboy pré-calculada para este endereço. |

---

### 2.5 `customer_contacts` `[Modelada SQL — Fase 2 / Bloco 2.3]`
Pessoas de contato dentro de empresas clientes (`PJ`), separando quem aprova arte, quem aprova orçamento e quem recebe boleto.
- **Relacionamentos:** `N:1` com `customers` (`ON DELETE CASCADE`).

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do contato. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Não | Empresa cliente (`PJ`). |
| `name` | `VARCHAR(120)` | Não | Nome do contato interno na empresa cliente. |
| `role` | `VARCHAR(60)` | Sim | Cargo (ex.: `'Designer'`, `'Comprador'`, `'Financeiro'`). |
| `whatsapp_phone` | `VARCHAR(20)` | Não | WhatsApp direto desse contato em E.164. |
| `email` | `VARCHAR(150)` | Sim | E-mail específico do setor desse contato. |
| `can_approve_art` | `BOOLEAN` (default `true`) | Não | Indica se este contato pode receber provas digitais para aprovação. |
| `can_approve_quote` | `BOOLEAN` (default `true`) | Não | Indica se este contato tem alçada para aprovar orçamentos. |

---

### 2.6 `customer_auth_accounts` `[Modelada SQL — Fase 3 / Site Futuro]`
Tabela satélite reservada para quando o e-commerce/portal Web-to-Print entrar no ar. **Não deve ser criada nem populada no MVP.**
- **Relacionamentos:** `1:1` (`UNIQUE`) com `customers` (`ON DELETE CASCADE`).

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da conta web do cliente. |
| `customer_id` | `UUID` (`FK -> customers.id`, `UNIQUE`) | Não | Liga o login do site ao cadastro interno já existente (localizado pelo CPF/CNPJ no cadastro). |
| `login_email` | `VARCHAR(150)` (`UNIQUE`) | Não | E-mail usado pelo cliente para logar na loja virtual. |
| `password_hash` | `TEXT` | Não | Senha criptografada do cliente no site (completamente isolada de `users`). |
| `oauth_provider` | `VARCHAR(30)` | Sim | Provedor social caso use login com Google (`'GOOGLE'`). |
| `last_login_at` | `TIMESTAMPTZ` | Sim | Data do último acesso no portal. |
| `active` | `BOOLEAN` (default `true`) | Não | Permite suspender acesso web sem apagar histórico comercial. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de ativação da conta no site. |

---

## Domínio 3: WhatsApp & Atendimento Omnichannel

```text
[customers] 1 ─── N [wa_conversations] 1 ─── N [wa_messages] 1 ─── N [wa_media_attachments]
```

### 3.1 `wa_conversations` `[Modelada SQL — Bloco 1.2]`
Representa cada ticket/conversa de atendimento no WhatsApp.
- **Relacionamentos:** `N:1` opcional com `customers` e `users`; `1:N` com `wa_messages` e `quotes`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da conversa no painel omnichannel. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Sim | Fica `NULL` enquanto o lead ainda não foi identificado por telefone ou CPF/CNPJ; preenchido assim que vinculado. |
| `assigned_user_id` | `UUID` (`FK -> users.id`) | Sim | Atendente que assumiu o ticket (evita dois atendentes responderem o mesmo cliente). |
| `wa_phone` | `VARCHAR(20)` (`INDEX`) | Não | Número de origem do WhatsApp em formato E.164. |
| `wa_profile_name` | `VARCHAR(120)` | Sim | Nome público exibido no perfil do WhatsApp do contato. |
| `status` | `VARCHAR(25)` (`CHECK`) | Não | `'BOT'`, `'FILA'`, `'EM_ATENDIMENTO'` ou `'ENCERRADO'`. |
| `window_expires_at` | `TIMESTAMPTZ` | Sim | Timestamp da última mensagem recebida + 24h. Se expirado, a API Oficial da Meta exige uso de `wa_notification_templates`. |
| `unread_count` | `INTEGER` (default `0`) | Não | Contador de mensagens não lidas exibido no badge da caixa de entrada. |
| `last_message_at` | `TIMESTAMPTZ` | Não | Usado para ordenar a lista de conversas da mais recente para a mais antiga. |
| `created_at` | `TIMESTAMPTZ` | Não | Abertura do ticket. |

---

### 3.2 `wa_messages` `[Modelada SQL — Bloco 1.2]`
Histórico completo de mensagens trocadas (texto, mídias, botões interativos e templates).
- **Relacionamentos:** `N:1` com `wa_conversations` (`ON DELETE CASCADE`) e `users`; `1:N` com `wa_media_attachments`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador interno da mensagem. |
| `conversation_id` | `UUID` (`FK -> wa_conversations.id`) | Não | Conversa à qual a mensagem pertence. |
| `wamid` | `VARCHAR(120)` (`UNIQUE`) | Sim | ID único retornado pela Meta/Gateway. Usado pelo worker BullMQ para **idempotência** (ignorar webhooks duplicados). |
| `direction` | `VARCHAR(10)` (`CHECK`) | Não | `'INBOUND'` (cliente enviou) ou `'OUTBOUND'` (gráfica enviou). |
| `sender_type` | `VARCHAR(15)` (`CHECK`) | Não | `'CUSTOMER'`, `'AGENT'` (humano) ou `'SYSTEM_BOT'` (automação). |
| `user_id` | `UUID` (`FK -> users.id`) | Sim | Preenchido quando `sender_type = 'AGENT'`. |
| `message_type` | `VARCHAR(20)` (`CHECK`) | Não | `'TEXT'`, `'IMAGE'`, `'DOCUMENT'`, `'AUDIO'`, `'INTERACTIVE'` ou `'TEMPLATE'`. |
| `content_text` | `TEXT` | Sim | Corpo textual da mensagem ou legenda do anexo. |
| `interactive_payload` | `JSONB` | Sim | Guarda o ID do botão clicado pelo cliente (ex.: `{"button_id": "APPROVE_QUOTE:uuid:tierUuid"}`). |
| `delivery_status` | `VARCHAR(15)` (`CHECK`) | Não | `'QUEUED'`, `'SENT'`, `'DELIVERED'`, `'READ'` ou `'FAILED'` (atualizado pelos webhooks de status). |
| `error_reason` | `TEXT` | Sim | Mensagem de erro retornada pelo provedor quando `delivery_status = 'FAILED'`. |
| `created_at` | `TIMESTAMPTZ` | Não | Timestamp exato da mensagem. |

---

### 3.3 `wa_notification_templates` `[Modelada SQL — Bloco 1.2]`
Catálogo de mensagens automáticas disparadas pelos eventos do ERP (e mapeadas para templates aprovados na Meta).
- **Relacionamentos:** Tabela de configuração independente.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do template. |
| `trigger_event` | `VARCHAR(50)` (`UNIQUE`) | Não | Evento interno que dispara o envio (`'QUOTE_SENT'`, `'PAYMENT_REQUEST'`, `'PAYMENT_CONFIRMED'`, `'ART_PROOF_READY'`, `'OS_READY_PICKUP'`). |
| `meta_template_name` | `VARCHAR(100)` | Não | Nome exato do template aprovado no painel Meta Business. |
| `language_code` | `VARCHAR(10)` (default `'pt_BR'`) | Não | Código de idioma exigido pela Meta Cloud API. |
| `body_template` | `TEXT` | Não | Texto base com placeholders `{{1}}`, `{{2}}` usado para preview no ERP e envio via Evolution API. |
| `active` | `BOOLEAN` (default `true`) | Não | Permite pausar um disparo automático sem alterar código. |

---

## Domínio 4: Engenharia Gráfica, Equipamentos e Matéria-Prima

```text
[machines] 1 ─── N [finishing_services] N ─── 1 [suppliers] (Fase 2)
    │
    └── 1:N ── [product_templates] N ─── 1 [materials]
```

### 4.1 `machines` `[Implementada — Bloco 1.1]`
Cadastro técnico dos equipamentos de impressão e acabamento (ex.: Epson WF-C5390, Konica Minolta C360i, Guilhotina).
- **Relacionamentos:** `1:N` com `finishing_services`, `product_templates`, `quote_item_tiers`, `production_steps` e `machine_odometer_logs`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do equipamento. |
| `name` | `VARCHAR(100)` | Não | Nome comercial/técnico exibido na OS e nas filas de PCP. |
| `sector` | `VARCHAR(25)` (`CHECK`) | Não | `'PRE_IMPRESSAO'`, `'DIGITAL'`, `'OFFSET'`, `'COM_VISUAL'` ou `'ACABAMENTO'`. |
| `billing_unit` | `VARCHAR(15)` (`CHECK`) | Não | Define a fórmula de custo no `@soares/pricing-engine`: `'CLIQUE'` (por página), `'HORA'` ou `'M2'`. |
| `unit_cost` | `NUMERIC(10,4)` | Não | Custo operacional por clique, por hora ou por $m^2$. |
| `setup_cost` | `NUMERIC(10,2)` (default `0.00`) | Não | Custo fixo de preparação/acerto de máquina somado uma única vez por tiragem. |
| `setup_waste_sheets` | `INTEGER` (default `0`) | Não | Folhas extras adicionadas automaticamente ao cálculo de papel para calibragem de cor/corte. |
| `max_width_mm` | `INTEGER` | Não | Largura máxima aceita pela máquina (em milímetros). |
| `max_height_mm` | `INTEGER` | Não | Altura máxima aceita pela máquina (em milímetros). |
| `gripper_margin_mm` | `INTEGER` (default `10`) | Não | Margem de pinça não imprimível descontada pelo algoritmo de imposição antes de calcular quantas peças cabem na folha. |
| `current_odometer` | `BIGINT` (default `0`) | Não | Contador acumulado de cliques/metros da máquina. |
| `active` | `BOOLEAN` (default `true`) | Não | Indica se o equipamento está disponível para novos orçamentos. |

---

### 4.2 `materials` `[Implementada — Bloco 1.1]`
Papéis, lonas, vinis, chapas rígidas, tintas e embalagens com conversão automática entre unidade de compra e unidade de consumo.
- **Relacionamentos:** `1:N` com `product_templates`, `quote_item_tiers`, `material_remnants`, `production_scrap_logs` e `stock_movements`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do insumo. |
| `sku` | `VARCHAR(40)` (`UNIQUE`) | Sim | Código interno ou código do fornecedor para importação de NF-e. |
| `name` | `VARCHAR(140)` | Não | Descrição completa (ex.: `'Couchê Brilho 300g 66x96cm'`). |
| `category` | `VARCHAR(25)` (`CHECK`) | Não | `'PAPEL'`, `'LONA_VINIL'`, `'CHAPA_RIGIDA'`, `'TINTA_INSUMO'` ou `'EMBALAGEM'`. |
| `purchase_unit` | `VARCHAR(20)` | Não | Unidade comercial de entrada (ex.: `'RESMA_500'`, `'BOBINA_50M'`, `'LITRO'`). |
| `consumption_unit` | `VARCHAR(20)` | Não | Unidade fracionada usada no orçamento e baixa de estoque (`'FOLHA'`, `'M2'`, `'METRO_LINEAR'`, `'ML'`). |
| `conversion_factor` | `NUMERIC(12,4)` | Não | Multiplicador de entrada (ex.: `500` para resma de 500 folhas; `80` para bobina de 1,60m x 50m = 80$m^2$). |
| `width_mm` | `INTEGER` | Sim | Largura da folha ou da bobina em milímetros (usada no cálculo de imposição). |
| `height_mm` | `INTEGER` | Sim | Altura da folha em milímetros (`NULL` quando for bobina contínua). |
| `grammage_gsm` | `INTEGER` | Sim | Gramatura em $g/m^2$ (ex.: `90`, `150`, `300`). |
| `unit_cost` | `NUMERIC(12,4)` | Não | Custo unitário já convertido na `consumption_unit` (custo por 1 folha ou 1 $m^2$). |
| `stock_qty` | `NUMERIC(12,4)` (default `0`) | Não | Saldo físico atual na `consumption_unit`. |
| `min_stock_qty` | `NUMERIC(12,4)` (default `0`) | Não | Ponto de reposição que dispara alerta de compra. |
| `active` | `BOOLEAN` (default `true`) | Não | Status ativo no catálogo. |

---

### 4.3 `finishing_services` `[Implementada — Bloco 1.1]`
Catálogo de acabamentos internos ou terceirizados (laminação, verniz, corte, vinco, ilhós, wire-o).
- **Relacionamentos:** `N:1` opcional com `machines` e `suppliers` (`default_supplier_id` fica nullable no MVP até `suppliers` entrar na Fase 2); `1:N` com `quote_item_finishings` e `outsourced_orders`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do acabamento. |
| `name` | `VARCHAR(100)` | Não | Nome exibido na proposta e na OS técnica. |
| `machine_id` | `UUID` (`FK -> machines.id`) | Sim | Equipamento onde o acabamento é executado (gera fila de PCP na Fase 2). |
| `calc_basis` | `VARCHAR(20)` (`CHECK`) | Não | Base de cálculo no `@soares/pricing-engine`: `'POR_UNIDADE'` (ex.: ilhós), `'POR_FOLHA'` (ex.: laminação), `'POR_M2'` ou `'FIXO_SETUP'`. |
| `setup_cost` | `NUMERIC(10,2)` (default `0.00`) | Não | Custo fixo inicial do acabamento (ex.: confecção de faca ou acerto). |
| `unit_cost` | `NUMERIC(10,4)` | Não | Custo variável multiplicado pela quantidade, folhas ou $m^2$. |
| `is_outsourced` | `BOOLEAN` (default `false`) | Não | Sinaliza se o serviço é executado fora da gráfica por um parceiro. |
| `default_supplier_id` | `UUID` | Sim | Fornecedor padrão quando `is_outsourced = true` (recebe FK na Fase 2). |
| `active` | `BOOLEAN` (default `true`) | Não | Disponibilidade no configurador de orçamento. |

---

### 4.4 `product_templates` `[Implementada — Bloco 1.1]`
Gabaritos pré-configurados de produtos recorrentes para agilizar o preenchimento do orçamento em poucos cliques.
- **Relacionamentos:** `N:1` opcional com `machines` e `materials`; `1:N` com `quote_items`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do gabarito. |
| `name` | `VARCHAR(120)` | Não | Ex.: `'Cartão de Visita 90x50mm'`, `'Panfleto A5'`, `'Banner Lona'`. |
| `category` | `VARCHAR(25)` (`CHECK`) | Não | `'DIGITAL'`, `'OFFSET'` ou `'COM_VISUAL'`. |
| `default_machine_id` | `UUID` (`FK -> machines.id`) | Sim | Máquina pré-selecionada ao escolher este gabarito. |
| `default_material_id` | `UUID` (`FK -> materials.id`) | Sim | Substrato pré-selecionado ao escolher este gabarito. |
| `default_width_mm` | `INTEGER` | Não | Largura final padrão da peça em mm. |
| `default_height_mm` | `INTEGER` | Não | Altura final padrão da peça em mm. |
| `bleed_mm` | `INTEGER` (default `3`) | Não | Sangria padrão em mm somada em cada lado no cálculo de imposição. |
| `spacing_mm` | `INTEGER` (default `2`) | Não | Espaçamento de corte (calha) entre peças na folha. |

---

### 4.5 `suppliers` `[Modelada SQL — Fase 2 / Bloco 2.2]`
Fornecedores de insumos (papéis, tintas) e parceiros de acabamentos/impressões terceirizadas.
- **Relacionamentos:** `1:N` com `finishing_services`, `outsourced_orders`, `purchase_invoices` e `financial_titles`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do fornecedor. |
| `name` | `VARCHAR(160)` | Não | Razão Social ou Nome Fantasia do fornecedor. |
| `cnpj` | `VARCHAR(14)` (`UNIQUE`) | Sim | **Apenas 14 dígitos**; usado para vincular automaticamente ao importar XML de NF-e. |
| `phone` | `VARCHAR(20)` | Sim | Telefone/WhatsApp comercial do fornecedor. |
| `email` | `VARCHAR(150)` | Sim | E-mail para envio de pedidos de compra e arquivos terceirizados. |
| `category` | `VARCHAR(40)` | Sim | Ex.: `'PAPEIS'`, `'TINTAS_INSUMOS'`, `'TERCEIRIZACAO_ACABAMENTO'`. |

---

## Domínio 5: Orçamentação Multi-Tiragem e Retalhos

```text
[quotes] 1 ─── N [quote_items] 1 ─── N [quote_item_tiers] N ─── 1 [material_remnants] (Fase 3)
                      └── 1:N ── [quote_item_finishings]
```

### 5.1 `quotes` `[Modelada SQL — Bloco 1.3]`
Cabeçalho da proposta comercial enviada ao cliente. Funciona como contêiner inicial dos arquivos antes do pagamento gerar a OS.
- **Relacionamentos:** `N:1` com `customers`, `users` (`user_id` e `discount_authorized_by`) e `wa_conversations`; `1:N` com `quote_items`, `artwork_files`, `financial_titles` e `service_orders`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador interno do orçamento. |
| `code` | `SERIAL` (`UNIQUE`) | Não | Número sequencial amigável exibido ao cliente (ex.: `Orçamento #1045`). |
| `customer_id` | `UUID` (`FK -> customers.id`) | Não | Cliente destinatário da proposta. |
| `user_id` | `UUID` (`FK -> users.id`) | Não | Atendente/vendedor que elaborou o orçamento. |
| `conversation_id` | `UUID` (`FK -> wa_conversations.id`) | Sim | Conversa do WhatsApp de origem (permite disparar proposta e cobrança no chat certo). |
| `status` | `VARCHAR(25)` (`CHECK`) | Não | Ciclo de vida: `'RASCUNHO'`, `'ENVIADO'`, `'NEGOCIACAO'`, `'AGUARDANDO_PAGAMENTO'`, `'PAGO_CONVERTIDO'`, `'PERDIDO'`, `'EXPIRADO'`. |
| `loss_reason` | `VARCHAR(120)` | Sim | Motivo obrigatório quando `status = 'PERDIDO'` (ex.: `'Preço'`, `'Prazo'`). |
| `valid_until` | `DATE` | Não | Data limite de validade da proposta; bloqueia aprovação direta se vencida. |
| `approved_at` | `TIMESTAMPTZ` | Sim | Timestamp exato em que o cliente clicou em `[Aprovar Orçamento]`. |
| `discount_amount` | `NUMERIC(12,2)` (default `0.00`) | Não | Valor absoluto de desconto aplicado sobre o total. |
| `discount_authorized_by` | `UUID` (`FK -> users.id`) | Sim | ID do gerente que validou o PIN quando o desconto superou `users.max_discount_pct`. |
| `total_amount` | `NUMERIC(12,2)` (default `0.00`) | Não | Valor final consolidado do orçamento (atualizado com base na tiragem escolhida). |
| `notes` | `TEXT` | Sim | Condições comerciais e observações impressas no PDF da proposta. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de criação. |
| `updated_at` | `TIMESTAMPTZ` | Sim | Última edição. |

---

### 5.2 `quote_items` `[Modelada SQL — Bloco 1.3]`
Cada item gráfico dentro de um orçamento (ex.: Item 1: Cartão de Visita; Item 2: Banner Lona).
- **Relacionamentos:** `N:1` com `quotes` (`ON DELETE CASCADE`) e `product_templates`; `1:N` com `quote_item_tiers`, `quote_item_finishings` e `service_orders`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do item do orçamento. |
| `quote_id` | `UUID` (`FK -> quotes.id`) | Não | Orçamento pai. |
| `product_template_id` | `UUID` (`FK -> product_templates.id`) | Sim | Gabarito que originou o item (ou `NULL` para item 100% personalizado). |
| `description` | `VARCHAR(200)` | Não | Título técnico do item exibido no PDF comercial e na OS. |
| `width_mm` | `INTEGER` | Não | Largura final acabada da peça (mm). |
| `height_mm` | `INTEGER` | Não | Altura final acabada da peça (mm). |
| `bleed_mm` | `INTEGER` (default `3`) | Não | Sangria exigida (mm). |
| `colors_front` | `INTEGER` (default `4`) | Não | Número de cores na frente (`4` = CMYK, `1` = PB, `0` = sem impressão). |
| `colors_back` | `INTEGER` (default `0`) | Não | Número de cores no verso (`4` = frente e verso colorido, `0` = só frente). |
| `notes` | `TEXT` | Sim | Observações técnicas específicas deste item. |

---

### 5.3 `quote_item_tiers` `[Modelada SQL — Bloco 1.3]`
Faixas comparativas de quantidade para o mesmo item (ex.: 500, 1.000 e 2.500 unidades) contendo o snapshot completo do cálculo de imposição e custos.
- **Relacionamentos:** `N:1` com `quote_items` (`ON DELETE CASCADE`), `machines`, `materials` e `material_remnants` (opcional na Fase 3); `1:1` opcional com `service_orders`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da faixa de tiragem. |
| `quote_item_id` | `UUID` (`FK -> quote_items.id`) | Não | Item ao qual esta simulação pertence. |
| `quantity` | `INTEGER` | Não | Tiragem simulada (ex.: `1000`). |
| `machine_id` | `UUID` (`FK -> machines.id`) | Não | Equipamento considerado no cálculo desta tiragem. |
| `material_id` | `UUID` (`FK -> materials.id`) | Não | Substrato considerado no cálculo desta tiragem. |
| `remnant_id` | `UUID` (`FK -> material_remnants.id`) | Sim | Retalho aproveitado (preenchido na Fase 3 quando houver sobra compatível). |
| `imposition_cols` | `INTEGER` | Não | Quantas peças cabem na largura útil da folha. |
| `imposition_rows` | `INTEGER` | Não | Quantas peças cabem na altura útil da folha. |
| `pieces_per_sheet` | `INTEGER` | Não | Total de peças por folha (`cols * rows`). |
| `orientation` | `VARCHAR(15)` (`CHECK`) | Não | `'RETRATO'` ou `'PAISAGEM'` (orientação vencedora no algoritmo de aproveitamento). |
| `net_sheets_needed` | `NUMERIC(12,4)` | Não | Folhas líquidas (ou $m^2$) necessárias para produzir `quantity`. |
| `waste_sheets` | `NUMERIC(12,4)` | Não | Folhas de quebra/acerto somadas (`machines.setup_waste_sheets`). |
| `cost_material` | `NUMERIC(12,2)` | Não | Custo total de substrato desta tiragem. |
| `cost_prepress` | `NUMERIC(12,2)` (default `0.00`) | Não | Custo de arte/chapa/pré-impressão. |
| `cost_machine` | `NUMERIC(12,2)` | Não | Custo de impressão (setup + cliques/horas/$m^2$). |
| `cost_finishing` | `NUMERIC(12,2)` (default `0.00`) | Não | Soma dos acabamentos aplicados nesta tiragem. |
| `cost_taxes` | `NUMERIC(12,2)` (default `0.00`) | Não | Provisão tributária calculada. |
| `cost_commission` | `NUMERIC(12,2)` (default `0.00`) | Não | Comissão do vendedor calculada. |
| `markup_pct` | `NUMERIC(6,2)` | Não | Margem/markup efetivo aplicado. |
| `unit_price` | `NUMERIC(12,4)` | Não | Preço unitário de venda exibido ao cliente (`total_price / quantity`). |
| `total_price` | `NUMERIC(12,2)` | Não | Preço total desta tiragem. |
| `is_chosen` | `BOOLEAN` (default `false`) | Não | Marcado como `true` na tiragem selecionada pelo cliente ao aprovar o orçamento. |

---

### 5.4 `quote_item_finishings` `[Modelada SQL — Bloco 1.3]`
Lista dos serviços de acabamento adicionados a um item de orçamento.
- **Relacionamentos:** `N:1` com `quote_items` (`ON DELETE CASCADE`) e `finishing_services`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do vínculo. |
| `quote_item_id` | `UUID` (`FK -> quote_items.id`) | Não | Item do orçamento que receberá o acabamento. |
| `finishing_service_id` | `UUID` (`FK -> finishing_services.id`) | Não | Acabamento selecionado. |
| `calculated_cost` | `NUMERIC(12,2)` | Não | Custo base calculado para este acabamento. |

---

### 5.5 `material_remnants` `[Modelada SQL — Fase 3 / Bloco 3.2]`
Controle de sobras aproveitáveis de bobinas (lona/vinil) e chapas rígidas (acrílico, PVC, MDF).
- **Relacionamentos:** `N:1` com `materials` e `service_orders` (`source_os_id` opcional); `1:N` com `quote_item_tiers`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do retalho. |
| `material_id` | `UUID` (`FK -> materials.id`) | Não | Material de origem da sobra. |
| `source_os_id` | `UUID` (`FK -> service_orders.id`) | Sim | OS que gerou a sobra. |
| `width_mm` | `INTEGER` | Não | Largura útil do retalho em mm. |
| `height_mm` | `INTEGER` | Não | Altura útil do retalho em mm. |
| `qty` | `INTEGER` (default `1`) | Não | Quantidade de peças com estas dimensões. |
| `location_code` | `VARCHAR(30)` | Sim | Endereço físico na prateleira/tubo da gráfica (ex.: `'PRAT-B2'`). |
| `status` | `VARCHAR(15)` (`CHECK`) | Não | `'DISPONIVEL'`, `'RESERVADO'` ou `'CONSUMIDO'`. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de registro da sobra. |

---

## Domínio 6: Produção (PCP), Arquivos de Arte e Aprovação Digital

```text
[quotes] 1 ─── N [artwork_files] N ─── 1 [service_orders] (criada após pagamento)
                      │                        ├── 1:N ── [artwork_approvals]
                      └── 1:N ── [wa_media_attachments] ├── 1:N ── [production_steps]
                                               ├── 1:N ── [production_scrap_logs]
                                               └── 1:N ── [outsourced_orders]
```

### 6.1 `service_orders` `[Modelada SQL — Bloco 1.4]`
Ordem de Serviço de produção. **Só nasce após confirmação do pagamento (`payment.confirmed`)**, mantendo o chão de fábrica livre de pedidos não pagos.
- **Relacionamentos:** `N:1` com `quotes`, `quote_items`, `quote_item_tiers`, `customers` e `users` (`sales_user_id` e `financial_lock_released_by`); `1:N` com `artwork_files`, `artwork_approvals`, `production_steps`, `production_scrap_logs`, `outsourced_orders`, `stock_movements`, `financial_titles`, `fiscal_documents`; `1:1` com `deliveries`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador interno da OS. |
| `code` | `SERIAL` (`UNIQUE`) | Não | Número da OS exibido no Kanban, QR Code e etiquetas (ex.: `OS #4820`). |
| `quote_id` | `UUID` (`FK -> quotes.id`) | Sim | Orçamento que deu origem à OS. |
| `quote_item_id` | `UUID` (`FK -> quote_items.id`) | Sim | Item específico do orçamento. |
| `chosen_tier_id` | `UUID` (`FK -> quote_item_tiers.id`) | Sim | Tiragem aprovada e paga pelo cliente. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Não | Cliente proprietário do pedido. |
| `sales_user_id` | `UUID` (`FK -> users.id`) | Não | Vendedor responsável pelo pedido. |
| `status` | `VARCHAR(25)` (`CHECK`) | Não | Coluna atual no Kanban: `'FILA_ARTE'`, `'AGUARDANDO_APROVACAO'`, `'PRE_IMPRESSAO'`, `'EM_PRODUCAO'`, `'TERCEIRIZADO'`, `'ACABAMENTO'`, `'QUALIDADE'`, `'EXPEDICAO'`, `'ENTREGUE'`, `'CANCELADA'`. |
| `art_approved` | `BOOLEAN` (default `false`) | Não | Trava de segurança: bloqueia entrada em `EM_PRODUCAO` enquanto `false` (exceto pedidos com arte fechada já validada). |
| `financial_lock_released` | `BOOLEAN` (default `false`) | Não | Marcado como `true` automaticamente na emissão pós-pagamento (ou via PIN gerencial para faturados). |
| `financial_lock_released_by` | `UUID` (`FK -> users.id`) | Sim | Gerente que autorizou liberação excepcional, se houver. |
| `priority` | `VARCHAR(15)` (`CHECK`) | Não | `'NORMAL'`, `'URGENTE'` ou `'CRITICA'` (ordena prioridade no Kanban). |
| `due_date` | `TIMESTAMPTZ` | Não | Prazo prometido de entrega/retirada. |
| `qr_code_token` | `UUID` (`UNIQUE`) | Não | Token embutido no QR Code impresso na OS Técnica para apontamento rápido nos tablets/leitores da fábrica. |
| `technical_specs` | `JSONB` | Não | Snapshot técnico completo (medidas, substrato, cores, acabamentos) **estritamente sem preços** para leitura segura na fábrica. |
| `created_at` | `TIMESTAMPTZ` | Não | Data/hora em que o pagamento gerou a OS. |
| `updated_at` | `TIMESTAMPTZ` | Sim | Última movimentação no Kanban. |

---

### 6.2 `artwork_files` `[Modelada SQL — Bloco 1.2]`
Repositório versionado de arquivos gráficos no Cloudflare R2. Nasce ligado ao `quote_id` quando o cliente manda os arquivos no WhatsApp e herda o `service_order_id` após o pagamento.
- **Relacionamentos:** `N:1` com `quotes` (`ON DELETE CASCADE`), `service_orders` (opcional) e `users`; `1:N` com `wa_media_attachments` e `artwork_approvals`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do arquivo. |
| `quote_id` | `UUID` (`FK -> quotes.id`) | Não | Orçamento ao qual o arquivo pertence desde o início do atendimento. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Sim | `NULL` antes do pagamento; preenchido automaticamente pelo listener `payment.confirmed`. |
| `uploaded_by_user_id` | `UUID` (`FK -> users.id`) | Sim | Arte-finalista que subiu prova ou arquivo fechado (nulo se enviado pelo cliente). |
| `source` | `VARCHAR(20)` (`CHECK`) | Não | `'WHATSAPP'`, `'UPLOAD_LINK'` (link público sem compressão) ou `'INTERNO'`. |
| `file_stage` | `VARCHAR(25)` (`CHECK`) | Não | `'CLIENTE_ORIGINAL'`, `'EDITAVEL'` (CDR/AI), `'PROVA_DIGITAL'` ou `'FECHADO_IMPRESSAO'` (PDF/X-1a). |
| `file_name` | `VARCHAR(255)` | Não | Nome original do arquivo. |
| `storage_key` | `TEXT` | Não | Chave do objeto dentro do bucket Cloudflare R2 (`R2_BUCKET_NAME`). |
| `sha256_hash` | `CHAR(64)` | Não | Hash criptográfico SHA-256 garantindo que o arquivo impresso é idêntico ao aprovado pelo cliente. |
| `version_number` | `INTEGER` (default `1`) | Não | Controle de revisões (`v1`, `v2`, `v3`) quando o cliente pede alterações. |
| `preflight_checklist` | `JSONB` | Sim | Respostas do checklist técnico (`{"cmyk": true, "curves": true, "dpi_300": true, "bleed_ok": true}`). |
| `is_preflight_ok` | `BOOLEAN` (default `false`) | Não | Obrigatório ser `true` para avançar a OS de `PRE_IMPRESSAO` para `EM_PRODUCAO`. |
| `created_at` | `TIMESTAMPTZ` | Não | Timestamp do upload. |

---

### 6.3 `wa_media_attachments` `[Modelada SQL — Bloco 1.2]`
Metadados de cada mídia recebida no WhatsApp e resultado da inspeção automática de resolução feita pelo worker (`Sharp`).
- **Relacionamentos:** `N:1` com `wa_messages` (`ON DELETE CASCADE`) e `artwork_files` (opcional).

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do anexo. |
| `message_id` | `UUID` (`FK -> wa_messages.id`) | Não | Mensagem do WhatsApp onde o arquivo chegou. |
| `wa_media_id` | `VARCHAR(120)` | Não | ID temporário da mídia nos servidores da Meta. |
| `file_name` | `VARCHAR(255)` | Sim | Nome do arquivo (quando enviado como documento). |
| `mime_type` | `VARCHAR(100)` | Não | Ex.: `'image/jpeg'`, `'application/pdf'`. |
| `file_size_bytes` | `BIGINT` | Sim | Tamanho em bytes. |
| `storage_key` | `TEXT` | Não | Cópia salva no R2 pelo worker antes que o link da Meta expire. |
| `resolution_dpi` | `INTEGER` | Sim | DPI detectado pelo `Sharp` em imagens. |
| `is_low_res_flagged` | `BOOLEAN` (default `false`) | Não | `true` quando o WhatsApp comprimiu a imagem abaixo do ideal; exibe alerta para o atendente enviar o link `/upload/[token]`. |
| `linked_artwork_file_id` | `UUID` (`FK -> artwork_files.id`) | Sim | Preenchido quando o atendente promove este anexo para um orçamento. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de recebimento. |

---

### 6.4 `artwork_approvals` `[Modelada SQL — Bloco 1.4]`
Registro jurídico imutável de aceite da prova digital pelo cliente.
- **Relacionamentos:** `N:1` com `service_orders` (`ON DELETE CASCADE`) e `artwork_files`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do protocolo de aprovação. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Não | OS aguardando aprovação de layout. |
| `artwork_file_id` | `UUID` (`FK -> artwork_files.id`) | Não | Versão exata da prova (`file_stage = 'PROVA_DIGITAL'`) submetida ao cliente. |
| `approval_token` | `UUID` (`UNIQUE`) | Não | Token público da URL `/aprovar/[token]`. |
| `status` | `VARCHAR(25)` (`CHECK`) | Não | `'PENDENTE'`, `'APROVADO'` ou `'ALTERACAO_SOLICITADA'`. |
| `channel` | `VARCHAR(20)` (`CHECK`) | Sim | `'WHATSAPP_BUTTON'` (clique direto no chat) ou `'WEB_PORTAL'` (página pública). |
| `approver_name` | `VARCHAR(120)` | Sim | Nome de quem aprovou. |
| `approver_phone` | `VARCHAR(20)` | Sim | Telefone que clicou no botão do WhatsApp. |
| `approver_ip` | `VARCHAR(45)` | Sim | IP registrado caso tenha aprovado pelo link web. |
| `terms_accepted` | `BOOLEAN` (default `false`) | Não | Confirmação do Termo de Responsabilidade de conferência de textos/cores. |
| `client_feedback` | `TEXT` | Sim | Descrição das correções solicitadas quando `status = 'ALTERACAO_SOLICITADA'`. |
| `sent_at` | `TIMESTAMPTZ` | Não | Quando a prova foi enviada ao cliente. |
| `responded_at` | `TIMESTAMPTZ` | Sim | Timestamp exato da resposta do cliente. |

---

### 6.5 `production_steps` `[Modelada SQL — Fase 2 / Bloco 2.1]`
Roteiro detalhado de etapas da OS por máquina/setor para apontamento via QR Code no chão de fábrica.
- **Relacionamentos:** `N:1` com `service_orders` (`ON DELETE CASCADE`), `machines` e `users` (`operator_user_id`); `1:N` com `production_scrap_logs`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da etapa produtiva. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Não | OS em execução. |
| `machine_id` | `UUID` (`FK -> machines.id`) | Sim | Máquina onde a etapa entra na fila. |
| `step_name` | `VARCHAR(80)` | Não | Ex.: `'Impressão Frente/Verso'`, `'Laminação Fosca'`, `'Corte Guilhotina'`. |
| `sequence_order` | `INTEGER` | Não | Ordem sequencial (`1`, `2`, `3`...) de execução na fábrica. |
| `status` | `VARCHAR(20)` (`CHECK`) | Não | `'PENDENTE'`, `'EM_ANDAMENTO'`, `'CONCLUIDO'` ou `'PAUSADO'`. |
| `operator_user_id` | `UUID` (`FK -> users.id`) | Sim | Operador que bipou o QR Code e executou a etapa. |
| `started_at` | `TIMESTAMPTZ` | Sim | Início real da etapa. |
| `finished_at` | `TIMESTAMPTZ` | Sim | Término real da etapa. |
| `estimated_minutes` | `INTEGER` | Sim | Tempo previsto calculado pelo orçamento. |
| `actual_minutes` | `INTEGER` | Sim | Tempo real gasto (usado no BI de gargalos e margem real). |

---

### 6.6 `production_scrap_logs` `[Modelada SQL — Fase 2 / Bloco 2.1]`
Registro de perdas e refugos ocorridos durante a produção.
- **Relacionamentos:** `N:1` com `service_orders`, `production_steps` (opcional), `materials` e `users`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do registro de perda. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Não | OS onde ocorreu o refugo. |
| `production_step_id` | `UUID` (`FK -> production_steps.id`) | Sim | Etapa específica onde houve a perda. |
| `material_id` | `UUID` (`FK -> materials.id`) | Não | Substrato perdido (gera `stock_movements` do tipo `'BAIXA_REFUGO'`). |
| `operator_user_id` | `UUID` (`FK -> users.id`) | Não | Operador que apontou a perda. |
| `wasted_qty` | `NUMERIC(12,4)` | Não | Quantidade perdida na `consumption_unit` do material. |
| `reason` | `VARCHAR(160)` | Não | Motivo (ex.: `'Atolamento de papel'`, `'Erro de corte'`, `'Falha de registro'`). |
| `reprint_required` | `BOOLEAN` (default `false`) | Não | Se `true`, devolve a etapa de impressão para a fila. |
| `created_at` | `TIMESTAMPTZ` | Não | Timestamp do apontamento. |

---

### 6.7 `outsourced_orders` `[Modelada SQL — Fase 3 / Bloco 3.2]`
Controle de etapas ou serviços enviados a fornecedores externos.
- **Relacionamentos:** `N:1` com `service_orders`, `suppliers` e `finishing_services`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da remessa externa. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Não | OS vinculada. |
| `supplier_id` | `UUID` (`FK -> suppliers.id`) | Não | Parceiro externo executor. |
| `finishing_service_id` | `UUID` (`FK -> finishing_services.id`) | Não | Serviço terceirizado contratado. |
| `cost_amount` | `NUMERIC(12,2)` | Não | Custo real cobrado pelo terceiro (gera título a pagar). |
| `sent_at` | `TIMESTAMPTZ` | Não | Data/hora de envio ao fornecedor. |
| `expected_return_at` | `TIMESTAMPTZ` | Não | Prazo combinado de retorno. |
| `returned_at` | `TIMESTAMPTZ` | Sim | Data/hora efetiva de retorno à gráfica. |
| `status` | `VARCHAR(20)` (`CHECK`) | Não | `'ENVIADO'`, `'CONCLUIDO'` ou `'ATRASADO'`. |

---

## Domínio 7: Estoque, Compras e Hodômetro de Máquinas

```text
[suppliers] 1 ─── N [purchase_invoices] 1 ─── N [stock_movements] N ─── 1 [materials]
                                                                               │
[users] 1 ─── N [machine_odometer_logs] N ─── 1 [machines] ────────────────────┘
```

### 7.1 `purchase_invoices` `[Modelada SQL — Fase 2 / Bloco 2.2]`
Notas Fiscais de entrada importadas via XML para alimentação de estoque e contas a pagar.
- **Relacionamentos:** `N:1` com `suppliers`; `1:N` com `stock_movements` e `financial_titles`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da compra. |
| `supplier_id` | `UUID` (`FK -> suppliers.id`) | Não | Fornecedor emissor da NF-e. |
| `nfe_access_key` | `CHAR(44)` (`UNIQUE`) | Sim | Chave de acesso de 44 dígitos da NF-e (impede importar o mesmo XML duas vezes). |
| `nfe_number` | `VARCHAR(20)` | Não | Número da Nota Fiscal. |
| `total_amount` | `NUMERIC(12,2)` | Não | Valor total da nota (gera título `'PAGAR'` em `financial_titles`). |
| `issued_at` | `TIMESTAMPTZ` | Não | Data de emissão da nota pelo fornecedor. |
| `imported_at` | `TIMESTAMPTZ` | Não | Data de importação no ERP. |

---

### 7.2 `stock_movements` `[Modelada SQL — Fase 2 / Bloco 2.2]`
Livro-razão (extrato) de todas as entradas e saídas físicas de matéria-prima.
- **Relacionamentos:** `N:1` com `materials`, `service_orders` (opcional), `purchase_invoices` (opcional) e `users` (opcional).

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da movimentação. |
| `material_id` | `UUID` (`FK -> materials.id`) | Não | Material movimentado. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Sim | Preenchido em baixas de produção e refugo. |
| `purchase_invoice_id` | `UUID` (`FK -> purchase_invoices.id`) | Sim | Preenchido em entradas por XML de compra. |
| `user_id` | `UUID` (`FK -> users.id`) | Sim | Usuário que realizou ajuste manual de inventário. |
| `movement_type` | `VARCHAR(25)` (`CHECK`) | Não | `'ENTRADA_COMPRA'`, `'BAIXA_PRODUCAO'`, `'BAIXA_REFUGO'` ou `'AJUSTE_INVENTARIO'`. |
| `qty_delta` | `NUMERIC(12,4)` | Não | Positivo para entrada (`+5000`), negativo para saída (`-340`). Atualiza `materials.stock_qty` na mesma transação. |
| `unit_cost_snapshot` | `NUMERIC(12,4)` | Não | Custo unitário vigente no momento da movimentação (preserva histórico para cálculo de margem real). |
| `created_at` | `TIMESTAMPTZ` | Não | Timestamp da movimentação. |

---

### 7.3 `machine_odometer_logs` `[Modelada SQL — Fase 3 / Bloco 3.2]`
Histórico de leitura dos contadores de cliques das impressoras para auditoria de outsourcing e manutenção preventiva.
- **Relacionamentos:** `N:1` com `machines` e `users`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da leitura. |
| `machine_id` | `UUID` (`FK -> machines.id`) | Não | Equipamento auditado. |
| `user_id` | `UUID` (`FK -> users.id`) | Não | Colaborador que registrou a leitura do contador. |
| `reading_value` | `BIGINT` | Não | Valor absoluto lido no visor/relatório da impressora. |
| `clicks_delta` | `BIGINT` | Não | Diferença calculada em relação à leitura anterior (`reading_value - current_odometer`). |
| `recorded_at` | `TIMESTAMPTZ` | Não | Data/hora da leitura. |

---

## Domínio 8: Financeiro, Pagamentos Modulares e Emissão Fiscal

```text
[quotes] 1 ─── N [financial_titles] 1 ─── N [payment_transactions] N ─── 1 [payment_providers]
                       │
[service_orders] 1 ────┼─── N [fiscal_documents]
                       │
[billing_batches] 1 ───┘ (Fase 3)
```

### 8.1 `billing_batches` `[Modelada SQL — Fase 3 / Bloco 3.1]`
Faturamento consolidado mensal para clientes corporativos (`billing_type = 'FATURADO_MENSAL'`).
- **Relacionamentos:** `N:1` com `customers`; `1:N` com `financial_titles` e `fiscal_documents`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do lote de faturamento. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Não | Cliente corporativo faturado. |
| `reference_period` | `VARCHAR(7)` | Não | Competência no formato `'AAAA-MM'` (ex.: `'2026-11'`). |
| `total_amount` | `NUMERIC(12,2)` | Não | Soma de todas as OSs incluídas no fechamento mensal. |
| `status` | `VARCHAR(15)` (`CHECK`) | Não | `'ABERTO'`, `'FECHADO'` ou `'PAGO'`. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de geração do lote. |

---

### 8.2 `financial_titles` `[Modelada SQL — Bloco 1.4]`
Contas a receber (nascem ligadas ao `quote_id` na aprovação do orçamento) e contas a pagar (fornecedores/despesas).
- **Relacionamentos:** `N:1` opcional com `customers`, `suppliers`, `quotes`, `service_orders`, `billing_batches` e `purchase_invoices`; `1:N` com `payment_transactions`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do título financeiro. |
| `title_type` | `VARCHAR(10)` (`CHECK`) | Não | `'RECEBER'` ou `'PAGAR'`. |
| `customer_id` | `UUID` (`FK -> customers.id`) | Sim | Preenchido quando `title_type = 'RECEBER'`. |
| `supplier_id` | `UUID` (`FK -> suppliers.id`) | Sim | Preenchido quando `title_type = 'PAGAR'` (Fase 2). |
| `quote_id` | `UUID` (`FK -> quotes.id`) | Sim | Preenchido assim que o cliente aprova o orçamento (antes da OS existir). |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Sim | Preenchido automaticamente quando o pagamento confirma e gera a OS. |
| `billing_batch_id` | `UUID` (`FK -> billing_batches.id`) | Sim | Preenchido no fechamento mensalista (Fase 3). |
| `purchase_invoice_id` | `UUID` (`FK -> purchase_invoices.id`) | Sim | Preenchido ao importar NF-e de compra (Fase 2). |
| `installment_label` | `VARCHAR(20)` (default `'1/1'`) | Não | Identificação da parcela (ex.: `'1/1'`, `'1/2 (Sinal)'`, `'2/2 (Entrega)'`). |
| `original_amount` | `NUMERIC(12,2)` | Não | Valor nominal do título. |
| `paid_amount` | `NUMERIC(12,2)` (default `0.00`) | Não | Valor efetivamente liquidado. |
| `due_date` | `DATE` | Não | Data de vencimento. |
| `status` | `VARCHAR(15)` (`CHECK`) | Não | `'ABERTO'`, `'PARCIAL'`, `'PAGO'`, `'VENCIDO'` ou `'CANCELADO'`. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de emissão do título. |

---

### 8.3 `payment_providers` `[Modelada SQL — Bloco 1.4]`
Registro dos adapters de pagamento disponíveis (`MANUAL`, `ASAAS`, `MERCADO_PAGO`, `EFI_BANK`, `STRIPE`), permitindo trocar o gateway ativo sem alterar regras de negócio.
- **Relacionamentos:** `1:N` com `payment_transactions`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do provedor. |
| `code` | `VARCHAR(40)` (`UNIQUE`) | Não | Chave que mapeia para a classe Adapter no NestJS (`'MANUAL'`, `'ASAAS'`, `'MERCADO_PAGO'`). |
| `display_name` | `VARCHAR(80)` | Não | Nome amigável exibido na configuração financeira. |
| `supported_methods` | `JSONB` (default `'["PIX"]'`) | Não | Lista de meios suportados por este adapter (`["PIX", "CREDIT_CARD", "BOLETO"]`). |
| `is_active` | `BOOLEAN` (default `true`) | Não | Habilita ou desabilita o provedor no sistema. |
| `is_default` | `BOOLEAN` (default `false`) | Não | Define qual adapter o módulo de pagamentos usa automaticamente ao aprovar um orçamento. |
| `created_at` | `TIMESTAMPTZ` | Não | Data de cadastro. |

---

### 8.4 `payment_transactions` `[Modelada SQL — Bloco 1.4]`
Tentativas e confirmações de cobrança geradas contra um `financial_titles` através de um `payment_providers`.
- **Relacionamentos:** `N:1` com `financial_titles` (`ON DELETE CASCADE`) e `payment_providers`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador interno da transação. |
| `financial_title_id` | `UUID` (`FK -> financial_titles.id`) | Não | Título financeiro que esta transação liquida. |
| `provider_id` | `UUID` (`FK -> payment_providers.id`) | Não | Provedor usado para gerar esta cobrança. |
| `external_charge_id` | `VARCHAR(150)` | Sim | ID da cobrança no gateway (ex.: `pay_123456` no Asaas). Possui constraint `UNIQUE (provider_id, external_charge_id)` para evitar duplicidade de webhook. |
| `payment_method` | `VARCHAR(25)` (`CHECK`) | Não | `'PIX'`, `'CREDIT_CARD'`, `'DEBIT_CARD'`, `'BOLETO'`, `'CASH'` ou `'TRANSFER'`. |
| `amount` | `NUMERIC(12,2)` | Não | Valor cobrado nesta transação. |
| `status` | `VARCHAR(20)` (`CHECK`) | Não | `'PENDING'`, `'PAID'`, `'FAILED'`, `'EXPIRED'` ou `'REFUNDED'`. Quando muda para `'PAID'`, dispara `payment.confirmed` e gera a OS. |
| `checkout_url` | `TEXT` | Sim | Link externo de pagamento (cartão/fatura) enviado no WhatsApp. |
| `payment_payload` | `JSONB` (default `{}`) | Não | Dados normalizados do meio de pagamento (`{"pix_copy_paste": "...", "pix_qrcode_base64": "..."}`). |
| `raw_webhook_payload` | `JSONB` | Sim | Payload bruto recebido do webhook do gateway para auditoria e troubleshooting. |
| `sent_via_wa` | `BOOLEAN` (default `false`) | Não | Indica se a cobrança já foi disparada na conversa do WhatsApp. |
| `paid_at` | `TIMESTAMPTZ` | Sim | Data/hora exata da liquidação. |
| `created_at` | `TIMESTAMPTZ` | Não | Data/hora de geração da cobrança. |

---

### 8.5 `fiscal_documents` `[Modelada SQL — Fase 3 / Bloco 3.1]`
Documentos fiscais eletrônicos emitidos (NFS-e para serviços sob encomenda, NF-e para revenda/industrialização, NFC-e para balcão).
- **Relacionamentos:** `N:1` opcional com `service_orders` e `billing_batches`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador do documento fiscal. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`) | Sim | OS faturada individualmente. |
| `billing_batch_id` | `UUID` (`FK -> billing_batches.id`) | Sim | Lote mensalista faturado de forma consolidada. |
| `doc_type` | `VARCHAR(10)` (`CHECK`) | Não | `'NFSE'`, `'NFE'` ou `'NFCE'`. |
| `doc_number` | `VARCHAR(20)` | Sim | Número oficial autorizado pela Prefeitura ou SEFAZ. |
| `series` | `VARCHAR(10)` | Sim | Série fiscal. |
| `access_key` | `CHAR(44)` (`UNIQUE`) | Sim | Chave de acesso de 44 dígitos (NF-e / NFC-e). |
| `status` | `VARCHAR(15)` (`CHECK`) | Não | `'RASCUNHO'`, `'PROCESSANDO'`, `'AUTORIZADA'`, `'CANCELADA'` ou `'REJEITADA'`. |
| `rejection_reason` | `TEXT` | Sim | Motivo de rejeição retornado pela SEFAZ/Prefeitura (ex.: CEP ou IE inválida). |
| `xml_storage_key` | `TEXT` | Sim | Caminho do arquivo XML autorizado no Cloudflare R2. |
| `pdf_storage_key` | `TEXT` | Sim | Caminho do PDF (DANFE / NFS-e) no R2 enviado ao cliente via WhatsApp. |
| `issued_at` | `TIMESTAMPTZ` | Sim | Data/hora de autorização fiscal. |

---

## Domínio 9: Expedição e Protocolo Digital de Entrega

```text
[service_orders] 1 ─── 1 [deliveries] N ─── 1 [customer_addresses]
```

### 9.1 `deliveries` `[Modelada SQL — Fase 2 / Bloco 2.3]`
Controle logístico, etiquetas de volume e comprovante digital de retirada/entrega.
- **Relacionamentos:** `1:1` (`UNIQUE`) com `service_orders`; `N:1` opcional com `customer_addresses`.

| Coluna | Tipo / Restrições | Nulo? | Para que serve & Regra no Código |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (`PK`) | Não | Identificador da expedição. |
| `service_order_id` | `UUID` (`FK -> service_orders.id`, `UNIQUE`) | Não | Garante exatamente um registro logístico por Ordem de Serviço. |
| `delivery_method` | `VARCHAR(25)` (`CHECK`) | Não | `'RETIRADA_BALCAO'`, `'MOTOBOY_PROPRIO'`, `'TRANSPORTADORA'` ou `'CORREIOS'`. |
| `address_id` | `UUID` (`FK -> customer_addresses.id`) | Sim | Endereço de destino (obrigatório quando não for `RETIRADA_BALCAO`). |
| `total_volumes` | `INTEGER` (default `1`) | Não | Quantidade de pacotes/caixas para impressão das etiquetas térmicas (`Vol. 1/N`). |
| `tracking_code` | `VARCHAR(80)` | Sim | Código de rastreio dos Correios/Transportadora. |
| `status` | `VARCHAR(20)` (`CHECK`) | Não | `'AGUARDANDO'`, `'EM_ROTA'` ou `'ENTREGUE'`. |
| `receiver_name` | `VARCHAR(120)` | Sim | Nome completo de quem recebeu ou retirou o material no balcão. |
| `receiver_document` | `VARCHAR(30)` | Sim | RG ou CPF de quem retirou o pedido. |
| `signature_storage_key` | `TEXT` | Sim | Imagem da assinatura capturada na tela touch do balcão/celular salva no R2. |
| `wa_confirmation_code` | `VARCHAR(6)` | Sim | Código OTP de 6 dígitos enviado no WhatsApp do cliente para validar a retirada com segurança. |
| `delivered_at` | `TIMESTAMPTZ` | Sim | Data/hora em que o pedido foi concluído e entregue. |