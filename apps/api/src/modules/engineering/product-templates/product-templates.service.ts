import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, Database, eq, ilike, productTemplates } from '@soares/database';
import type {
  CreateProductTemplateInput,
  ListEngineeringQuery,
  ToggleActiveStatusInput,
  UpdateProductTemplateInput,
} from '@soares/shared';
import { DRIZZLE_DB } from '../../../database/database.module';
import { executeSafeHardDelete } from '../engineering-delete.helper';

/** Serviço de gabaritos de produtos (`product_templates`) pré-configurados com máquina e substrato padrão. */
@Injectable()
export class ProductTemplatesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /** Lista gabaritos ativos por padrão carregando `defaultMachine` e `defaultMaterial`. */
  async findAll(query: ListEngineeringQuery) {
    const conditions = [];
    if (!query.includeInactive) {
      conditions.push(eq(productTemplates.active, true));
    }
    if (query.search) {
      conditions.push(ilike(productTemplates.name, `%${query.search}%`));
    }

    return this.db.query.productTemplates.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        defaultMachine: true,
        defaultMaterial: true,
      },
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  /** Busca um gabarito por UUID com relações de máquina e substrato padrão. */
  async findOne(id: string) {
    const item = await this.db.query.productTemplates.findFirst({
      where: eq(productTemplates.id, id),
      with: {
        defaultMachine: true,
        defaultMaterial: true,
      },
    });
    if (!item) throw new NotFoundException('Gabarito de produto não encontrado.');
    return item;
  }

  /** Cadastra novo gabarito de produto com dimensões, sangria e espaçamento de corte padrão. */
  async create(input: CreateProductTemplateInput) {
    const [created] = await this.db
      .insert(productTemplates)
      .values({
        name: input.name,
        category: input.category,
        defaultMachineId: input.defaultMachineId ?? null,
        defaultMaterialId: input.defaultMaterialId ?? null,
        defaultWidthMm: input.defaultWidthMm,
        defaultHeightMm: input.defaultHeightMm,
        bleedMm: input.bleedMm,
        spacingMm: input.spacingMm,
      })
      .returning();

    return created;
  }

  /** Atualiza parcialmente os parâmetros geométricos e vínculos padrão do gabarito. */
  async update(id: string, input: UpdateProductTemplateInput) {
    await this.findOne(id);

    const [updated] = await this.db
      .update(productTemplates)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.defaultMachineId !== undefined && {
          defaultMachineId: input.defaultMachineId,
        }),
        ...(input.defaultMaterialId !== undefined && {
          defaultMaterialId: input.defaultMaterialId,
        }),
        ...(input.defaultWidthMm !== undefined && {
          defaultWidthMm: input.defaultWidthMm,
        }),
        ...(input.defaultHeightMm !== undefined && {
          defaultHeightMm: input.defaultHeightMm,
        }),
        ...(input.bleedMm !== undefined && { bleedMm: input.bleedMm }),
        ...(input.spacingMm !== undefined && { spacingMm: input.spacingMm }),
      })
      .where(eq(productTemplates.id, id))
      .returning();

    return updated;
  }

  /** Ativa ou desativa logicamente o gabarito (`active` / `deactivated_at`). */
  async updateStatus(id: string, input: ToggleActiveStatusInput) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(productTemplates)
      .set({
        active: input.active,
        deactivatedAt: input.active ? null : new Date(),
      })
      .where(eq(productTemplates.id, id))
      .returning();

    return updated;
  }

  /** Exclui fisicamente o gabarito somente se não possuir vínculos (`23503` -> 409). */
  async remove(id: string) {
    await this.findOne(id);
    await executeSafeHardDelete(
      async () => {
        await this.db.delete(productTemplates).where(eq(productTemplates.id, id));
      },
      'gabarito de produto',
      'PATCH /engineering/product-templates/:id/status',
    );
    return { deleted: true, id };
  }
}
