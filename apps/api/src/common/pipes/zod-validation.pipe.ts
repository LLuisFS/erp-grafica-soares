import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Pipe NestJS que integra os schemas Zod de `@soares/shared` à validação de entrada dos controllers
 * (ex.: `@Body(new ZodValidationPipe(loginSchema))`).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
    constructor(private readonly schema: ZodSchema) {}

    /** Valida e transforma o payload recebido; lança 400 com `fieldErrors` caso o schema falhe. */
    transform(value: unknown) {
        const result = this.schema.safeParse(value);
        if(!result.success) {
            throw new BadRequestException({
                message: 'Erro de validade nos dados enviados',
                errors: result.error.flatten().fieldErrors,
            });
        }
        return result.data;
    }
}
