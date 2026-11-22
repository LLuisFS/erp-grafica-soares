import { z } from 'zod';

/** Remove tudo que não for dígito; usado na sanitização de CPF, CNPJ, CEP e telefones antes de salvar no PostgreSQL. */
export function onlyDigits(value: string): string {
    return value.replace(/\D/g, '');
}

/** Valida CPF (11 dígitos) rejeitando sequências repetidas e conferindo os dois dígitos verificadores (módulo 11). */
export function isValidCpf(raw: string): boolean {
    const digits = onlyDigits(raw);
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
        return false;
    }

    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += Number(digits[i]) * (10 - i);
    }
    let firstCheck = (sum * 10) % 11;
    if (firstCheck === 10) firstCheck = 0;
    if (firstCheck !== Number(digits[9])) {
        return false;
    }

    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += Number(digits[i]) * (11 - i);
    }
    let secondCheck = (sum * 10) % 11;
    if (secondCheck === 10) secondCheck = 0;
    return secondCheck === Number(digits[10]);
}

/** Valida CNPJ (14 dígitos) rejeitando sequências repetidas e conferindo os dígitos verificadores da Receita Federal. */
export function isValidCnpj(raw: string): boolean {
    const digits = onlyDigits(raw);
    if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
        return false;
    }

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += Number(digits[i]) * weights1[i]!;
    }
    const rem1 = sum % 11;
    const firstCheck = rem1 < 2 ? 0 : 11 - rem1;
    if (firstCheck !== Number(digits[12])) {
        return false;
    }

    sum = 0;
    for (let i = 0; i < 13; i++) {
        sum += Number(digits[i]) * weights2[i]!;
    }
    const rem2 = sum % 11;
    const secondCheck = rem2 < 2 ? 0 : 11 - rem2;
    return secondCheck === Number(digits[13]);
}

/** Despacha a validação de dígito verificador conforme o tamanho do documento (11 = CPF, 14 = CNPJ). */
export function isValidCpfOrCnpj(raw: string): boolean {
    const digits = onlyDigits(raw);
    if (digits.length === 11) return isValidCpf(digits);
    if (digits.length === 14) return isValidCnpj(digits);
    return false;
}

/**
 * Normaliza telefones para E.164 sem `+`, prefixando DDI `55` em números brasileiros de 10 ou 11 dígitos.
 * Garante correspondência exata entre `customers.whatsapp_phone`, `customer_phones.phone_e164` e webhooks do WhatsApp (RF02).
 */
export function normalizePhoneE164(raw: string): string {
    const digits = onlyDigits(raw).replace(/^0+/, '');
    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }
    return digits;
}

/** Schema Zod de telefone normalizado em E.164 (12 a 15 dígitos), reutilizado no CRM e na busca omnichannel. */
export const phoneE164Schema = z
    .string()
    .trim()
    .transform(normalizePhoneE164)
    .refine(
        (val) => /^\d{12,15}$/.test(val),
        'Telefone inválido. Informe DDD + número (ex: 61999998888 ou 5561999998888).',
    );

/** Schema Zod de CPF/CNPJ salvo apenas com dígitos em `customers.document_cpf_cnpj`, validando tamanho e dígito verificador. */
export const cpfCnpjSchema = z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine(
        (val) => val.length === 11 || val.length === 14,
        'CPF deve conter 11 dígitos e CNPJ deve conter 14 dígitos.',
    )
    .refine(isValidCpfOrCnpj, 'CPF ou CNPJ com dígito verificador inválido.');

/** Contrato Zod para cadastro de endereço fiscal/entrega (`customer_addresses`), normalizando CEP (8 dígitos), UF e taxa de entrega. */
export const customerAddressInputSchema = z.object({
    addressType: z.enum(['ENTREGA', 'COBRANCA', 'AMBOS']).default('AMBOS'),
    zipCode: z
        .string()
        .trim()
        .transform(onlyDigits)
        .refine((val) => val.length === 8, 'CEP deve conter exatamente 8 dígitos.'),
    street: z.string().trim().min(2, 'Logradouro obrigatório').max(160),
    number: z.string().trim().min(1, 'Número obrigatório (use S/N se não houver)').max(20),
    complement: z.string().trim().max(80).optional().nullable(),
    neighborhood: z.string().trim().min(2, 'Bairro obrigatório').max(80),
    city: z.string().trim().min(2, 'Cidade obrigatória').max(80),
    state: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, 'UF deve conter 2 letras (ex: GO, DF).'),
    defaultDeliveryFee: z
        .union([z.number(), z.string()])
        .transform((v) => Number(v).toFixed(2))
        .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, 'Taxa de entrega inválida')
        .default('0.00'),
});

export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;

/** Contrato de atualização parcial de endereço em `customer_addresses`. */
export const updateCustomerAddressSchema = customerAddressInputSchema.partial();
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;

