import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Serviço de hash e verificação (`scrypt`) para senhas de login e PINs gerenciais.
 * Mantém compatibilidade com o formato `scrypt:<salt>:<key>` usado no `seed.ts` de `@soares/database`.
 */
@Injectable()
export class PasswordService {
    /** Gera hash salted (`scrypt`, 64 bytes) para persistir em `users.password_hash` ou `users.approval_pin_hash`. */
    hash(plaintext: string): string {
        const salt = randomBytes(16).toString('hex');
        const derivedKey = scryptSync(plaintext, salt, 64).toString('hex');
        return `scrypt:${salt}:${derivedKey}`;
    }

    /** Verifica texto plano contra o hash salvo usando comparação em tempo constante (`timingSafeEqual`). */
    verify(plainText: string, storedHash: string | null | undefined): boolean {
        if (!storedHash) {
            return false;
        }

        const parts = storedHash.split(':');
        if (parts.length !== 3 || parts[0] !== 'scrypt') {
            return false;
        }

        const [, salt, keyHex] = parts;
        if (!salt || !keyHex) {
            return false;
        }

        const expectedBuffer = Buffer.from(keyHex, 'hex');
        const derivedBuffer = scryptSync(plainText, salt, 64);

        if (expectedBuffer.length !== derivedBuffer.length) {
            return false;
        }

        return timingSafeEqual(expectedBuffer, derivedBuffer);
    }
}