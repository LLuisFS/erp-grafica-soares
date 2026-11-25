import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Módulo de CRM Interno (`customers`, `customer_phones`, `customer_addresses` — sem login de cliente, RN02).
 * Exporta `CustomersService` para reuso nos futuros módulos de WhatsApp (RF02) e Orçamentos.
 */
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}