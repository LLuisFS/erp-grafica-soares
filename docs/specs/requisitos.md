# Especificação de Requisitos — ERP / MIS Gráfica Soares (v2.0)

**Projeto:** `erp-grafica-soares` (`@soares/*`)  
**Escopo:** Sistema interno de gestão gráfica com atendimento omnichannel via WhatsApp, motor de imposição multi-tiragem, cobrança modular e controle de produção.

> **Legenda de Roadmap:**  
> - **`[MVP]`** — Blocos 1.1 a 1.4 (Core, CRM Fiscal, Engenharia, WhatsApp, Orçamentos, Pagamento Modular e OS Pós-Pagamento).  
> - **`[Fase 2]`** — PCP detalhado por máquina, apontamento via QR Code, refugos, estoque/NF-e XML, contatos PJ e expedição.  
> - **`[Fase 3]`** — Faturamento mensalista agrupado, emissão fiscal (NFS-e/NF-e/NFC-e), retalhos, terceirização e portal/e-commerce de clientes.

---

## 1. Requisitos Funcionais (RF)

### Módulo A: Integração Nativa com WhatsApp & Atendimento Omnichannel

- **RF01 — Conexão via API de Mensageria (Abstração de Provedor) `[MVP]`:** O sistema deve integrar-se à WhatsApp Cloud API (Oficial Meta) e/ou gateways compatíveis (ex.: Evolution API) por meio da interface `IWhatsappProvider`, suportando múltiplos atendentes simultâneos conectados a um único número comercial da Gráfica Soares.
- **RF02 — Identificação Automática e Vínculo com CRM Interno `[MVP]`:** Ao receber uma mensagem, o sistema deve buscar o telefone normalizado (E.164) em `customers.whatsapp_phone` e `customer_phones.phone_e164`. Caso o contato ainda não esteja vinculado, o sistema deve identificar automaticamente CPF/CNPJ (11 ou 14 dígitos) enviado na conversa ou permitir o cadastro fiscal rápido pela barra lateral do chat (sem exigir criação de login/senha para o cliente).
- **RF03 — Captura Direta de Arquivos do Chat para o Orçamento `[MVP]`:** O atendente deve poder selecionar qualquer anexo recebido na conversa (PDF, JPG, PNG, ZIP) e promovê-lo diretamente como *Arquivo de Arte* (`artwork_files`) vinculado ao **Orçamento (`quote_id`)**, mesmo antes de a Ordem de Serviço existir.
- **RF04 — Alerta de Baixa Resolução e Link Público de Upload `[MVP]`:** O worker de mídia deve inspecionar automaticamente imagens recebidas pelo WhatsApp (`Sharp`), sinalizando quando houver compressão abaixo do DPI mínimo (`is_low_res_flagged = true`). O sistema deve gerar um link público temporário (`/upload/[token]`) vinculado ao orçamento para envio direto de arquivos pesados (PDF/X-1a, CDR, AI, TIFF) ao Cloudflare R2 sem compressão e sem login.
- **RF05 — Envio de Orçamento Interativo e Link Público da Proposta `[MVP]`:** O sistema deve gerar e enviar a proposta comercial em PDF com a identidade da Gráfica Soares diretamente no WhatsApp do cliente, acompanhada de botões interativos (`[Aprovar Orçamento]`) e/ou link público tokenizado (`/proposta/[token]`) para conferência e captura automática da tiragem escolhida.
- **RF06 — Fluxo de Aprovação de Arte via WhatsApp e Link Público `[MVP]`:** Após a emissão da OS, o arte-finalista deve poder disparar a prova digital no WhatsApp do cliente com botões interativos (`[Aprovar Arte]` / `[Solicitar Alteração]`) e link público `/aprovacao/[token]`, registrando a decisão e atualizando o status da OS automaticamente.
- **RF07 — Notificações Transacionais Automáticas (Gatilhos de Status) `[MVP]`:** O sistema deve disparar mensagens automáticas (via `wa_notification_templates`) nos eventos-chave do ciclo comercial e produtivo (*Orçamento Enviado*, *Cobrança Gerada*, *Pagamento Confirmado / OS Aberta*, *Prova Digital Disponível*, *OS Pronta na Expedição*).
- **RF08 — Cobrança Automatizada no Chat `[MVP]`:** Assim que o orçamento for aprovado, o sistema deve gerar a cobrança através do provedor de pagamento ativo (`IPaymentGateway`) e enviar automaticamente código **PIX Copia e Cola**, QR Code ou link de checkout (cartão) diretamente na conversa do cliente.

