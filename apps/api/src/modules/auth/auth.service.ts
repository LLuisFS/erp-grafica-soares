import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { and, Database, eq, isNotNull, roles, users } from "@soares/database";
import { LoginInput, VerifyPinInput } from "@soares/shared";
import { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { DRIZZLE_DB } from "../../database/database.module";
import { PasswordService } from "./password.service";

/**
 * Serviço de autenticação da equipe interna e autorização de descontos via PIN gerencial.
 * Integra `DRIZZLE_DB` (`users` / `roles`), `PasswordService` (`scrypt`) e `JwtService`.
 */
@Injectable()
export class AuthService {
    constructor(
        @Inject(DRIZZLE_DB) private readonly db: Database,
        private readonly jwtService: JwtService,
        private readonly passwordService: PasswordService,
    ) { }

    /** Valida e-mail, status ativo e senha do colaborador interno e retorna o Bearer JWT com perfil e permissões. */
    async login(input: LoginInput) {
        const [userRecord] = await this.db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                passwordHash: users.passwordHash,
                active: users.active,
                maxDiscountPct: users.maxDiscountPct,
                roleId: roles.id,
                roleName: roles.name,
                permissions: roles.permissions,
            })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .where(eq(users.email, input.email))
            .limit(1);

        if (!userRecord) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        if (!userRecord.active) {
            throw new UnauthorizedException('Usuário inativo. Contate o administrador da gráfica')
        }

        const isPasswordValid = this.passwordService.verify(
            input.password,
            userRecord.passwordHash,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        const accessToken = await this.jwtService.signAsync({
            sub: userRecord.id,
            email: userRecord.email,
            roleName: userRecord.roleName,
        });

        return {
            access_token: accessToken,
            token_type: 'Bearer',
            user: {
                id: userRecord.id,
                name: userRecord.name,
                email: userRecord.email,
                roleId: userRecord.roleId,
                roleName: userRecord.roleName,
                permissions: userRecord.permissions,
                maxDiscountPct: userRecord.maxDiscountPct,
            },
        };
    }

    /**
     * Valida o PIN gerencial (`users.approval_pin_hash`) para liberar descontos acima da alçada.
     * Suporta busca por gerente específico ou varredura de aprovadores ativos priorizando `currentUser`.
     */
    async verifyPin(input: VerifyPinInput, currentUser: AuthenticatedUser) {
        const canApprove = (permissions: Record<string, boolean | number> | null | undefined) =>
            permissions?.['system.all'] === true || permissions?.['quote.approve_discount'] === true;

        // Caso 1: Gerente específico informado por ID ou por e-mail
        if (input.managerUserId || input.managerEmail) {
            const condition = input.managerUserId
                ? eq(users.id, input.managerUserId)
                : eq(users.email, input.managerEmail!);

            const [manager] = await this.db
                .select({
                    id: users.id,
                    name: users.name,
                    active: users.active,
                    approvalPinHash: users.approvalPinHash,
                    roleName: roles.name,
                    permissions: roles.permissions,
                })
                .from(users)
                .innerJoin(roles, eq(users.roleId, roles.id))
                .where(condition)
                .limit(1);

            if (
                !manager ||
                !manager.active ||
                !canApprove(manager.permissions) ||
                !this.passwordService.verify(input.pin, manager.approvalPinHash)
            ) {
                throw new ForbiddenException(
                    'PIN gerencial inválido ou usuário sem permissão de aprovação',
                );
            }

            return {
                authorized: true,
                authorizedBy: {
                    id: manager.id,
                    name: manager.name,
                    roleName: manager.roleName,
                },
            };
        }

        // Caso 2: Valida contra o usuário logado (se tiver permissão) ou qualquer gerente ativo com PIN
        const approvers = await this.db
            .select({
                id: users.id,
                name: users.name,
                approvalPinHash: users.approvalPinHash,
                roleName: roles.name,
                permissions: roles.permissions,
            })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .where(and(eq(users.active, true), isNotNull(users.approvalPinHash)));

        // Prioriza validar o próprio usuário autenticado antes de testar outros gerentes
        const orderedApprovers = [
            ...approvers.filter((u) => u.id === currentUser.id),
            ...approvers.filter((u) => u.id !== currentUser.id),
        ];

        for (const candidate of orderedApprovers) {
            if (
                canApprove(candidate.permissions) &&
                this.passwordService.verify(input.pin, candidate.approvalPinHash)
            ) {
                return {
                    authorized: true,
                    authorizedBy: {
                        id: candidate.id,
                        name: candidate.name,
                        roleName: candidate.roleName,
                    },
                };
            }
        }

        throw new ForbiddenException(
            'PIN gerencial inválido ou usuário sem permissão de aprovação.'
        );
    }
}