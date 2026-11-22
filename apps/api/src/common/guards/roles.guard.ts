import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core';
import { PermissionKey } from '@soares/shared';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Observable } from 'rxjs';

/**
 * Guard de autorização RBAC executado após o `JwtAuthGuard`.
 * Cruza as permissões exigidas por `@RequirePermissions()` com `request.user.permissions` (carregadas do banco).
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    /** Libera rotas sem restrição ou perfis `system.all` (ADMIN); caso contrário exige todas as permissões declaradas. */
    canActivate(context: ExecutionContext): boolean {
   const requiredPermissions = this.reflector.getAllAndOverride<PermissionKey[]>(
            REQUIRED_PERMISSIONS_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }
       
        const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Usuário não autenticado.');
        }

        // Bypass administrativo: perfil com `system.all` (ex.: ADMIN) tem acesso irrestrito
        if (user.permissions?.['system.all'] === true) {
            return true;
        }

        const hasAllPermissions = requiredPermissions.every(
            (permission) => user.permissions?.[permission] === true,
        );

        if (!hasAllPermissions) {
            throw new ForbiddenException(
                `Acesso negado para o perfil ${user.roleName}. Permissão necessária: ${requiredPermissions.join(', ')}`,
            );
        } 

        return true;
    }
}