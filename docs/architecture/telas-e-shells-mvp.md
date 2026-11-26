# Arquitetura de Telas, Shells e Layouts do MVP (`@soares/web`)

Documento de planejamento da interface web Next.js (`apps/web`, Issue #7+), consolidando os **3 Shells** (17 telas principais), o **Modal Transversal de Autorização por PIN** e os **3 Layouts de Impressão / PDF**, em estrita conformidade com as regras `RN02`, `RN06`, `RN07` e `RN10`.

---

## 1. Visão Geral dos 3 Shells

```text
  @soares/web (Next.js App Router)
  ├── Shell 1: Público & Autenticação (sem sidebar interna; sem login de cliente — RN02)
  │     ├── 1.  /login                 ──► Login da equipe interna
  │     ├── 2.  /upload/[token]        ──► Envio de arte em alta (R2 Presigned URL)
  │     ├── 3.  /proposta/[token]      ──► Conferência e aprovação de orçamento/tiragem
  │     └── 4.  /aprovacao/[token]     ──► Conferência da prova digital + Termo SHA-256
  │
  ├── Shell 2: ERP Administrativo & Comercial (Sidebar completa + filtros RBAC por PermissionKey)
  │     ├── 5.  /                      ──► Dashboard Comercial e Operacional
  │     ├── 6.  /atendimento           ──► Caixa de Entrada Omnichannel WhatsApp + Ficha Rápida CRM
  │     ├── 7.  /clientes              ──► Listagem CRM (ativos padrão + ?includeInactive=true)
  │     ├── 8.  /clientes/[id]         ──► Ficha 360° do Cliente (telefones, endereços, status)
  │     ├── 9.  /orcamentos            ──► Funil / Pipeline de Orçamentos (sem DELETE físico)
  │     ├── 10. /orcamentos/novo       ──► Simulador Multi-Tiragem (@soares/pricing-engine)
  │     ├── 11. /orcamentos/[id]       ──► Detalhe, Duplicação, Envio WhatsApp e Link Público
  │     ├── 12. /engenharia            ──► Catálogo Técnico: Máquinas, Materiais, Acabamentos, Gabaritos & Tabelas
  │     ├── 13. /financeiro            ──► Títulos a Receber/Pagar, Baixa Manual e Gateways
  │     ├── 14. /configuracoes/equipe  ──► Gestão de Usuários e Cargos RBAC (PATCH /users/:id/status)
  │     └── 15. /configuracoes/whatsapp──► Templates Meta/Evolution e Provedores
  │
  └── Shell 3: Chão de Fábrica / Operacional Blindado (Interface alto contraste para tablets/desktop)
        ├── 16. /producao/kanban       ──► Kanban Macro em Tempo Real (Socket.IO)
        └── 17. /producao/os/[id]      ──► Detalhe Técnico da OS, Checklist Preflight & Prova Digital
            ⚠ Isolamento RN07: zero valores, custos, markups ou margens renderizados na UI ou API.

  Componentes Transversais & Impressão:
  ├── [Modal] Autorização via PIN Gerencial (acionado quando desconto > max_discount_pct ou exceção)
  └── [3 Layouts PDF/Etiqueta]
        ├── Layout 1: Proposta Comercial PDF (com comparativo até 4 tiragens)
        ├── Layout 2: OS Técnica Blindada PDF A4/A5 (com QR Code + especificações sem preços)
        └── Layout 3: Etiqueta Térmica de Volume (Vol. 1/N + Código da OS + Destinatário)
```

---

## 2. Catálogo Detalhado das 17 Telas do MVP

### Shell 1 — Público & Autenticação (4 telas)

| # | Rota Next.js | Público-Alvo | Endpoints / Integrações | Regras & Comportamento |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `/login` | Equipe interna (`users`) | `POST /auth/login` | Armazena Bearer JWT; redireciona perfis de fábrica (`OPERADOR_MAQUINA`, `ARTE_FINALISTA`) direto ao Shell 3 (`/producao/kanban`) e demais perfis ao Shell 2. Clientes nunca logam aqui (`RN02`). |
| **2** | `/upload/[token]` | Cliente final (sem login) | Rotas públicas tokenizadas + R2 Presigned URL | Permite enviar arquivos pesados (PDF/X-1a, CDR, AI, TIFF) sem compressão do WhatsApp diretamente ao bucket R2 vinculado ao `quote_id` (`RF04`). Bloqueia tokens expirados. |
| **3** | `/proposta/[token]` | Cliente final (sem login) | Rota pública de proposta + `quotes` / `quote_item_tiers` | Exibe resumo dos itens, comparativo das tiragens simuladas, validade (`valid_until`) e permite escolher a tiragem e aprovar (`AGUARDANDO_PAGAMENTO` + PIX/Checkout). |
| **4** | `/aprovacao/[token]` | Cliente final (sem login) | Rota pública de prova + `artwork_approvals` | Exibe prova digital, Termo de Responsabilidade obrigatório (`terms_accepted = true`), botão `[Aprovar Arte]` (grava IP, timestamp e `sha256_hash`) ou `[Solicitar Alteração]` com feedback (`RF06`, `RF21`). |

---

### Shell 2 — ERP Administrativo & Comercial (11 telas)

| # | Rota Next.js | Permissões (`PermissionKey`) | Endpoints / Módulos Consumidos | Regras & Comportamento |
| :---: | :--- | :--- | :--- | :--- |
| **5** | `/` | Usuário autenticado (exceto fábrica pura) | `GET /auth/me`, resumos de `quotes`, `service_orders`, `financial_titles` | Visão executiva diária: orçamentos em aberto, pagamentos aguardando liquidação, OSs próximas do `due_date` e alertas de estoque mínimo (`stockQty <= minStockQty`). |
| **6** | `/atendimento` | `whatsapp.manage` + `crm.view` / `crm.manage` | WebSocket `Socket.IO` + `GET /customers/lookup` + `POST /customers` | Caixa de entrada omnichannel em tempo real. Exibe banner de **janela de 24h** (`last_customer_message_at` / `window_expires_at`), barra lateral com lookup automático (`isInactive`, `isNewPhoneCustomer`), promoção de anexos para orçamento e disparo de templates. |
| **7** | `/clientes` | `crm.view` (`crm.manage`, `crm.delete`) | `GET /customers`, `POST /customers`, `PATCH /customers/:id/status`, `DELETE /customers/:id` | Listagem paginada filtrando `active = true` por padrão (toggle *Exibir inativos* envia `?includeInactive=true`). Modal de cadastro rápido com reativação automática por CPF/CNPJ (`reactivated: true`) e exclusão física visível apenas para `ADMIN` (`crm.delete`). |
| **8** | `/clientes/[id]` | `crm.view` (`crm.manage`) | `GET /customers/:id`, `PATCH /customers/:id`, `/phones`, `/addresses`, `PATCH .../:id/status` | Ficha 360° do cliente: dados fiscais (PF/PJ), tabela de preço vinculada, carteira (`assignedUser`), gestão de telefones E.164 secundários, endereços de entrega/cobrança e histórico de orçamentos/OSs. |
| **9** | `/orcamentos` | `quote.create` | Pipeline de `quotes` (em implementação) | Lista e funil Kanban comercial por estágio (`RASCUNHO`, `ENVIADO`, `NEGOCIACAO`, `AGUARDANDO_PAGAMENTO`, `PAGO_CONVERTIDO`, `PERDIDO`, `EXPIRADO`, `CANCELADO`). Sem botão de `DELETE` físico (`RN10`). |
| **10** | `/orcamentos/novo` | `quote.create` | `@soares/pricing-engine` + `GET /engineering/*` (`active = true`) + `GET /customers` | Simulador multi-tiragem (até 4 faixas simultâneas por item). Todos os seletores (clientes, máquinas, materiais, acabamentos, gabaritos, tabelas) carregam apenas `active = true` por padrão. Aciona **Modal de PIN** se desconto `> max_discount_pct`. |
| **11** | `/orcamentos/[id]` | `quote.create` | Detalhe de `quotes` + duplicação + envio WhatsApp | Edição de rascunhos, **Duplicar Pedido** (clona itens/artes e recalcula com custos atuais alertando itens inativos), cancelamento/arquivamento (`CANCELADO`/`PERDIDO` com `loss_reason`), geração do PDF comercial e disparo de `/proposta/[token]` + `/upload/[token]`. |
| **12** | `/engenharia` | `engineering.view` (`engineering.manage`, `engineering.delete`) | `/engineering/{price-tables, machines, materials, finishing-services, product-templates}` | Hub com abas para os 5 cadastros técnicos. Inclui cálculo em tempo real de `purchasePrice / conversionFactor` em materiais, modal dedicado de **Ajuste de Estoque** (`POST .../stock-adjustment`), leitura de **Hodômetro** (`PATCH .../meter`), toggle de status (`PATCH .../status`) e `DELETE` restrito a `crm`/`engineering.delete` (`ADMIN`). |
| **13** | `/financeiro` | `finance.manage` / `os.view_financial` | `financial_titles`, `payment_transactions`, `payment_providers` | Gestão de cobranças PIX/Cartão, baixa manual auditável (`audit_logs`), liberação excepcional de OS via **Modal de PIN** (`RF35`) e acompanhamento de recebíveis/pagáveis. |
| **14** | `/configuracoes/equipe` | `system.all` (`ADMIN`) | `users` + `roles` (`PATCH /users/:id/status`) | Cadastro de colaboradores internos, atribuição de cargo RBAC, definição de `max_discount_pct`, `commission_pct` e PIN gerencial (`approval_pin_hash`). Inativação exclusiva via `PATCH /users/:id/status` (sem `DELETE` físico). |
| **15** | `/configuracoes/whatsapp` | `system.all` / `whatsapp.manage` | `wa_notification_templates` + provedores | Configuração do provedor ativo (`Meta Cloud API` / `Evolution API`) e preview/ativação dos templates automáticos (`QUOTE_SENT`, `PAYMENT_REQUEST`, `PAYMENT_CONFIRMED`, `ART_PROOF_READY`, `OS_READY_PICKUP`). |

---

### Shell 3 — Chão de Fábrica / Operacional Blindado (2 telas)

> **Regra Absoluta (`RN07`):** Nenhuma tela deste shell renderiza preços, custos unitários, custos de setup, markups, descontos ou limites de crédito. Os endpoints consumidos já chegam sanitizados pelo `FinancialSanitizerInterceptor`, e rotas de `/engineering/*` e `/financeiro` são bloqueadas com `403`.

| # | Rota Next.js | Permissões (`PermissionKey`) | Endpoints / Integrações | Regras & Comportamento |
| :---: | :--- | :--- | :--- | :--- |
| **16** | `/producao/kanban` | `production.view` (`production.update_step`, `production.manage`) | `service_orders` + WebSocket `Socket.IO` | Quadro Kanban macro em tempo real (`FILA_ARTE`, `AGUARDANDO_APROVACAO`, `PRE_IMPRESSAO`, `EM_PRODUCAO`, `ACABAMENTO`, `QUALIDADE`, `EXPEDICAO`, `ENTREGUE`), com leitura rápida de QR Code da OS, destaque de `due_date` e `priority` (`NORMAL`, `URGENTE`, `CRITICA`), bloqueando arraste para `EM_PRODUCAO` sem `art_approved` e `is_preflight_ok` (`RN03`). |
| **17** | `/producao/os/[id]` | `production.view` (`artwork.manage`, `production.update_step`) | `service_orders`, `artwork_files`, `artwork_approvals` | Ficha técnica da OS (`technical_specs` sem preços), upload versionado de prova digital (`v1`, `v2`, `v3`), disparo da prova para WhatsApp / `/aprovacao/[token]`, preenchimento obrigatório do checklist de preflight (`CMYK`, `curvas`, `300 DPI`, `sangria`) e fechamento `PDF/X-1a`. |

---

## 3. Modal Transversal & 3 Layouts de Impressão / PDF

### Modal Transversal: Autorização via PIN Gerencial (`POST /auth/verify-pin`)
- **Quando abre:** sempre que um atendente tenta aplicar desconto acima de `user.maxDiscountPct` (`RN06`) ou liberar uma OS excepcionalmente fora das regras padrão (`UC14`).
- **Comportamento:** recebe PIN numérico (4–6 dígitos) com `managerEmail`/`managerUserId` opcional, valida contra `users.approval_pin_hash` de um perfil com `quote.approve_discount` ou `system.all` e retorna `{ authorized: true, authorizedBy }` para registro auditável.

### 3 Layouts de PDF e Etiqueta (`design/pdf-layouts/` + Worker BullMQ)

| Layout | Formato | Origem dos Dados | Restrição de Segurança |
| :--- | :--- | :--- | :--- |
| **1. Proposta Comercial PDF** | A4 (enviado no WhatsApp / `/proposta/[token]`) | `quotes`, `quote_items`, `quote_item_tiers`, `quote_item_finishings`, `customers` | Exibe preços unitários/totais por tiragem, validade e condições comerciais — **nunca** exibe custos internos de máquina/material nem margem de lucro. |
| **2. OS Técnica Blindada PDF** | A4 / A5 (impresso para o chão de fábrica) | `service_orders.technical_specs`, `machines`, `materials`, `finishing_services` | Exibe código `#OS`, **QR Code único** (`qr_code_token`), miniatura da arte, máquina, substrato, medidas e acabamentos — **estritamente zero valores financeiros** (`RF23`, `RN07`). |
| **3. Etiqueta Térmica de Volume** | Bobina térmica (ex.: 100×150mm / 100×80mm) | `service_orders`, `customers`, `deliveries` | Exibe código `#OS`, contador `Vol. 1/N`, nome/razão social do destinatário, método (`RETIRADA_BALCAO` / entrega) e endereço quando aplicável (`RF38`). |
