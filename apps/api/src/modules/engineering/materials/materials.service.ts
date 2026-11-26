import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, Database, eq, ilike, materials, ne, or } from '@soares/database';
import type {
  AdjustMaterialStockInput,
  CreateMaterialInput,
  ListEngineeringQuery,
  ToggleActiveStatusInput,
  UpdateMaterialInput,
} from '@soares/shared';
import { DRIZZLE_DB } from '../../../database/database.module';
import { executeSafeHardDelete } from '../engineering-delete.helper';

/**
 * Serviço de gestão de substratos e insumos (`materials`).
 * Calcula automaticamente `unitCost = purchasePrice / conversionFactor` (4 casas decimais) e controla ajustes de saldo.
 */
@Injectable()
export class MaterialsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /** Calcula `unitCost` com 4 casas decimais priorizando `purchasePrice / conversionFactor` ou fallback em `unitCost`. */
  private resolveUnitCost(
    purchasePrice: number | undefined,
    unitCost: number | undefined,
    conversionFactor: number,
  ): string {
    if (purchasePrice !== undefined) {
      return (purchasePrice / conversionFactor).toFixed(4);
    }
    if (unitCost !== undefined) {
      return unitCost.toFixed(4);
    }
    throw new BadRequestException(
      'Informe purchasePrice ou unitCost para calcular o custo unitário.',
    );
  }

  /** Lista materiais ativos por padrão, com busca por nome ou SKU. */
  async findAll(query: ListEngineeringQuery) {
    const conditions = [];
    if (!query.includeInactive) conditions.push(eq(materials.active, true));
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(or(ilike(materials.name, term), ilike(materials.sku, term)));
    }

    return this.db.query.materials.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  /** Busca material por UUID; lança 404 se inexistente. */
  async findOne(id: string) {
    const item = await this.db.query.materials.findFirst({
      where: eq(materials.id, id),
    });
    if (!item) throw new NotFoundException('Material/insumo não encontrado.');
    return item;
  }

  /** Cadastra material garantindo unicidade de SKU e calculando `unitCost` na unidade de consumo. */
  async create(input: CreateMaterialInput) {
    if (input.sku) {
      const existingSku = await this.db.query.materials.findFirst({
        where: eq(materials.sku, input.sku),
      });
      if (existingSku) {
        throw new ConflictException('Já existe um material cadastrado com este SKU.');
      }
    }

    const calculatedUnitCost = this.resolveUnitCost(
      input.purchasePrice,
      input.unitCost,
      input.conversionFactor,
    );

    const [created] = await this.db
      .insert(materials)
      .values({
        sku: input.sku ?? null,
        name: input.name,
        category: input.category,
        purchaseUnit: input.purchaseUnit,
        consumptionUnit: input.consumptionUnit,
        conversionFactor: input.conversionFactor.toFixed(4),
        widthMm: input.widthMm ?? null,
        heightMm: input.heightMm ?? null,
        grammageGsm: input.grammageGsm ?? null,
        unitCost: calculatedUnitCost,
        stockQty: input.stockQty.toFixed(4),
        minStockQty: input.minStockQty.toFixed(4),
      })
      .returning();

    return created;
  }

  /** Atualiza dados cadastrais e recalcula `unitCost` caso `purchasePrice` ou `unitCost` seja enviado. */
  async update(id: string, input: UpdateMaterialInput) {
    const current = await this.findOne(id);

    if (input.sku && input.sku !== current.sku) {
      const conflictSku = await this.db.query.materials.findFirst({
        where: and(eq(materials.sku, input.sku), ne(materials.id, id)),
      });
      if (conflictSku) {
        throw new ConflictException('Já existe outro material cadastrado com este SKU.');
      }
    }

    const effectiveFactor = input.conversionFactor ?? Number(current.conversionFactor);

    let nextUnitCost: string | undefined;
    if (input.purchasePrice !== undefined || input.unitCost !== undefined) {
      nextUnitCost = this.resolveUnitCost(
        input.purchasePrice,
        input.unitCost,
        effectiveFactor,
      );
    }

    const [updated] = await this.db
      .update(materials)
      .set({
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.purchaseUnit !== undefined && { purchaseUnit: input.purchaseUnit }),
        ...(input.consumptionUnit !== undefined && {
          consumptionUnit: input.consumptionUnit,
        }),
        ...(input.conversionFactor !== undefined && {
          conversionFactor: input.conversionFactor.toFixed(4),
        }),
        ...(input.widthMm !== undefined && { widthMm: input.widthMm }),
        ...(input.heightMm !== undefined && { heightMm: input.heightMm }),
        ...(input.grammageGsm !== undefined && { grammageGsm: input.grammageGsm }),
        ...(nextUnitCost !== undefined && { unitCost: nextUnitCost }),
        ...(input.minStockQty !== undefined && {
          minStockQty: input.minStockQty.toFixed(4),
        }),
      })
      .where(eq(materials.id, id))
      .returning();

    return updated;
  }

  /** Aplica delta manual em `stockQty`, impedindo saldo negativo (`400 Bad Request`). */
  async adjustStock(id: string, input: AdjustMaterialStockInput) {
    const current = await this.findOne(id);
    const nextQty = Number(current.stockQty) + input.qtyDelta;

    if (nextQty < 0) {
      throw new BadRequestException(
        `Saldo insuficiente. Estoque atual: ${current.stockQty} ${current.consumptionUnit}.`,
      );
    }

    const [updated] = await this.db
      .update(materials)
      .set({ stockQty: nextQty.toFixed(4) })
      .where(eq(materials.id, id))
      .returning();

    return {
      material: updated,
      adjustment: {
        qtyDelta: input.qtyDelta,
        reason: input.reason,
      },
    };
  }

  /** Ativa ou desativa logicamente o material (`active` / `deactivated_at`). */
  async updateStatus(id: string, input: ToggleActiveStatusInput) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(materials)
      .set({
        active: input.active,
        deactivatedAt: input.active ? null : new Date(),
      })
      .where(eq(materials.id, id))
      .returning();

    return updated;
  }

  /** Exclui fisicamente o material somente se não houver vínculos (`23503` -> 409). */
  async remove(id: string) {
    await this.findOne(id);
    await executeSafeHardDelete(
      async () => {
        await this.db.delete(materials).where(eq(materials.id, id));
      },
      'material/insumo',
      'PATCH /engineering/materials/:id/status',
    );
    return { deleted: true, id };
  }
}
