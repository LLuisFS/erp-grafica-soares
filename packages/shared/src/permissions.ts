export const PERMISSIONS_CATALOG = [
    { key: 'system.all',                module: 'Sistema',      label: 'Acesso irrestrito (Administrador)' },
    { key: 'quote.create',              module: 'Comercial',    label: 'Criar e editar orçamentos' },
    { key: 'quote.approve_discount',    module: 'Comercial',    label: 'Autorizar descontos acima da alçada (PIN)', },
    { key: 'crm.manage',                module: 'CRM',          label: 'Cadastrar e editar clientes' },
    { key: 'crm.view',                  module: 'CRM',          label: 'Visualizar cadastro de clientes' },
    { key: 'whatsapp.manage',           module: 'Atendimento',  label: 'Atender conversas no WhatsApp' },
    { key: 'artwork.manage',            module: 'Produção',     label: 'Subir provas digitais e validar preflight' },
    { key: 'production.view',           module: 'Produção',     label: 'Visualizar Kanban da fábrica' },
    { key: 'production.update_step',    module: 'Produção',     label: 'Mover OS e apontar etapas' },
    { key: 'production.manage',         module: 'Produção',     label: 'Gerenciar prioridades e fila de PCP' },
    { key: 'os.view_financial',         module: 'Financeiro',   label: 'Visualizar preços, custos e margens' },
    { key: 'finance.manage',            module: 'Financeiro',   label: 'Gerenciar cobranças, baixas manuais e caixa', },
    { key: 'engineering.manage',        module: 'Engenharia',   label: 'Editar máquinas, materiais e tabelas de preço', },
] as const;

export type PermissionKey = (typeof PERMISSIONS_CATALOG)[number]['key'];

export const ROLE_NAMES = [
    'ADMIN',
    'GERENTE',
    'ATENDENTE',
    'ARTE_FINALISTA',
    'OPERADOR_MAQUINA',
    'FINANCEIRO',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const FINANCIAL_RESTRICTED_ROLES: readonly string[] = [
    'OPERADOR_MAQUINA',
    'ARTE_FINALISTA',
];