import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    integer,
    numeric,
    pgTable,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

// Domínio 4: Engenharia Gráfica, Equipamentos e Matéria-Prima

// 4.1 machines
export const machines = pgTable(
    'machines',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 100 }).notNull(),
        sector: varchar('sector', { length: 25 }).notNull(),
        billingUnit: varchar('billing_unit', { length: 15 }).notNull(),
        unitCost: numeric('unit_cost', { precision: 10, scale: 4 }).notNull(),
        setupCost: numeric('setup_cost', { precision: 10, scale: 2 }).notNull().default('0.00'),
        setupWasteSheets: integer('setup_waste_sheets').notNull().default(0),
        maxWidthMm: integer('max_width_mm').notNull(),
        maxHeightMm: integer('max_height_mm').notNull(),
        gripperMarginMm: integer('gripper_margin_mm').notNull().default(10),
        currentOdometer: bigint('current_odometer', { mode: 'number' }).notNull().default(0),
        active: boolean('active').notNull().default(true),
    },
    (table) => [
        check(
            'machines_sector_check',
            sql`${table.sector} IN ('PRE_IMPRESSÃO', 'DIGITAL', 'OFFSET', 'COM_VISUAL', 'ACABAMENTO')`,
        ),
        check(
            'machine_billing_unit_check',
            sql`${table.billingUnit} IN ('CLIQUE', 'HORA', 'M2')`,
        ),
    ],
);

// 4.2 materials
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: varchar('sku', { length: 40 }).unique(),
    name: varchar('name', { length: 140 }).notNull(),
    category: varchar('category', { length: 25 }).notNull(),
    purchaseUnit: varchar('purchase_unit', { length: 20 }).notNull(),
    consumptionUnit: varchar('consumption_unit', { length: 20 }).notNull(),
    conversionFactor: numeric('conversion_factor', { precision: 12, scale: 4 }).notNull(),
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),
    grammageGsm: integer('grammage_gsm'),
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }).notNull(),
    stockQty: numeric('stock_qty', { precision: 12, scale: 4 }).notNull().default('0'),
    minStockQty: numeric('min_stock_qty', { precision: 12, scale: 4 }).notNull().default('0'),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check(
      'materials_category_check',
      sql`${table.category} IN ('PAPEL', 'LONA_VINIL', 'CHAPA_RIGIDA', 'TINTA_INSUMO', 'EMBALAGEM')`,
    ),
  ],
);

// 4.3 finishing_services
export const finishingServices = pgTable(
  'finishing_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    machineId: uuid('machine_id').references(() => machines.id),
    calcBasis: varchar('calc_basis', { length: 20 }).notNull(),
    setupCost: numeric('setup_cost', { precision: 10, scale: 2 }).notNull().default('0.00'),
    unitCost: numeric('unit_cost', { precision: 10, scale: 4 }).notNull(),
    isOutsourced: boolean('is_outsourced').notNull().default(false),
    // Mantida nullable sem FK até a criação da tabela suppliers na Fase 2
    defaultSupplierId: uuid('default_supplier_id'),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check(
      'finishing_calc_basis_check',
      sql`${table.calcBasis} IN ('POR_UNIDADE', 'POR_FOLHA', 'POR_M2', 'FIXO_SETUP')`,
    ),
  ],
);

// 4.4 product_templates
export const productTemplates = pgTable(
  'product_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    category: varchar('category', { length: 25 }).notNull(),
    defaultMachineId: uuid('default_machine_id').references(() => machines.id),
    defaultMaterialId: uuid('default_material_id').references(() => materials.id),
    defaultWidthMm: integer('default_width_mm').notNull(),
    defaultHeightMm: integer('default_height_mm').notNull(),
    bleedMm: integer('bleed_mm').notNull().default(3),
    spacingMm: integer('spacing_mm').notNull().default(2),
  },
  (table) => [
    check(
      'product_templates_category_check',
      sql`${table.category} IN ('DIGITAL', 'OFFSET', 'COM_VISUAL')`,
    ),
  ],
);

// 4.5 suppliers [Fase 2 / Bloco 2.2]
