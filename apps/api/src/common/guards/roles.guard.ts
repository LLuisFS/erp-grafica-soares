import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionKey } from '@soares/shared';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Avalia se o mapa de permissões do cargo atende à chave exigida (`PermissionKey`),
 * considerando bypass administrativo (`system.all`) e herança de escrita para leitura (`*.manage` -> `*.view`).
 */
function hasPermission(
  permissions: Record<string, boolean | number> | undefined,
  required: PermissionKey,
): boolean {
  if (!permissions) return false;
  if (permissions['system.all'] === true) return true;
  if (permissions[required] === true) return true;

  // Permissão de escrita (*.manage) implica permissão de leitura (*.view) no mesmo domínio
  if (required.endsWith('.view')) {
    const manageKey = required.replace(/\.view$/, '.manage');
    if (permissions[manageKey] === true) return true;
  }

  return false;
}

/**
 * Guard de autorização RBAC executado após o `JwtAuthGuard`.
 * Cruza as permissões exigidas por `@RequirePermissions()` com `request.user.permissions` via `hasPermission`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /** Libera rotas sem restrição e valida todas as permissões declaradas (com bypass `system.all` e herança `*.manage` -> `*.view`). */
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

    const authorized = requiredPermissions.every((permission) =>
      hasPermission(user.permissions, permission),
    );

    if (!authorized) {
      throw new ForbiddenException(
        `Acesso negado para o perfil ${user.roleName}. Permissão necessária: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}