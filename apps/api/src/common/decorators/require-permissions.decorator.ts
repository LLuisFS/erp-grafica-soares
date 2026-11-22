import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '@soares/shared';

/** Chave de metadado consultada via `Reflector` pelo `RolesGuard` para validar permissões da rota. */
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Exige que o usuário autenticado possua todas as permissões listadas (`PermissionKey` de `@soares/shared`).
 * Atua em conjunto com o `RolesGuard` após a autenticação do `JwtAuthGuard`.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);