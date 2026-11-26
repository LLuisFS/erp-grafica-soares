import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, Database, eq, ilike, ne, priceTables } from '@soares/database';
import type {
  CreatePriceTableInput,
  ListEngineeringQuery,
  ToggleActiveStatusInput,
  UpdatePriceTableInput,
} from '@soares/shared';
import { DRIZZLE_DB } from '../../../database/database.module';
import { executeSafeHardDelete } from '../engineering-delete.helper';

/** Serviço de gestão das tabelas comerciais de preço (`price_tables`) usadas por clientes e orçamentos. */
@Injectable()
export class PriceTablesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /** Lista tabelas de preço filtrando apenas ativas por padrão (`includeInactive = false`). */
  async findAll(query: ListEngineeringQuery) {
    const conditions = [];
    if (!query.includeInactive) conditions.push(eq(priceTables.active, true));
    if (query.search) conditions.push(ilike(priceTables.name, `%${query.search}%`));

    return this.db.query.priceTables.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  /** Busca uma tabela de preço por UUID; lança 404 caso inexistente. */
  async findOne(id: string) {
    const item = await this.db.query.priceTables.findFirst({
      where: eq(priceTables.id, id),
    });
    if (!item) throw new NotFoundException('Tabela de preço não encontrada.');
    return item;
  }

  /** Cria nova tabela de preço garantindo unicidade do nome (`409 Conflict`). */
  async create(input: CreatePriceTableInput) {
    const existing = await this.db.query.priceTables.findFirst({
      where: eq(priceTables.name, input.name),
    });
    if (existing) {
      throw new ConflictException('Já existe uma tabela de preço com este nome.');
    }

    const [created] = await this.db
      .insert(priceTables)
      .values({
        name: input.name,
        markupMultiplier: input.markupMultiplier.toFixed(4),
        defaultDiscountPct: input.defaultDiscountPct.toFixed(2),
      })
      .returning();

    return created;
  }

  /** Atualiza parcialmente os parâmetros comerciais da tabela, impedindo duplicidade de nome. */
  async update(id: string, input: UpdatePriceTableInput) {
    const current = await this.findOne(id);

    if (input.name !== undefined && input.name !== current.name) {
      const conflict = await this.db.query.priceTables.findFirst({
        where: and(eq(priceTables.name, input.name), ne(priceTables.id, id)),
      });
      if (conflict) {
        throw new ConflictException('Já existe outra tabela de preço com este nome.');
      }
    }

    const [updated] = await this.db
      .update(priceTables)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.markupMultiplier !== undefined && {
          markupMultiplier: input.markupMultiplier.toFixed(4),
        }),
        ...(input.defaultDiscountPct !== undefined && {
          defaultDiscountPct: input.defaultDiscountPct.toFixed(2),
        }),
      })
      .where(eq(priceTables.id, id))
      .returning();

    return updated;
  }

  /** Ativa ou desativa logicamente a tabela de preço (`active` / `deactivated_at`). */
  async updateStatus(id: string, input: ToggleActiveStatusInput) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(priceTables)
      .set({
        active: input.active,
        deactivatedAt: input.active ? null : new Date(),
      })
      .where(eq(priceTables.id, id))
      .returning();

    return updated;
  }

  /** Exclui fisicamente a tabela de preço somente se não houver clientes vinculados (`23503` -> 409). */
  async remove(id: string) {
    await this.findOne(id);
    await executeSafeHardDelete(
      async () => {
        await this.db.delete(priceTables).where(eq(priceTables.id, id));
      },
      'registro de tabela de preço',
      'PATCH /engineering/price-tables/:id/status',
    );
    return { deleted: true, id };
  }
}
