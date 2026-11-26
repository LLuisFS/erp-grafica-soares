import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, Database, eq, finishingServices, ilike } from '@soares/database';
import type {
  CreateFinishingServiceInput,
  ListEngineeringQuery,
  ToggleActiveStatusInput,
  UpdateFinishingServiceInput,
} from '@soares/shared';
import { DRIZZLE_DB } from '../../../database/database.module';
import { executeSafeHardDelete } from '../engineering-delete.helper';

/** Serviço de gestão de acabamentos gráficos internos e terceirizados (`finishing_services`). */
@Injectable()
export class FinishingServicesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /** Lista acabamentos ativos por padrão com a máquina vinculada (`with: { machine: true }`). */
  async findAll(query: ListEngineeringQuery) {
    const conditions = [];
    if (!query.includeInactive) {
      conditions.push(eq(finishingServices.active, true));
    }
    if (query.search) {
      conditions.push(ilike(finishingServices.name, `%${query.search}%`));
    }

    return this.db.query.finishingServices.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: { machine: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  /** Busca um serviço de acabamento por UUID com dados da máquina associada. */
  async findOne(id: string) {
    const item = await this.db.query.finishingServices.findFirst({
      where: eq(finishingServices.id, id),
      with: { machine: true },
    });
    if (!item) throw new NotFoundException('Serviço de acabamento não encontrado.');
    return item;
  }

  /** Cadastra novo acabamento com base de cálculo (`POR_UNIDADE`, `POR_FOLHA`, `POR_M2` ou `FIXO_SETUP`). */
  async create(input: CreateFinishingServiceInput) {
    const [created] = await this.db
      .insert(finishingServices)
      .values({
        name: input.name,
        machineId: input.machineId ?? null,
        calcBasis: input.calcBasis,
        setupCost: input.setupCost.toFixed(2),
        unitCost: input.unitCost.toFixed(4),
        isOutsourced: input.isOutsourced,
        defaultSupplierId: input.defaultSupplierId ?? null,
      })
      .returning();

    return created;
  }

  /** Atualiza parcialmente os parâmetros e custos do serviço de acabamento. */
  async update(id: string, input: UpdateFinishingServiceInput) {
    await this.findOne(id);

    const [updated] = await this.db
      .update(finishingServices)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.machineId !== undefined && { machineId: input.machineId }),
        ...(input.calcBasis !== undefined && { calcBasis: input.calcBasis }),
        ...(input.setupCost !== undefined && { setupCost: input.setupCost.toFixed(2) }),
        ...(input.unitCost !== undefined && { unitCost: input.unitCost.toFixed(4) }),
        ...(input.isOutsourced !== undefined && { isOutsourced: input.isOutsourced }),
        ...(input.defaultSupplierId !== undefined && {
          defaultSupplierId: input.defaultSupplierId,
        }),
      })
      .where(eq(finishingServices.id, id))
      .returning();

    return updated;
  }

  /** Ativa ou desativa logicamente o acabamento (`active` / `deactivated_at`). */
  async updateStatus(id: string, input: ToggleActiveStatusInput) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(finishingServices)
      .set({
        active: input.active,
        deactivatedAt: input.active ? null : new Date(),
      })
      .where(eq(finishingServices.id, id))
      .returning();

    return updated;
  }

  /** Exclui fisicamente o acabamento somente se não possuir vínculos (`23503` -> 409). */
  async remove(id: string) {
    await this.findOne(id);
    await executeSafeHardDelete(
      async () => {
        await this.db.delete(finishingServices).where(eq(finishingServices.id, id));
      },
      'serviço de acabamento',
      'PATCH /engineering/finishing-services/:id/status',
    );
    return { deleted: true, id };
  }
}