---

### Módulo B: Motor de Orçamentação & Engenharia de Produto

- **RF09 — Cálculo Geométrico de Imposição `[MVP]`:** O motor puro (`@soares/pricing-engine`) deve calcular automaticamente o melhor aproveitamento de corte (retrato vs. paisagem) da peça dentro da folha/bobina, descontando margem de pinça (`gripper_margin_mm`), sangria (`bleed_mm`) e calha entre peças (`spacing_mm`).
- **RF10 — Precificação Híbrida (Digital, Offset e Comunicação Visual) `[MVP]`:** O motor deve suportar simultaneamente cálculos baseados em:
  - *Tiragem + Custo por Clique/Página + Quebra de Setup* (Gráfica Digital — ex.: Epson WF-C5390, Konica Minolta C360i);
  - *Setup fixo + Chapas + Quebra de acerto + Milheiro* (Gráfica Offset);
  - *Área ($m^2$) ou Metro Linear + Aproveitamento de bobina/chapa rígida* (Comunicação Visual — ex.: Plotter 1600mm).
- **RF11 — Composição Dinâmica de Custos `[MVP]`:** O sistema deve somar automaticamente custo de substrato, pré-impressão, hora/clique de máquina, acabamentos (`POR_UNIDADE`, `POR_FOLHA`, `POR_M2`, `FIXO_SETUP`), impostos, comissão e multiplicador da tabela de preço.
- **RF12 — Simulação de Múltiplas Tiragens `[MVP]`:** O orçamento deve permitir calcular e comparar lado a lado até **4 faixas de quantidade** simultâneas para o mesmo item (ex.: 100, 500, 1.000 e 2.500 un.), preservando o snapshot completo de custos de cada tiragem.
- **RF13 — Tabelas de Preço por Perfil `[MVP]`:** O sistema deve aplicar automaticamente multiplicadores e descontos padrão conforme a categoria do cliente (`Balcão`, `Agência / Revenda`, `Corporativo`). Todos os seletores em orçamentos e cadastros devem filtrar `active = true` por padrão, preservando nomes e rótulos em registros históricos mesmo quando o item for inativado posteriormente.
- **RF14 — Duplicação de Pedido (Reimpressão) `[MVP / Fase 2]`:** O sistema deve permitir clonar um orçamento ou OS anterior mantendo especificações técnicas e arquivos aprovados, mas recalculando custos e preços com base nos insumos, máquinas e tabelas vigentes (sinalizando caso algum item original esteja inativo).

---

### Módulo C: CRM Interno, Vendas & PDV de Balcão

