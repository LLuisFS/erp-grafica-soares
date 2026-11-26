import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, Database, eq, ilike, machines } from '@soares/database';
import type {
  CreateMachineInput,
  ListEngineeringQuery,
  ToggleActiveStatusInput,
  UpdateMachineInput,
  UpdateMachineMeterInput,
} from '@soares/shared';
import { DRIZZLE_DB } from '../../../database/database.module';
import { executeSafeHardDelete } from '../engineering-delete.helper';

/** Serviço de cadastro técnico de equipamentos (`machines`), controle de hodômetro e desativação lógica. */
@Injectable()
export class MachinesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /** Lista equipamentos ativos por padrão (`includeInactive = false`) ordenados alfabeticamente. */
  async findAll(query: ListEngineeringQuery) {
    const conditions = [];
    if (!query.includeInactive) conditions.push(eq(machines.active, true));
    if (query.search) conditions.push(ilike(machines.name, `%${query.search}%`));

    return this.db.query.machines.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  /** Busca equipamento por UUID; lança 404 caso não encontrado. */
  async findOne(id: string) {
    const item = await this.db.query.machines.findFirst({
      where: eq(machines.id, id),
    });
    if (!item) throw new NotFoundException('Máquina não encontrada.');
    return item;
  }

  /** Cadastra novo equipamento com custos (4 casas decimais) e limites geométricos para imposição. */
  async create(input: CreateMachineInput) {
    const [created] = await this.db
      .insert(machines)
      .values({
        name: input.name,
        sector: input.sector,
        billingUnit: input.billingUnit,
        unitCost: input.unitCost.toFixed(4),
        setupCost: input.setupCost.toFixed(2),
        setupWasteSheets: input.setupWasteSheets,
        maxWidthMm: input.maxWidthMm,
        maxHeightMm: input.maxHeightMm,
        gripperMarginMm: input.gripperMarginMm,
        currentOdometer: input.currentOdometer,
      })
      .returning();

    return created;
  }

  /** Atualiza parâmetros cadastrais e técnicos do equipamento (exceto hodômetro e status). */
  async update(id: string, input: UpdateMachineInput) {
    await this.findOne(id);

    const [updated] = await this.db
      .update(machines)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.sector !== undefined && { sector: input.sector }),
        ...(input.billingUnit !== undefined && { billingUnit: input.billingUnit }),
        ...(input.unitCost !== undefined && { unitCost: input.unitCost.toFixed(4) }),
        ...(input.setupCost !== undefined && { setupCost: input.setupCost.toFixed(2) }),
        ...(input.setupWasteSheets !== undefined && {
          setupWasteSheets: input.setupWasteSheets,
        }),
        ...(input.maxWidthMm !== undefined && { maxWidthMm: input.maxWidthMm }),
        ...(input.maxHeightMm !== undefined && { maxHeightMm: input.maxHeightMm }),
        ...(input.gripperMarginMm !== undefined && {
          gripperMarginMm: input.gripperMarginMm,
        }),
      })
      .where(eq(machines.id, id))
      .returning();

    return updated;
  }

  /** Atualiza o hodômetro garantindo monotonicidade (`readingValue >= currentOdometer`). */
  async updateMeter(id: string, input: UpdateMachineMeterInput) {
    const current = await this.findOne(id);
    if (input.readingValue < current.currentOdometer) {
      throw new BadRequestException(
        `A leitura (${input.readingValue}) não pode ser menor que o hodômetro atual (${current.currentOdometer}).`,
      );
    }

    const [updated] = await this.db
      .update(machines)
      .set({ currentOdometer: input.readingValue })
      .where(eq(machines.id, id))
      .returning();

    return updated;
  }

  /** Ativa ou desativa logicamente o equipamento (`active` / `deactivated_at`). */
  async updateStatus(id: string, input: ToggleActiveStatusInput) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(machines)
      .set({
        active: input.active,
        deactivatedAt: input.active ? null : new Date(),
      })
      .where(eq(machines.id, id))
      .returning();

    return updated;
  }

  /** Exclui fisicamente o equipamento apenas se não possuir vínculos (`23503` -> 409). */
  async remove(id: string) {
    await this.findOne(id);
    await executeSafeHardDelete(
      async () => {
        await this.db.delete(machines).where(eq(machines.id, id));
      },
      'equipamento',
      'PATCH /engineering/machines/:id/status',
    );
    return { deleted: true, id };
  }
}
