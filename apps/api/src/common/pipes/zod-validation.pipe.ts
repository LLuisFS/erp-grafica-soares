import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPite implements PipeTransform {
    constructor(private readonly schema: ZodSchema) {}

    transform(value: unknown) {
        const result = this.schema.safeParse(value);
        if(!result.sucess) {
            throw new BadRequestException({
                message: 'Erro de validade nos dados enviados',
                errors: result.error.flatten().fieldErrors,
            });
        }
        return result.data;
    }
}