- **RF15 — Pipeline Comercial de Orçamentos `[MVP]`:** Visualização do funil comercial por estágio (`Rascunho`, `Enviado`, `Em Negociação`, `Aguardando Pagamento`, `Pago / Convertido`, `Perdido`, `Expirado` e `Cancelado` / arquivamento sem `DELETE` físico), exigindo motivo registrado ao marcar como `Perdido`.
- **RF15.1 — Lookup Omnichannel e Reativação Automática de Clientes `[MVP]`:** `GET /customers/lookup` localiza o cliente por telefone E.164 ou CPF/CNPJ mesmo quando inativo (`isInactive: !active`), e `POST /customers` com `document_cpf_cnpj` inativo reativa o registro (`active = true`, `deactivated_at = null`, `reactivated: true`) desde que não haja conflito de telefone com terceiro.
- **RF16 — Fluxo Desacoplado: Aprovação → Cobrança → OS Pós-Pagamento `[MVP]`:**
  - Ao aprovar um orçamento, o sistema muda o status para `AGUARDANDO_PAGAMENTO`, cria o título financeiro (`financial_titles`) e dispara a cobrança, **sem criar Ordem de Serviço ainda**.
  - Somente quando o pagamento for liquidado (evento interno `payment.confirmed`), o sistema deve criar automaticamente a `service_orders`, vincular os `artwork_files` do orçamento à nova OS, associar o `service_order_id` ao título financeiro e marcar o orçamento como `PAGO_CONVERTIDO`.
- **RF17 — Gestão de Contatos Corporativos (PJ) `[Fase 2]`:** Permitir cadastrar múltiplos contatos (`customer_contacts`) dentro de clientes PJ, diferenciando quem aprova arte, quem aprova orçamento e quem recebe documentos fiscais.
- **RF18 — Gestão de Carteira e Comissões `[MVP]`:** Vinculação de clientes e orçamentos a vendedores/atendentes específicos (`assigned_user_id`), calculando a provisão de comissão sobre vendas liquidadas.

---

### Módulo D: Pré-Impressão, Arte & Aprovação Digital

- **RF19 — Repositório Versionado de Arquivos (Orçamento → OS) `[MVP]`:** Organização estruturada no Cloudflare R2 separando *Arquivo Original do Cliente*, *Editável (CDR/AI)*, *Prova Digital* e *Arquivo Fechado para Impressão (PDF/X-1a)*, com controle de versão (`v1`, `v2`, `v3`) e integridade via `sha256_hash`.
- **RF20 — Checklist Técnico de Preflight `[MVP]`:** Antes de mover uma OS de `PRE_IMPRESSAO` para `EM_PRODUCAO`, o operador/arte-finalista deve validar obrigatoriamente o checklist técnico (Modo CMYK, fontes convertidas em curvas, resolução mínima 300 DPI, sangria e gabarito de corte).
- **RF21 — Log de Aceite Jurídico da Arte `[MVP]`:** Ao aprovar a prova digital (via botão no WhatsApp ou link público `/aprovacao/[token]`), o sistema deve gravar de forma imutável em `artwork_approvals`: timestamp, telefone/IP do aprovador, hash SHA-256 do arquivo aprovado e aceite explícito do Termo de Responsabilidade.
- **RF22 — Controle de Revisões e Horas de Arte `[Fase 2]`:** Contabilização do número de versões/alterações solicitadas pelo cliente e tempo gasto na criação, alertando quando exceder o limite gratuito previsto no orçamento.

---

### Módulo E: PCP (Planejamento e Controle da Produção) & Chão de Fábrica

- **RF23 — OS Técnica Blindada `[MVP]`:** Geração de ficha de produção (PDF A4/A5 e visualização web) exibindo número da OS, QR Code único, miniatura da arte, máquina destino, substrato, acabamentos e prazo, **omitindo estritamente qualquer valor financeiro**.
- **RF24 — Painel Kanban Macro da Fábrica em Tempo Real `[MVP]`:** Quadro visual atualizado via Socket.IO agrupando OSs por estágio (`Fila de Arte`, `Aguardando Aprovação`, `Pré-Impressão`, `Em Produção`, `Acabamento`, `Qualidade`, `Expedição`, `Entregue`) com alertas visuais de prazo (`due_date`).
- **RF25 — Rastreamento por QR Code e Roteiro por Máquina `[Fase 2]`:** Leitura do QR Code impresso na OS Técnica para apontar início/fim de cada etapa produtiva (`production_steps`) na fila específica de cada equipamento (`machines`).
- **RF26 — Apontamento de Perdas e Refugos `[Fase 2]`:** Registro de refugos (`production_scrap_logs`) com quantidade perdida e motivo, gerando baixa adicional no estoque e devolução automática à fila de impressão quando necessário.
- **RF27 — Gestão de Serviços Terceirizados `[Fase 3]`:** Controle de remessa e retorno de acabamentos ou impressões externas (`outsourced_orders`), vinculando custo do fornecedor e prazo à OS principal.

