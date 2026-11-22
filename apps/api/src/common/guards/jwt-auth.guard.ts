import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard global de autenticação JWT (conectado à estratégia `'jwt'` de `modules/auth/jwt.strategy.ts`).
 * Protege todas as rotas por padrão, liberando apenas as decoradas com `@Public()`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    /** Verifica se o método ou controller possui `@Public()` antes de acionar a validação Passport JWT. */
    override canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if(isPublic) {
            return true;
        }

        return super.canActivate(context);
    }

    /** Padroniza o erro 401 quando o token está ausente/expirado ou a `JwtStrategy` rejeita o usuário. */
    override handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
        if (err || !user) {
            throw err instanceof Error
                ? err
                : new UnauthorizedException('Token JWT ausente, expirado ou usuário inativo.');
        }
        return user;
    }
}