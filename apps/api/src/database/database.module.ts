import { Global, Module } from '@nestjs/common';
import { db } from '@soares/database'

/** Token de injeção de dependência (DI) usado com `@Inject(DRIZZLE_DB)` nos services da API. */
export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

/**
 * Módulo global que expõe o cliente Drizzle (`db` de `@soares/database`) para toda a aplicação NestJS,
 * dispensando reimportá-lo em cada módulo de domínio.
 */
@Global()
@Module({
    providers: [
        {
            provide: DRIZZLE_DB,
            useValue: db,
        },
    ],
    exports: [DRIZZLE_DB],
})
export class DatabaseModule {}