---

### Módulo F: Estoque, Insumos & Compras

- **RF28 — Conversão de Unidades de Compra vs. Consumo `[MVP]`:** Cadastro de materiais permitindo entrada em unidades comerciais (`RESMA_500`, `BOBINA_50M`, `LITRO`) e cálculo/baixa fracionada (`FOLHA`, `M2`, `METRO_LINEAR`, `ML`) via `conversion_factor`, com cálculo automático de `unit_cost = purchase_price / conversion_factor` na API (4 casas decimais, `conversion_factor > 0`, com fallback a `unit_cost` direto) e rota dedicada de ajuste manual de saldo (`POST /engineering/materials/:id/stock-adjustment`) impedindo estoque negativo.
- **RF29 — Baixa Automática de Matéria-Prima `[Fase 2]`:** Ao concluir a etapa de impressão da OS, abater automaticamente do estoque (`stock_movements`) o substrato calculado na ficha técnica somado à quebra de setup.
- **RF30 — Entrada de Notas via XML (NF-e) `[Fase 2]`:** Importação de XML de fornecedores (`purchase_invoices`) para atualizar saldo em estoque, custo unitário e gerar contas a pagar automaticamente.
- **RF31 — Controle de Retalhos Aproveitáveis `[Fase 3]`:** Cadastro de sobras utilizáveis de bobinas e chapas rígidas (`material_remnants`) com dimensões e localização física para reaproveitamento prioritário em novos orçamentos.
- **RF32 — Controle de Hodômetro / Cliques `[MVP / Fase 3]`:** Atualização dedicada do contador atual das máquinas (`PATCH /engineering/machines/:id/meter`, validando leitura monotônica `>= current_odometer`) no MVP e registro histórico periódico de leituras (`machine_odometer_logs`) na Fase 3 para conferência de contratos de locação/outsourcing.

---

### Módulo G: Financeiro, Cobrança Modular & Emissão Fiscal

- **RF33 — Camada Modular de Gateways de Pagamento (`IPaymentGateway`) `[MVP]`:** Arquitetura plug-and-play (`payment_providers` + `payment_transactions`) permitindo alternar entre cobrança manual (`ManualPixAdapter`) e gateways automáticos (`AsaasAdapter` no MVP; Mercado Pago, Efí ou Stripe no futuro) sem alterar o fluxo do ERP.
- **RF34 — Conciliação Automática de Pagamentos e Evento `payment.confirmed` `[MVP]`:** Processamento idempotente de webhooks de liquidação (PIX/Cartão) ou baixa manual pelo financeiro, quitando o `financial_titles` e emitindo o evento `payment.confirmed` para abertura imediata da OS.
- **RF35 — Liberação Excepcional para Clientes Faturados `[MVP / Fase 3]`:** Clientes cadastrados como `FATURADO_MENSAL` (dentro do `credit_limit` aprovado) ou liberados via PIN gerencial (`financial_lock_released`) podem ter a OS emitida sem pagamento prévio à vista, entrando no fechamento mensal (`billing_batches`).
- **RF36 — Emissão Fiscal Híbrida `[Fase 3]`:** Emissão integrada com prefeituras e SEFAZ (`fiscal_documents`) para **NFS-e** (serviços gráficos sob encomenda), **NF-e Modelo 55** (revenda/industrialização) e **NFC-e** (balcão).
- **RF37 — Gestão Financeira e DRE Gerencial `[Fase 2 / Fase 3]`:** Contas a pagar, contas a receber, fluxo de caixa diário/projetado e Demonstrativo de Resultado do Exercício (DRE).

