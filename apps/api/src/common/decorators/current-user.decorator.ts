import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RolePermissions } from "@soares/database";

export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string;
	roleId: string;
	roleName: string;
	permissions: RolePermissions;
	maxDiscountPct: string;
}

export const CurrentUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
		const request = ctx
			.switchToHttp()
			.getRequest<{ user: AuthenticatedUser }>();
		return request.user;
	},
);
