import { z } from 'zod';

/**
 * Schema de validação do login de colaboradores internos (POST /auth/login).
 * Normaliza o e-mail para lowercase e é reutilizado no pipe da API e nos formulários do web.
 */
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Schema de validação do PIN gerencial (4–6 dígitos) para aprovar descontos acima da alçada do vendedor.
 * Validado contra `users.approval_pin_hash` no `AuthService`.
 */
export const verifyPinSchema = z.object({
    pin: z
        .string()
        .trim()
        .regex(/^\d{4,6}$/, 'O PIN gerencial deve conter de 4 a 6 dígitos numéricos'),
    managerUserId: z.string().uuid().optional(),
    managerEmail: z.string().trim().toLowerCase().email().optional(),
});

export type VerifyPinInput = z.infer<typeof verifyPinSchema>;