---

### Módulo H: Expedição, Logística & BI

- **RF38 — Etiquetas de Volume e Protocolo Digital de Entrega `[Fase 2]`:** Geração de etiquetas térmicas (`Vol. 1/N`) e registro de retirada/entrega (`deliveries`) com assinatura digital ou código OTP de 6 dígitos enviado via WhatsApp.
- **RF39 — Relatório de Lucratividade Real (Orçado vs. Realizado) `[Fase 3]`:** Comparativo pós-produção confrontando os custos estimados no snapshot da tiragem (`quote_item_tiers`) com o consumo real, refugos e horas de máquina.

---

## 2. Regras de Negócio (RN)

- **RN01 — Emissão de OS Exclusivamente Pós-Pagamento:** Para clientes `AVISTA`, nenhuma Ordem de Serviço pode ser criada no banco antes da confirmação financeira (`payment.confirmed`). Orçamentos aprovados permanecem em `AGUARDANDO_PAGAMENTO` até a compensação.
- **RN02 — CRM Estritamente Interno no MVP e Links Públicos Tokenizados:** Clientes (`customers`) não possuem login ou senha no ERP (o portal futuro fica isolado em `customer_auth_accounts` na Fase 3). No MVP, clientes interagem exclusivamente via links públicos tokenizados (`/upload/[token]`, `/proposta/[token]` e `/aprovacao/[token]`), e a identificação interna ocorre por telefone (E.164) ou CPF/CNPJ (11/14 dígitos). No lookup (`GET /customers/lookup`), clientes inativos continuam sendo retornados com `isInactive: true`; no cadastro (`POST /customers`), CPF/CNPJ já existente e inativo (sem conflito de telefone com terceiro) reativa o registro automaticamente (`active = true`, `deactivated_at = null`, `reactivated: true`).
- **RN03 — Blindagem de Produção sem Aprovação de Arte:** Nenhuma OS que envolva criação ou ajuste de layout pode avançar para `EM_PRODUCAO` sem `art_approved = true` registrado via aceite formal (`artwork_approvals`) e checklist de preflight concluído (`is_preflight_ok = true`).
- **RN04 — Quebra Técnica Obrigatória (Setup):** Todo cálculo de impressão deve somar automaticamente `machines.setup_waste_sheets` ao consumo líquido de papel para calibragem de cor e corte.
- **RN05 — Validade Dinâmica de Propostas:** Orçamentos possuem data limite (`valid_until`). Após o vencimento, o sistema bloqueia a aprovação direta e exige recálculo com os custos vigentes dos insumos.
- **RN06 — Alçada de Desconto com PIN Gerencial:** Atendentes possuem teto máximo de desconto (`users.max_discount_pct`). Descontos acima desse limite exigem validação do PIN de um perfil gerencial (`users.approval_pin_hash`), registrando o autorizador em `discount_authorized_by`.
- **RN07 — Isolamento de Dados Financeiros na Fábrica:** Perfis operacionais (`ARTE_FINALISTA`, `OPERADOR_MAQUINA`) têm isolamento financeiro completo: nunca recebem valores de venda, custos de insumos, `setup_cost`, `unit_cost` ou margens nas respostas da API (`FinancialSanitizerInterceptor`), no Kanban ou na OS Técnica impressa, além de receberem `403 Forbidden` em rotas financeiras e de engenharia (`/engineering/*`).
- **RN08 — Prioridade de Retalhos `[Fase 3]`:** Ao orçar itens em bobina ou chapa rígida, o motor deve verificar primeiro se há `material_remnants` disponíveis com dimensões compatíveis antes de sugerir consumo de material inteiro.
- **RN09 — Janela de 24h do WhatsApp:** O sistema deve rastrear `last_customer_message_at` e `window_expires_at` (`last_customer_message_at + 24h`) em `wa_conversations`. Para disparos automáticos fora dessa janela (`window_expires_at < now()`), a API Oficial da Meta exige o envio via `wa_notification_templates` pré-aprovados.
- **RN10 — Desativação Lógica (`RN-Soft-Deactivation`), Rotas Dedicadas e Política de Exclusão Física (`DELETE`):**
  - As entidades `customers`, `price_tables`, `machines`, `materials`, `finishing_services` e `product_templates` adotam `active` (`BOOLEAN NOT NULL DEFAULT true`) e `deactivated_at` (`TIMESTAMPTZ`, nullable).
  - Listagens `GET` (e seletores em orçamentos/cadastros) filtram `active = true` por padrão, aceitando `?includeInactive=true` nas listagens administrativas; registros históricos continuam exibindo o nome/rótulo original mesmo se o item for inativado depois.
  - Endpoints genéricos `PATCH .../:id` bloqueiam alteração direta de `active` (via `.strict()`/`.omit()`), além de bloquearem `currentOdometer` em `machines` e `stockQty` em `materials`.
  - Alterações de estado crítico usam rotas dedicadas: `PATCH .../:id/status` (`{ "active": boolean }`), `PATCH /users/:id/status`, `PATCH /engineering/machines/:id/meter` e `POST /engineering/materials/:id/stock-adjustment`.
  - **Exclusão física (`DELETE`) é proibida** para `quotes` (usar cancelamento/arquivamento), `users` (usar `PATCH /users/:id/status` preservando autoria histórica) e histórico de arquivos/anexos (`artwork_files`, `wa_media_attachments`).
  - Quando permitida exclusivamente a `ADMIN` (`crm.delete`, `engineering.delete`), a exclusão física só é concluída se não houver vínculos históricos/FK (`23503`); caso existam, retorna `409 Conflict` orientando o uso da rota `/status`.

