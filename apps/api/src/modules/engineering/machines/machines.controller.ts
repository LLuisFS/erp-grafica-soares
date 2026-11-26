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
  createMachineSchema,
  listEngineeringQuerySchema,
  toggleActiveStatusSchema,
  updateMachineMeterSchema,
  updateMachineSchema,
  type CreateMachineInput,
  type ListEngineeringQuery,
  type ToggleActiveStatusInput,
  type UpdateMachineInput,
  type UpdateMachineMeterInput,
} from '@soares/shared';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { MachinesService } from './machines.service';

/** Controller `/engineering/machines` protegido por RBAC (`engineering.view` / `engineering.manage` / `engineering.delete`). */
@ApiTags('Engenharia - Máquinas')
@ApiBearerAuth()
@Controller('engineering/machines')
export class MachinesController {
  constructor(private readonly service: MachinesService) {}

  @Get()
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Lista máquinas cadastradas (ativas por padrão)' })
  @ApiQuery({ name: 'search', required: false, example: 'Konica' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  findAll(
    @Query(new ZodValidationPipe(listEngineeringQuerySchema))
    query: ListEngineeringQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Retorna ficha técnica de uma máquina por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Cadastra uma nova máquina de impressão ou acabamento' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'sector', 'billingUnit', 'unitCost', 'maxWidthMm', 'maxHeightMm'],
      properties: {
        name: { type: 'string', example: 'Konica Minolta AccurioPress C4070' },
        sector: {
          type: 'string',
          enum: ['PRE_IMPRESSAO', 'DIGITAL', 'OFFSET', 'COM_VISUAL', 'ACABAMENTO'],
          example: 'DIGITAL',
        },
        billingUnit: { type: 'string', enum: ['CLIQUE', 'HORA', 'M2'], example: 'CLIQUE' },
        unitCost: { type: 'number', example: 0.42 },
        setupCost: { type: 'number', example: 8 },
        setupWasteSheets: { type: 'integer', example: 5 },
        maxWidthMm: { type: 'integer', example: 330 },
        maxHeightMm: { type: 'integer', example: 487 },
        gripperMarginMm: { type: 'integer', example: 10 },
        currentOdometer: { type: 'integer', example: 0 },
      },
    },
  })
  create(
    @Body(new ZodValidationPipe(createMachineSchema)) body: CreateMachineInput,
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Atualiza parâmetros técnicos de uma máquina (sem alterar hodômetro)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Konica Minolta C360i' },
        sector: {
          type: 'string',
          enum: ['PRE_IMPRESSAO', 'DIGITAL', 'OFFSET', 'COM_VISUAL', 'ACABAMENTO'],
        },
        billingUnit: { type: 'string', enum: ['CLIQUE', 'HORA', 'M2'] },
        unitCost: { type: 'number', example: 0.48 },
        setupCost: { type: 'number', example: 9.5 },
        setupWasteSheets: { type: 'integer', example: 4 },
        maxWidthMm: { type: 'integer', example: 320 },
        maxHeightMm: { type: 'integer', example: 450 },
        gripperMarginMm: { type: 'integer', example: 10 },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMachineSchema)) body: UpdateMachineInput,
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/meter')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Atualiza o hodômetro/contador de cliques da máquina' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['readingValue'],
      properties: {
        readingValue: { type: 'integer', example: 12500 },
      },
    },
  })
  updateMeter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMachineMeterSchema))
    body: UpdateMachineMeterInput,
  ) {
    return this.service.updateMeter(id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Ativa ou desativa logicamente uma máquina' })
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
  @ApiOperation({ summary: 'Exclui fisicamente uma máquina sem vínculos (exclusivo Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
