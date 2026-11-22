import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';

/**
 * Módulo de autenticação e RBAC da API.
 * Configura `PassportModule`/`JwtModule` (via `JWT_SECRET` e `JWT_EXPIRES_IN`) e exporta `AuthService` e `PasswordService`.
 */
@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
            secret:
                process.env.JWT_SECRET?.trim() || 'soares-erp-jwt-secret-dev-2026-trocar-em-producao',
            signOptions: {
                expiresIn: process.env.JWT_EXPIRES_IN?.trim() || '12h',
            },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, PasswordService, JwtStrategy],
    exports: [AuthService, PasswordService],
})
export class AuthModule {}