---

## 3. Matriz de Automação WhatsApp (Gatilhos do Sistema)

| Evento no Sistema | Ação Automática no WhatsApp | Componentes Enviados |
| :--- | :--- | :--- |
| **Orçamento Enviado (`QUOTE_SENT`)** | Envia proposta comercial ao cliente | Resumo dos itens + PDF do Orçamento + Botão `[Aprovar Orçamento]` e link `/proposta/[token]` |
| **Orçamento Aprovado (`QUOTE_APPROVED`)** | Inicia cobrança financeira (`AGUARDANDO_PAGAMENTO`) | Valor da tiragem escolhida + Código PIX Copia e Cola / QR Code / Link Cartão |
| **Pagamento Confirmado (`PAYMENT_CONFIRMED`)** | Emite a OS automaticamente e avisa o cliente | Confirmação de recebimento + Número da OS (`#code`) + Previsão de entrega |
| **Prova Digital Publicada (`ART_PROOF_READY`)** | Solicita conferência formal do layout | Imagem/PDF da prova + Termo de Responsabilidade + Botões `[Aprovar Arte]` / `[Solicitar Alteração]` (e link `/aprovacao/[token]`) |
| **Arte Aprovada (`ART_APPROVED`)** | Confirma bloqueio de alterações e envio à impressão | Protocolo de aceite (`sha256_hash`) + Status `"Liberado para Produção"` |
| **OS Movida para "Expedição" (`OS_READY_PICKUP`)** | Avisa que o pedido está finalizado | Endereço/horário para retirada (ou aviso de despacho) + Código OTP de entrega |
| **Nota Fiscal Emitida (`FISCAL_AUTHORIZED`) `[Fase 3]`** | Encaminha documentos fiscais | PDF (DANFE / NFS-e) + XML autorizado |

---

## 4. Requisitos Não-Funcionais (RNF)

