import { relations } from 'drizzle-orm';
import { roles, users } from './core';
import { customerAddresses, customerPhones, customers, priceTables } from './crm';
import { finishingServices, machines, materials, productTemplates } from './engineering';

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  assignedCustomers: many(customers),
}));

export const priceTablesRelations = relations(priceTables, ({ many }) => ({
  customers: many(customers),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  priceTable: one(priceTables, {
    fields: [customers.priceTableId],
    references: [priceTables.id],
  }),
  assignedUser: one(users, {
    fields: [customers.assignedUserId],
    references: [users.id],
  }),
  phones: many(customerPhones),
  addresses: many(customerAddresses),
}));

export const customerPhonesRelations = relations(customerPhones, ({ one }) => ({
  customer: one(customers, {
    fields: [customerPhones.customerId],
    references: [customers.id],
  }),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, {
    fields: [customerAddresses.customerId],
    references: [customers.id],
  }),
}));

export const finishingServicesRelations = relations(finishingServices, ({ one }) => ({
  machine: one(machines, {
    fields: [finishingServices.machineId],
    references: [machines.id],
  }),
}));

export const productTemplatesRelations = relations(productTemplates, ({ one }) => ({
  defaultMachine: one(machines, {
    fields: [productTemplates.defaultMachineId],
    references: [machines.id],
  }),
  defaultMaterial: one(materials, {
    fields: [productTemplates.defaultMaterialId],
    references: [materials.id],
  }),
}));

export const machinesRelations = relations(machines, ({ many }) => ({
  finishingServices: many(finishingServices),
  productTemplates: many(productTemplates),
}));

export const materialsRelations = relations(materials, ({ many }) => ({
  productTemplates: many(productTemplates),
}));