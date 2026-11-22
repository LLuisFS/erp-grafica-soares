import { Global, Module } from '@nestjs/common';
import { db } from '@soares/database'

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

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