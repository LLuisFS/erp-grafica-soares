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
  createPriceTableSchema,
  listEngineeringQuerySchema,
  toggleActiveStatusSchema,
  updatePriceTableSchema,
  type CreatePriceTableInput,
  type ListEngineeringQuery,
  type ToggleActiveStatusInput,
  type UpdatePriceTableInput,
} from '@soares/shared';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PriceTablesService } from './price-tables.service';

/** Controller `/engineering/price-tables` protegido por RBAC (`engineering.view` / `engineering.manage` / `engineering.delete`). */
@ApiTags('Engenharia - Tabelas de Preço')
@ApiBearerAuth()
@Controller('engineering/price-tables')
export class PriceTablesController {
  constructor(private readonly service: PriceTablesService) {}

  @Get()
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Lista tabelas de preço (ativas por padrão)' })
  @ApiQuery({ name: 'search', required: false, example: 'Balcão' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  findAll(
    @Query(new ZodValidationPipe(listEngineeringQuerySchema))
    query: ListEngineeringQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Retorna detalhes de uma tabela de preço por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Cria uma nova tabela comercial de preço' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Parceiro Gráfica Rápida' },
        markupMultiplier: { type: 'number', example: 0.85 },
        defaultDiscountPct: { type: 'number', example: 5 },
      },
    },
  })
  create(
    @Body(new ZodValidationPipe(createPriceTableSchema))
    body: CreatePriceTableInput,
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Atualiza parcialmente uma tabela de preço' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Corporativo VIP' },
        markupMultiplier: { type: 'number', example: 0.9 },
        defaultDiscountPct: { type: 'number', example: 7.5 },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePriceTableSchema))
    body: UpdatePriceTableInput,
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Ativa ou desativa logicamente uma tabela de preço' })
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
  @ApiOperation({ summary: 'Exclui fisicamente uma tabela de preço sem vínculos (exclusivo Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
