import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';

import { FINANCIAL_RESTRICTED_ROLES } from '@soares/shared';
import { Observable } from 'rxjs'; 
import { map } from 'rxjs/operators';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/** Credenciais sensíveis da tabela `users` removidas de todas as respostas, independente do cargo. */
const ALWAYS_STRIP_KEYS = new Set(['passwordHash', 'password_hash', 'approvalPinHash', 'approval_pin_hash']);

/**
 * Campos de custos, preços, margens, descontos e crédito (em camelCase e snake_case)
 * ocultados automaticamente de perfis operacionais sem permissão financeira (`os.view_financial`).
 */
const FINANCIAL_SENSITIVE_KEYS = new Set([
    'unit_cost',
    'unitCost',
    'setup_cost',
    'setupCost',
    'total_amount',
    'totalAmount',
    'total_price',
    'totalPrice',
    'unit_price',
    'unitPrice',
    'cost_material',
    'costMaterial',
    'cost_prepress',
    'costPrepress',
    'cost_machine',
    'costMachine',
    'cost_finishing',
    'costFinishing',
    'cost_taxes',
    'costTaxes',
    'cost_commission',
    'costCommission',
    'markup_pct',
    'markupPct',
    'markup_multiplier',
    'markupMultiplier',
    'discount_amount',
    'discountAmount',
    'default_discount_pct',
    'defaultDiscountPct',
    'max_discount_pct',
    'maxDiscountPct',
    'commission_pct',
    'commissionPct',
    'original_amount',
    'originalAmount',
    'paid_amount',
    'paidAmount',
    'credit_limit',
    'creditLimit',
    'default_delivery_fee',
    'defaultDeliveryFee',
    'calculated_cost',
    'calculatedCost',
]);

/**
 * Percorre recursivamente o payload de saída (preservando instâncias de `Date`),
 * removendo sempre credenciais e, quando `hideFinancial` é true, também os campos financeiros.
 */
function sanitizePayload(value: unknown, hideFinancial: boolean): unknown {
    if(Array.isArray(value)){
        return value.map((item) => sanitizePayload(item, hideFinancial));
    }

    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        const output: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            if (ALWAYS_STRIP_KEYS.has(key)) {
                continue;
            }
            if (hideFinancial && FINANCIAL_SENSITIVE_KEYS.has(key)) {
                continue;
            }
            output[key] = sanitizePayload(val, hideFinancial);
        }
        return output;
    }

    return value;
}

/**
 * Interceptor global de resposta responsável pela blindagem de credenciais e sigilo financeiro.
 * Conecta `FINANCIAL_RESTRICTED_ROLES` (`@soares/shared`) e `request.user` (`JwtAuthGuard`) ao fluxo de saída da API.
 */
@Injectable()
export class FinancialSanitizerInterceptor implements NestInterceptor {
    /** Decide se o usuário autenticado tem restrição financeira e sanitiza o retorno do controller. */
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }> ();
        const user = request.user;

        // Restringe valores financeiros para perfis operacionais ou usuários sem `os.view_financial` / `system.all`
        const isRestrictedRole = 
            !!user &&
            (FINANCIAL_RESTRICTED_ROLES.includes(user.roleName) ||
                (user.permissions?.['system.all'] !== true &&
                    user.permissions?.['os.view_financial'] !== true));
        
        return next.handle().pipe(map((data) => sanitizePayload(data, isRestrictedRole)));
    }
}