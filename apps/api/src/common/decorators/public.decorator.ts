import { SetMetadata } from '@nestjs/common';

/** Chave de metadado consultada via `Reflector` pelo `JwtAuthGuard` para identificar rotas abertas. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Marca um controller ou rota como público (`@Public()`), dispensando o token JWT (ex.: login e webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);