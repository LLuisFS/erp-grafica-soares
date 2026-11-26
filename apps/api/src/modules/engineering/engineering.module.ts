import { Module } from '@nestjs/common';
import { FinishingServicesController } from './finishing-services/finishing-services.controller';
import { FinishingServicesService } from './finishing-services/finishing-services.service';
import { MachinesController } from './machines/machines.controller';
import { MachinesService } from './machines/machines.service';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { PriceTablesController } from './price-tables/price-tables.controller';
import { PriceTablesService } from './price-tables/price-tables.service';
import { ProductTemplatesController } from './product-templates/product-templates.controller';
import { ProductTemplatesService } from './product-templates/product-templates.service';

/**
 * Módulo de Engenharia Gráfica (`price_tables`, `machines`, `materials`, `finishing_services`, `product_templates`).
 * Exporta os 5 serviços para reuso no futuro módulo de Orçamentos e integração com `@soares/pricing-engine`.
 */
@Module({
  controllers: [
    PriceTablesController,
    MachinesController,
    MaterialsController,
    FinishingServicesController,
    ProductTemplatesController,
  ],
  providers: [
    PriceTablesService,
    MachinesService,
    MaterialsService,
    FinishingServicesService,
    ProductTemplatesService,
  ],
  exports: [
    PriceTablesService,
    MachinesService,
    MaterialsService,
    FinishingServicesService,
    ProductTemplatesService,
  ],
})
export class EngineeringModule {}
