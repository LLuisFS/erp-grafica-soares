import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RolePermissions } from "@soares/database";

/**
 * Representação do colaborador autenticado anexada em `request.user` pela `JwtStrategy`.
 * Consumida por guards (`RolesGuard`), interceptors (`FinancialSanitizerInterceptor`) e controllers.
 */
export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string;
	roleId: string;
	roleName: string;
	permissions: RolePermissions;
	maxDiscountPct: string;
}

/**
 * Param decorator (`@CurrentUser()`) que extrai o `request.user` já validado pelo `JwtAuthGuard`
 * diretamente nos métodos dos controllers.
 */
export const CurrentUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
		const request = ctx
			.switchToHttp()
			.getRequest<{ user: AuthenticatedUser }>();
		return request.user;
	},
);
