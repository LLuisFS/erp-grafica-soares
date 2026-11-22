import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginInput, loginSchema, VerifyPinInput, verifyPinSchema } from '@soares/shared';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

/**
 * Controller `/auth` de autenticação interna (JWT), validação de PIN gerencial
 * e rotas de teste do pipeline RBAC (`RolesGuard`) e `FinancialSanitizerInterceptor`.
 */
@ApiTags('Autenticação & RBAC')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    /** Rota pública de login validada com `loginSchema` (`@soares/shared`). */
    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Autenticação interna da equipe da Gráfica Soares (JWT)' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', example: 'admin@graficasoares.com.br' },
                password: { type: 'string', example: 'Admin@Soares2026' },
            },
        },
    })
    login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
        return this.authService.login(body);
    }

    /** Devolve o `AuthenticatedUser` populado pela `JwtStrategy` em `request.user`. */
    @Get('me')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Retorna o perfil e permissões do usuário autenticado' })
    me(@CurrentUser() user: AuthenticatedUser) {
        return user;
    }

    /** Valida o PIN gerencial (`verifyPinSchema`) para aprovação de descontos acima do limite do vendedor. */
    @Post('verify-pin')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Valida PIN gerencial para liberação de descontos acima do limite' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['pin'],
            properties: {
                pin: { type: 'string', example: '1234' },
                managerEmail: { type: 'string', example: 'admin@graficasoares.com.br' },
            },
        },
    })
    verifyPin(
        @Body(new ZodValidationPipe(verifyPinSchema)) body: VerifyPinInput,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.authService.verifyPin(body, user);
    }

    /** Endpoint de diagnóstico do `RolesGuard`: exige `os.view_financial` e bloqueia perfis operacionais com 403. */
    @Get('test/financial-preview')
    @ApiBearerAuth()
    @RequirePermissions('os.view_financial')
    @ApiOperation({
        summary: 'Rota protegida por RBAC (retorna 403 para OPERADOR_MAQUINA e ARTE_FINALISTA)',
    })
    financialPreview() {
        return {
            message: 'Acesso financeiro autorizado',
            total_amount: '1450.00',
            markup_pct: '42.50',
        };
    }

    /** Endpoint de diagnóstico do `FinancialSanitizerInterceptor` simulando payload de OS com campos financeiros. */
    @Get('test/production-os-preview')
    @ApiBearerAuth()
    @ApiOperation({
        summary:
            'Simula retorno de OS: omite unit_cost e total_amount automaticamente para perfis de fábrica',
    })
    productionOsPreview() {
        return {
            os_code: 4820,
            customer: 'Cliente Exemplo LTDA',
            product: 'Cartão de Visita 90x50mm Couchê 300g',
            quantity: 1000,
            // Campos abaixo são removidos pelo FinancialSanitizerInterceptor para OPERADOR_MAQUINA / ARTE_FINALISTA
            unit_cost: '0.1250',
            total_amount: '185.00',
            markup_pct: '48.00',
        };
    }
}