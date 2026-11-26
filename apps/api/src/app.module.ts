import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { FinancialSanitizerInterceptor } from './common/interceptors/financial-sanitizer.interceptor';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { EngineeringModule } from './modules/engineering/engineering.module';

/** Controller público (`GET /health`) para verificação de disponibilidade da API. */
@ApiTags('Sistema')
@Controller('health')
class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Verifica disponibilidade da API ERP Gráfica Soares' })
  check() {
    return {
      status: 'ok',
      service: 'erp-grafica-soares-api',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Módulo raiz da API REST.
 * Conecta `DatabaseModule` (@Global) e módulos de domínio (`AuthModule`, `CustomersModule`, `EngineeringModule`) e registra o pipeline global de segurança.
 */
@Module({
  imports: [DatabaseModule, AuthModule, CustomersModule, EngineeringModule],
  controllers: [HealthController],
  providers: [
    // A ordem importa: JwtAuthGuard popula `request.user` antes do RolesGuard validar permissões
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: FinancialSanitizerInterceptor,
    },
  ],
})
export class AppModule {}