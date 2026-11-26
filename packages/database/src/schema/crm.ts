import { sql } from 'drizzle-orm';
import {
    boolean,
    char,
    check,
    index,
    numeric,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import { users } from './core';

// Domínio 2: CRM Interno & Clientes

// 2.1 price_tables
export const priceTables = pgTable('price_tables', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull().unique(),
    markupMultiplier: numeric('markup_multiplier', { precision: 6, scale: 4 })
        .notNull()
        .default('1.0000'),
    defaultDiscountPct: numeric('default_discount_pct', { precision: 5, scale: 2 })
        .notNull()
        .default('0.00'),
    active: boolean('active').notNull().default(true),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
});

// 2.2 customers
export const customers = pgTable(
    'customers',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        priceTableId: uuid('price_table_id')
            .notNull()
            .references(() => priceTables.id),
        assignedUserId: uuid('assigned_user_id').references(() => users.id),
        personType: varchar('person_type', { length: 2 }),
        name: varchar('name', { length: 160 }).notNull(),
        tradeName: varchar('trade_name', { length: 160 }),
        documentCpfCnpj: varchar('document_cpf_cnpj', { length: 14 }).unique(),
        stateRegistration: varchar('state_registration', { length: 30 }),
        email: varchar('email', { length: 150 }),
        whatsappPhone: varchar('whatsapp_phone', { length: 20 }).notNull(),
        billingType: varchar('billing_type', { length: 20 }).notNull().default('AVISTA'),
        creditLimit: numeric('credit_limit', { precision: 12, scale: 2 })
            .notNull()
            .default('0.00'),
        notes: text('notes'),
        // Desativação lógica via PATCH /customers/:id/status (preserva histórico fiscal e comercial)
        active: boolean('active').notNull().default(true),
        deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }),
    },
    (table) => [
        check('customers_person_type_check', sql`${table.personType} IN ('PF', 'PJ')`),
        check('customers_billing_type_check', sql`${table.billingType} in ('AVISTA', 'FATURADO_MENSAL')`),
        index('idx_customers_whatsapp_phone').on(table.whatsappPhone),
        index('idx_customers_active').on(table.active),
    ],
);

// 2.3 customer_phones
export const customerPhones = pgTable(
    'customer_phones',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        customerId: uuid('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        phoneE164: varchar('phone_e164', { length: 20 }).notNull().unique(),
        label: varchar('label', { length: 40 }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index('idx_customer_phones_e164').on(table.phoneE164)],
);

// 2.4 customer_addresses
export const customerAddresses = pgTable(
    'customer_addresses',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        customerId: uuid('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        addressType: varchar('address_type', { length: 20 }).notNull().default('AMBOS'),
        zipCode: varchar('zip_code', { length: 10 }).notNull(),
        street: varchar('street', { length: 160 }).notNull(),
        number: varchar('number', { length: 20 }).notNull(),
        complement: varchar('complement', { length: 80 }),
        neighborhood: varchar('neighborhood', { length: 80 }).notNull(),
        city: varchar('city', { length: 80 }).notNull(),
        state: char('state', { length: 2 }).notNull(),
        defaultDeliveryFee: numeric('default_delivery_fee', { precision: 10, scale: 2 })
            .notNull()
            .default('0.00'),
    },
    (table) => [
        check('customer_addresses_type_check', sql`${table.addressType} IN ('ENTREGA', 'COBRANCA', 'AMBOS')`,),
    ],
);

// 2.5 customer_contacts [Fase 2 / Bloco 2.3]

// 2.6 customer_auth_accounts [Fase 3 / Site Futuro]
