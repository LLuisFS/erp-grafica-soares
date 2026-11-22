import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Database, eq, roles, users } from '@soares/database';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DRIZZLE_DB } from '../../database/database.module';

/** Claims mínimos assinados no token JWT gerado por `AuthService.login`. */
export interface JwtPayload {
    sub: string;
    email: string;
    roleName: string;
}

/**
 * Estratégia Passport `'jwt'` acionada pelo `JwtAuthGuard`.
 * Extrai o Bearer token e recarrega o colaborador e suas permissões no banco (`DRIZZLE_DB`).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey:
                process.env.JWT_SECRET?.trim(),
        });
    }

    /**
     * Consulta `users` + `roles` para bloquear imediatamente usuários inativos (`active = false`)
     * e popular `request.user` (`AuthenticatedUser`) com as permissões atuais do cargo.
     */
    async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
        const [record] = await this.db
            .select({
                id: users.id,
                email: users.email,
                name: users.name,
                active: users.active,
                maxDiscountPct: users.maxDiscountPct,
                roleId: roles.id,
                roleName: roles.name,
                permissions: roles.permissions,
            })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .where(eq(users.id, payload.sub))
            .limit(1);

        if (!record || !record.active) {
            throw new UnauthorizedException('Usuário inativo ou não encontrado.');
        }

        return {
            id: record.id,
            email: record.email,
            name: record.name,
            roleId: record.roleId,
            roleName: record.roleName,
            permissions: record.permissions,
            maxDiscountPct: record.maxDiscountPct,
        };
    }
}