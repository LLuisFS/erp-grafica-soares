import { ConflictException } from '@nestjs/common';

/**
 * Executa exclusão física de um cadastro de engenharia protegendo a integridade referencial.
 * Captura código PostgreSQL `23503` (direto ou encapsulado em `error.cause` pelo Drizzle) e orienta desativação lógica.
 */
export async function executeSafeHardDelete(
  deleteFn: () => Promise<void>,
  resourceLabel: string,
  statusRouteExample: string,
) {
  try {
    await deleteFn();
  } catch (error: unknown) {
    const pgCode =
      (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;

    if (pgCode === '23503') {
      throw new ConflictException(
        `Não é possível excluir fisicamente este ${resourceLabel} pois já existem registros vinculados. Utilize ${statusRouteExample} com { "active": false }.`,
      );
    }
    throw error;
  }
}