/** Contrato Zod para vínculos adicionais de WhatsApp/telefone do cliente (`customer_phones`). */
export const customerPhoneInputSchema = z.object({
    phoneE164: phoneE164Schema,
    label: z.string().trim().max(40).optional().nullable(),
});

export type CustomerPhoneInput = z.infer<typeof customerPhoneInputSchema>;

/** Campos comuns da tabela `customers` compartilhados entre criação (`createCustomerSchema`) e edição (`updateCustomerSchema`). */
const baseCustomerFields = {
    priceTableId: z.string().uuid('Tabela de preço inválida').optional(),
    assignedUserId: z.string().uuid('Usuário responsável inválido').optional().nullable(),
    personType: z.enum(['PF', 'PJ']),
    name: z.string().trim().min(2, 'Nome ou Razão Social obrigatório').max(160),
    tradeName: z.string().trim().max(160).optional().nullable(),
    documentCpfCnpj: cpfCnpjSchema.optional().nullable(),
    stateRegistration: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().toLowerCase().email('E-mail inválido').max(150).optional().nullable(),
    whatsappPhone: phoneE164Schema,
    billingType: z.enum(['AVISTA', 'FATURADO_MENSAL']).default('AVISTA'),
    creditLimit: z
        .union([z.number(), z.string()])
        .transform((v) => Number(v).toFixed(2))
        .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, 'Limite de crédito inválido')
        .default('0.00'),
    notes: z.string().trim().optional().nullable(),
};

/**
 * Contrato de criação de cliente interno do CRM (sem credenciais de login — RN02).
 * Aceita telefones/endereços iniciais e valida compatibilidade cruzada entre `personType` (PF/PJ) e `documentCpfCnpj`.
 */
export const createCustomerSchema = z
    .object({
        ...baseCustomerFields,
        phones: z.array(customerPhoneInputSchema).optional().default([]),
        addresses: z.array(customerAddressInputSchema).optional().default([]),
    })
    .superRefine((data, ctx) => {
        if (data.documentCpfCnpj) {
            if (data.personType === 'PF' && data.documentCpfCnpj.length !== 11) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['documentCpfCnpj'],
                    message: 'Pessoa Física (PF) exige um CPF válido com 11 dígitos.',
                });
            }
            if (data.personType === 'PJ' && data.documentCpfCnpj.length !== 14) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['documentCpfCnpj'],
                    message: 'Pessoa Jurídica (PJ) exige um CNPJ válido com 14 dígitos.',
                });
            }
        }
    });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Contrato de atualização parcial de cliente (`customers`), preservando a consistência entre `personType` e `documentCpfCnpj`. */
export const updateCustomerSchema = z
    .object({
        priceTableId: baseCustomerFields.priceTableId,
        assignedUserId: baseCustomerFields.assignedUserId,
        personType: baseCustomerFields.personType.optional(),
        name: baseCustomerFields.name.optional(),
        tradeName: baseCustomerFields.tradeName,
        documentCpfCnpj: baseCustomerFields.documentCpfCnpj,
        stateRegistration: baseCustomerFields.stateRegistration,
        email: baseCustomerFields.email,
        whatsappPhone: baseCustomerFields.whatsappPhone.optional(),
        billingType: baseCustomerFields.billingType.optional(),
        creditLimit: baseCustomerFields.creditLimit.optional(),
        notes: baseCustomerFields.notes,
    })
    .superRefine((data, ctx) => {
        if (data.personType && data.documentCpfCnpj) {
            if (data.personType === 'PF' && data.documentCpfCnpj.length !== 11) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['documentCpfCnpj'],
                    message: 'Pessoa Física (PF) exige um CPF válido com 11 dígitos.',
                });
            }
            if (data.personType === 'PJ' && data.documentCpfCnpj.length !== 14) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['documentCpfCnpj'],
                    message: 'Pessoa Jurídica (PJ) exige um CNPJ válido com 14 dígitos.',
                });
            }
        }
    });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/**
 * Query de busca rápida por telefone E.164 ou CPF/CNPJ (usada no vínculo automático do atendimento WhatsApp — RF02).
 * Exige ao menos um dos dois parâmetros para evitar varredura sem filtro.
 */
export const lookupCustomerQuerySchema = z
    .object({
        phone: z
            .string()
            .trim()
            .transform(normalizePhoneE164)
            .optional(),
        document: z
            .string()
            .trim()
            .transform(onlyDigits)
            .optional(),
    })
    .refine(
        (data) => Boolean(data.phone || data.document),
        'Informe ao menos o parâmetro phone ou document para consulta.',
    );

export type LookupCustomerQuery = z.infer<typeof lookupCustomerQuerySchema>;

/** Query paginada de listagem de clientes com filtros por texto, `personType` e `billingType`. */
export const listCustomersQuerySchema = z.object({
    search: z.string().trim().optional(),
    personType: z.enum(['PF', 'PJ']).optional(),
    billingType: z.enum(['AVISTA', 'FATURADO_MENSAL']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;