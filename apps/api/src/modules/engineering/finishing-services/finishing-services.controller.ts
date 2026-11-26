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
  createFinishingServiceSchema,
  listEngineeringQuerySchema,
  toggleActiveStatusSchema,
  updateFinishingServiceSchema,
  type CreateFinishingServiceInput,
  type ListEngineeringQuery,
  type ToggleActiveStatusInput,
  type UpdateFinishingServiceInput,
} from '@soares/shared';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { FinishingServicesService } from './finishing-services.service';

/** Controller `/engineering/finishing-services` protegido por RBAC (`engineering.view` / `engineering.manage` / `engineering.delete`). */
@ApiTags('Engenharia - Acabamentos')
@ApiBearerAuth()
@Controller('engineering/finishing-services')
export class FinishingServicesController {
  constructor(private readonly service: FinishingServicesService) {}

  @Get()
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Lista serviços de acabamento (ativos por padrão)' })
  @ApiQuery({ name: 'search', required: false, example: 'Laminação' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  findAll(
    @Query(new ZodValidationPipe(listEngineeringQuerySchema))
    query: ListEngineeringQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Retorna detalhes de um serviço de acabamento por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Cadastra um novo serviço de acabamento' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'calcBasis', 'unitCost'],
      properties: {
        name: { type: 'string', example: 'Verniz Localizado UV' },
        machineId: { type: 'string', format: 'uuid', nullable: true },
        calcBasis: {
          type: 'string',
          enum: ['POR_UNIDADE', 'POR_FOLHA', 'POR_M2', 'FIXO_SETUP'],
          example: 'POR_FOLHA',
        },
        setupCost: { type: 'number', example: 25 },
        unitCost: { type: 'number', example: 0.45 },
        isOutsourced: { type: 'boolean', example: false },
        defaultSupplierId: { type: 'string', format: 'uuid', nullable: true },
      },
    },
  })
  create(
    @Body(new ZodValidationPipe(createFinishingServiceSchema))
    body: CreateFinishingServiceInput,
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Atualiza parcialmente um serviço de acabamento' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        machineId: { type: 'string', format: 'uuid', nullable: true },
        calcBasis: {
          type: 'string',
          enum: ['POR_UNIDADE', 'POR_FOLHA', 'POR_M2', 'FIXO_SETUP'],
        },
        setupCost: { type: 'number' },
        unitCost: { type: 'number' },
        isOutsourced: { type: 'boolean' },
        defaultSupplierId: { type: 'string', format: 'uuid', nullable: true },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFinishingServiceSchema))
    body: UpdateFinishingServiceInput,
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Ativa ou desativa logicamente um serviço de acabamento' })
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
  @ApiOperation({ summary: 'Exclui fisicamente um acabamento sem vínculos (exclusivo Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
