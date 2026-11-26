import { z } from 'zod';

const includeInactiveField = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((val) => val === true || val === 'true')
  .optional()
  .default(false);

/** Query padrão de listagem dos cadastros de engenharia (filtra apenas registros ativos por padrão). */
export const listEngineeringQuerySchema = z.object({
  search: z.string().trim().optional(),
  includeInactive: includeInactiveField,
});

export type ListEngineeringQuery = z.infer<typeof listEngineeringQuerySchema>;

// ==========================================
// 1. PRICE TABLES
// ==========================================

/** Contrato de criação de tabela comercial de preço (`price_tables`). */
export const createPriceTableSchema = z.object({
  name: z.string().trim().min(2).max(80),
  markupMultiplier: z.coerce.number().positive().default(1),
  defaultDiscountPct: z.coerce.number().min(0).max(100).default(0),
});

/** Contrato de atualização parcial estrita de tabela de preço (bloqueia campos desconhecidos como `active`). */
export const updatePriceTableSchema = createPriceTableSchema.partial().strict();

export type CreatePriceTableInput = z.infer<typeof createPriceTableSchema>;
export type UpdatePriceTableInput = z.infer<typeof updatePriceTableSchema>;

// ==========================================
// 2. MACHINES
// ==========================================

export const machineSectorEnum = z.enum([
  'PRE_IMPRESSAO',
  'DIGITAL',
  'OFFSET',
  'COM_VISUAL',
  'ACABAMENTO',
]);

export const machineBillingUnitEnum = z.enum(['CLIQUE', 'HORA', 'M2']);

/** Contrato de cadastro técnico de máquina (`machines`) consumido pelo motor de imposição e custos. */
export const createMachineSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sector: machineSectorEnum,
  billingUnit: machineBillingUnitEnum,
  unitCost: z.coerce.number().positive('O custo unitário deve ser maior que zero.'),
  setupCost: z.coerce.number().min(0).default(0),
  setupWasteSheets: z.coerce.number().int().min(0).default(0),
  maxWidthMm: z.coerce.number().int().positive('A largura máxima deve ser maior que zero.'),
  maxHeightMm: z.coerce.number().int().positive('A altura máxima deve ser maior que zero.'),
  gripperMarginMm: z.coerce.number().int().min(0).default(10),
  currentOdometer: z.coerce.number().int().min(0).default(0),
});

/** Atualização parcial cadastral de máquina; bloqueia alteração direta de `currentOdometer` e `active`. */
export const updateMachineSchema = createMachineSchema
  .omit({ currentOdometer: true })
  .partial()
  .strict();

/** Contrato dedicado para atualização monotônica do hodômetro/cliques (`PATCH /engineering/machines/:id/meter`). */
export const updateMachineMeterSchema = z.object({
  readingValue: z.coerce.number().int().min(0),
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type UpdateMachineMeterInput = z.infer<typeof updateMachineMeterSchema>;

// ==========================================
// 3. MATERIALS
// ==========================================

export const materialCategoryEnum = z.enum([
  'PAPEL',
  'LONA_VINIL',
  'CHAPA_RIGIDA',
  'TINTA_INSUMO',
  'EMBALAGEM',
]);

const baseMaterialFields = z.object({
  sku: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(2).max(140),
  category: materialCategoryEnum,
  purchaseUnit: z.string().trim().min(1).max(20),
  consumptionUnit: z.string().trim().min(1).max(20),
  conversionFactor: z.coerce
    .number()
    .positive('O fator de conversão deve ser maior que zero.'),
  widthMm: z.coerce.number().int().positive().optional().nullable(),
  heightMm: z.coerce.number().int().positive().optional().nullable(),
  grammageGsm: z.coerce.number().int().positive().optional().nullable(),
  purchasePrice: z.coerce
    .number()
    .positive('O preço de compra deve ser maior que zero.')
    .optional(),
  unitCost: z.coerce
    .number()
    .positive('O custo unitário deve ser maior que zero.')
    .optional(),
  stockQty: z.coerce.number().min(0).default(0),
  minStockQty: z.coerce.number().min(0).default(0),
});

/**
 * Contrato de criação de insumo/substrato (`materials`).
 * Exige `purchasePrice` (para cálculo automático `purchasePrice / conversionFactor`) ou `unitCost` direto.
 */
export const createMaterialSchema = baseMaterialFields.refine(
  (data) => data.purchasePrice !== undefined || data.unitCost !== undefined,
  {
    message: 'Informe purchasePrice (para cálculo automático) ou unitCost.',
    path: ['purchasePrice'],
  },
);

/** Atualização parcial cadastral de material; bloqueia alteração direta de `stockQty` e `active`. */
export const updateMaterialSchema = baseMaterialFields
  .omit({ stockQty: true })
  .partial()
  .strict();

/** Contrato dedicado para ajuste manual de saldo de estoque (`POST /engineering/materials/:id/stock-adjustment`). */
export const adjustMaterialStockSchema = z.object({
  qtyDelta: z.coerce
    .number()
    .refine((val) => val !== 0, 'A variação de estoque não pode ser zero.'),
  reason: z.string().trim().min(3).max(160),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type AdjustMaterialStockInput = z.infer<typeof adjustMaterialStockSchema>;

// ==========================================
// 4. FINISHING SERVICES
// ==========================================

export const finishingCalcBasisEnum = z.enum([
  'POR_UNIDADE',
  'POR_FOLHA',
  'POR_M2',
  'FIXO_SETUP',
]);

/** Contrato de cadastro de serviço de acabamento (`finishing_services`). */
export const createFinishingServiceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  machineId: z.string().uuid().optional().nullable(),
  calcBasis: finishingCalcBasisEnum,
  setupCost: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().min(0),
  isOutsourced: z.boolean().default(false),
  defaultSupplierId: z.string().uuid().optional().nullable(),
});

/** Contrato de atualização parcial estrita de acabamento (bloqueia `active`). */
export const updateFinishingServiceSchema = createFinishingServiceSchema.partial().strict();

export type CreateFinishingServiceInput = z.infer<typeof createFinishingServiceSchema>;
export type UpdateFinishingServiceInput = z.infer<typeof updateFinishingServiceSchema>;

// ==========================================
// 5. PRODUCT TEMPLATES
// ==========================================

export const productCategoryEnum = z.enum(['DIGITAL', 'OFFSET', 'COM_VISUAL']);

/** Contrato de cadastro de gabarito pré-configurado de produto (`product_templates`). */
export const createProductTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: productCategoryEnum,
  defaultMachineId: z.string().uuid().optional().nullable(),
  defaultMaterialId: z.string().uuid().optional().nullable(),
  defaultWidthMm: z.coerce.number().int().positive(),
  defaultHeightMm: z.coerce.number().int().positive(),
  bleedMm: z.coerce.number().int().min(0).default(3),
  spacingMm: z.coerce.number().int().min(0).default(2),
});

/** Contrato de atualização parcial estrita de gabarito (bloqueia `active`). */
export const updateProductTemplateSchema = createProductTemplateSchema.partial().strict();

export type CreateProductTemplateInput = z.infer<typeof createProductTemplateSchema>;
export type UpdateProductTemplateInput = z.infer<typeof updateProductTemplateSchema>;
