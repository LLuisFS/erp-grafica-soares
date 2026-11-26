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
  createProductTemplateSchema,
  listEngineeringQuerySchema,
  toggleActiveStatusSchema,
  updateProductTemplateSchema,
  type CreateProductTemplateInput,
  type ListEngineeringQuery,
  type ToggleActiveStatusInput,
  type UpdateProductTemplateInput,
} from '@soares/shared';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ProductTemplatesService } from './product-templates.service';

/** Controller `/engineering/product-templates` protegido por RBAC (`engineering.view` / `engineering.manage` / `engineering.delete`). */
@ApiTags('Engenharia - Gabaritos de Produtos')
@ApiBearerAuth()
@Controller('engineering/product-templates')
export class ProductTemplatesController {
  constructor(private readonly service: ProductTemplatesService) {}

  @Get()
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Lista gabaritos de produtos (ativos por padrão)' })
  @ApiQuery({ name: 'search', required: false, example: 'Cartão' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  findAll(
    @Query(new ZodValidationPipe(listEngineeringQuerySchema))
    query: ListEngineeringQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('engineering.view')
  @ApiOperation({ summary: 'Retorna detalhes de um gabarito de produto por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Cadastra um novo gabarito de produto' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'category', 'defaultWidthMm', 'defaultHeightMm'],
      properties: {
        name: { type: 'string', example: 'Folder A4 2 Dobras' },
        category: { type: 'string', enum: ['DIGITAL', 'OFFSET', 'COM_VISUAL'], example: 'DIGITAL' },
        defaultMachineId: { type: 'string', format: 'uuid', nullable: true },
        defaultMaterialId: { type: 'string', format: 'uuid', nullable: true },
        defaultWidthMm: { type: 'integer', example: 297 },
        defaultHeightMm: { type: 'integer', example: 210 },
        bleedMm: { type: 'integer', example: 3 },
        spacingMm: { type: 'integer', example: 2 },
      },
    },
  })
  create(
    @Body(new ZodValidationPipe(createProductTemplateSchema))
    body: CreateProductTemplateInput,
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Atualiza parcialmente um gabarito de produto' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: ['DIGITAL', 'OFFSET', 'COM_VISUAL'] },
        defaultMachineId: { type: 'string', format: 'uuid', nullable: true },
        defaultMaterialId: { type: 'string', format: 'uuid', nullable: true },
        defaultWidthMm: { type: 'integer' },
        defaultHeightMm: { type: 'integer' },
        bleedMm: { type: 'integer' },
        spacingMm: { type: 'integer' },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductTemplateSchema))
    body: UpdateProductTemplateInput,
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('engineering.manage')
  @ApiOperation({ summary: 'Ativa ou desativa logicamente um gabarito de produto' })
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
  @ApiOperation({ summary: 'Exclui fisicamente um gabarito sem vínculos (exclusivo Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