- **RNF01 — Arquitetura Assíncrona e Idempotência:** Webhooks de entrada do WhatsApp e de gateways de pagamento, além da geração de PDFs, devem ser processados via filas assíncronas (`BullMQ` + `Redis`) com idempotência garantida por chaves únicas (`wamid` e `UNIQUE(provider_id, external_charge_id)`).
- **RNF02 — Armazenamento Especializado de Arquivos (Cloudflare R2):** Arquivos gráficos pesados devem ser armazenados no Cloudflare R2 utilizando **Presigned URLs** para upload/download direto sem sobrecarregar a memória RAM da API NestJS.
- **RNF03 — Desempenho do Motor de Orçamento:** O `@soares/pricing-engine` deve executar cálculos de imposição e múltiplas tiragens em tempo inferior a **300ms** (rodando tanto no cliente Next.js quanto no servidor NestJS).
- **RNF04 — Atualização em Tempo Real:** A caixa de entrada omnichannel do WhatsApp e o Kanban da fábrica devem sincronizar eventos instantaneamente via WebSockets (`Socket.IO`), sem necessidade de recarregamento manual da página.
- **RNF05 — Controle de Acesso Granular (RBAC) e Auditoria:** Autenticação interna via JWT com guards baseados em permissões (`@RequirePermissions`), autorização de exceções via PIN gerencial e logs imutáveis (`audit_logs`) para operações críticas.
- **RNF06 — Usabilidade no Chão de Fábrica:** As telas operacionais devem possuir interface responsiva de alto contraste e suporte à leitura do QR Code da OS Técnica via câmera de tablets/celulares ou leitores USB.
- **RNF07 — Segurança e Conformidade com a LGPD:** Credenciais sensíveis isoladas em variáveis de ambiente fora do controle de versão, tráfego criptografado (TLS) e backups automatizados do PostgreSQL.

---

## 5. Mapeamento de Telas, Shells e Layouts do MVP (`@soares/web`)

A interface do MVP é organizada em **3 shells** (17 telas principais) + **1 modal transversal de PIN gerencial** + **3 layouts de documento/etiqueta para impressão**, detalhados integralmente em [docs/architecture/telas-e-shells-mvp.md](../architecture/telas-e-shells-mvp.md):

- **Shell 1 — Público / Autenticação (4 telas):** Login da Equipe (`/login`), Upload Público sem Compressão (`/upload/[token]`), Proposta Interativa do Cliente (`/proposta/[token]`) e Aprovação Digital de Arte (`/aprovacao/[token]`).
- **Shell 2 — ERP Administrativo & Comercial (11 telas):** Dashboard Operacional/Comercial (`/`), Caixa de Entrada Omnichannel WhatsApp (`/atendimento`), Clientes CRM (`/clientes`), Ficha 360° do Cliente (`/clientes/[id]`), Funil/Lista de Orçamentos (`/orcamentos`), Simulador Multi-Tiragem (`/orcamentos/novo` e `/orcamentos/[id]`), Engenharia: Tabelas de Preço & Gabaritos (`/engenharia/comercial`), Engenharia: Máquinas & Hodômetro (`/engenharia/maquinas`), Engenharia: Materiais & Estoque (`/engenharia/materiais`), Engenharia: Acabamentos (`/engenharia/acabamentos`) e Financeiro / Cobranças & Usuários (`/financeiro` e `/configuracoes/equipe`, conforme detalhamento em `telas-e-shells-mvp.md`).
- **Shell 3 — Chão de Fábrica / Operacional Blindado (2 telas):** Kanban Macro da Fábrica em Tempo Real (`/producao/kanban`) e Detalhe Técnico / Pré-Impressão da OS (`/producao/os/[id]`) — estritamente sem valores financeiros (`RN07`).
- **Componentes Transversais e Impressão:** Modal de Autorização via PIN Gerencial (`RN06`) + 3 layouts (`Proposta Comercial PDF`, `OS Técnica Blindada PDF A4/A5 com QR Code`, `Etiqueta Térmica de Volume`).