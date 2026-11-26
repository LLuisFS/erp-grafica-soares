import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  adjustMaterialStockSchema,
  createMaterialSchema,
  listEngineeringQuerySchema,
  toggleActiveStatusSchema,
  updateMaterialSchema,
  type AdjustMaterialStockInput,
  type CreateMaterialInput,
  type ListEngineeringQuery,
  type ToggleActiveStatusInput,
  type UpdateMaterialInput,
} from '@soares/shared';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { MaterialsService } from './materials.service';

/** Controller `/engineering/materials` protegido por RBAC (`engineering.view` / `engineering.manage` / `engineering.delete`). */
@ApiTags('Engenharia - Materiais e Insumos')
@ApiBearerAuth()
@Controller('engineering/materials')
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  @Get()
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Lista materiais e insumos (ativos por padrão)' })
  @ApiQuery({ name: 'search', required: false, example: 'Couchê' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  findAll(
    @Query(new ZodValidationPipe(listEngineeringQuerySchema))
    query: ListEngineeringQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Retorna detalhes de um material/insumo por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('engineering.manage')
  @ApiOperation({
    summary: 'Cadastra material calculando unitCost a partir de purchasePrice / conversionFactor',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'category', 'purchaseUnit', 'consumptionUnit', 'conversionFactor'],
      properties: {
        sku: { type: 'string', example: 'PAP-COU-170-SRA3', nullable: true },
        name: { type: 'string', example: 'Couchê Fosco 170g SRA3 (320x450mm)' },
        category: {
          type: 'string',
          enum: ['PAPEL', 'LONA_VINIL', 'CHAPA_RIGIDA', 'TINTA_INSUMO', 'EMBALAGEM'],
          example: 'PAPEL',
        },
        purchaseUnit: { type: 'string', example: 'PACOTE_250' },
        consumptionUnit: { type: 'string', example: 'FOLHA' },
        conversionFactor: { type: 'number', example: 250 },
        widthMm: { type: 'integer', example: 320, nullable: true },
        heightMm: { type: 'integer', example: 450, nullable: true },
        grammageGsm: { type: 'integer', example: 170, nullable: true },
        purchasePrice: { type: 'number', example: 85.0 },
        unitCost: { type: 'number', example: 0.34 },
        stockQty: { type: 'number', example: 500 },
        minStockQty: { type: 'number', example: 150 },
      },
    },
  })
  create(
    @Body(new ZodValidationPipe(createMaterialSchema)) body: CreateMaterialInput,
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Atualiza dados do material e recalcula unitCost se purchasePrice for enviado' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sku: { type: 'string', nullable: true },
        name: { type: 'string', example: 'Couchê Fosco 170g SRA3' },
        category: {
          type: 'string',
          enum: ['PAPEL', 'LONA_VINIL', 'CHAPA_RIGIDA', 'TINTA_INSUMO', 'EMBALAGEM'],
        },
        purchaseUnit: { type: 'string' },
        consumptionUnit: { type: 'string' },
        conversionFactor: { type: 'number', example: 250 },
        widthMm: { type: 'integer', nullable: true },
        heightMm: { type: 'integer', nullable: true },
        grammageGsm: { type: 'integer', nullable: true },
        purchasePrice: { type: 'number', example: 92.5 },
        unitCost: { type: 'number' },
        minStockQty: { type: 'number', example: 200 },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMaterialSchema)) body: UpdateMaterialInput,
  ) {
    return this.service.update(id, body);
  }

  @Post(':id/stock-adjustment')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Realiza ajuste manual de saldo do material' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['qtyDelta', 'reason'],
      properties: {
        qtyDelta: { type: 'number', example: 250 },
        reason: { type: 'string', example: 'Entrada de inventário inicial (1 pacote)' },
      },
    },
  })
  adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adjustMaterialStockSchema))
    body: AdjustMaterialStockInput,
  ) {
    return this.service.adjustStock(id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Ativa ou desativa logicamente um material' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['active'],
      properties: {
        active: { type: 'boolean', example: false },
      },
    },
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(toggleActiveStatusSchema))
    body: ToggleActiveStatusInput,
  ) {
    return this.service.updateStatus(id, body);
  }

  @Delete(':id')
  @RequirePermissions('engineering.delete')
  @ApiOperation({ summary: 'Exclui fisicamente um material sem vínculos (exclusivo Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
