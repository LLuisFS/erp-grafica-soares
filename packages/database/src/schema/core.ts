import {
    boolean,
    jsonb,
    numeric,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

export type RolePermissions = Record<string, boolean | number>;

// Domínio 1: Core — Equipe Interna, Permissões (RBAC) e Auditoria

// 1.1 roles
export const roles = pgTable('roles', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    permissions: jsonb('permissions').$type<RolePermissions>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 1.2 users
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    roleId: uuid('role_id')
        .notNull()
        .references(() => roles.id),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 150 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    approvalPinHash: text('approval_pin_hash'),
    maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 })
        .notNull()
        .default('0.00'),
    commissionPct: numeric('commission_pct', { precision: 5, scale: 2 })
        .notNull()
        .default('0.00'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// 1.3 audit_logs [Fase 2 / Bloco 2.1]
