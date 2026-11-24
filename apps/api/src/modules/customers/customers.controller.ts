import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    CreateCustomerInput,
    createCustomerSchema,
    CustomerAddressInput,
    customerAddressInputSchema,
    CustomerPhoneInput,
    customerPhoneInputSchema,
    ListCustomersQuery,
    listCustomersQuerySchema,
    LookupCustomerQuery,
    lookupCustomerQuerySchema,
    UpdateCustomerAddressInput,
    updateCustomerAddressSchema,
    UpdateCustomerInput,
    updateCustomerSchema,
} from '@soares/shared';
import {
    AuthenticatedUser,
    CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CustomersService } from './customers.service';

@ApiTags('CRM Interno — Clientes')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
    constructor(private readonly customersService: CustomersService) { }

    @Get('lookup')
    @RequirePermissions('crm.view')
    @ApiOperation({
        summary:
            'Busca rápida por telefone E.164 (principal ou secundário) e/ou CPF/CNPJ para atendimento WhatsApp',
    })
    @ApiQuery({ name: 'phone', required: false, example: '61999998888' })
    @ApiQuery({ name: 'document', required: false, example: '12345678909' })
    lookup(@Query(new ZodValidationPipe(lookupCustomerQuerySchema)) query: LookupCustomerQuery) {
        return this.customersService.lookup(query);
    }

    @Get()
    @RequirePermissions('crm.view')
    @ApiOperation({ summary: 'Lista clientes internos com paginação e filtro por nome/CPF/telefone' })
    @ApiQuery({ name: 'search', required: false, example: 'Horizonte' })
    @ApiQuery({ name: 'personType', required: false, enum: ['PF', 'PJ'] })
    @ApiQuery({ name: 'billingType', required: false, enum: ['AVISTA', 'FATURADO_MENSAL'] })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 20 })
    list(@Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQuery) {
        return this.customersService.list(query);
    }

    @Get(':id')
    @RequirePermissions('crm.view')
    @ApiOperation({
        summary: 'Retorna o cadastro completo do cliente (tabela de preço, telefones e endereços)',
    })
    findById(@Param('id', ParseUUIDPipe) id: string) {
        return this.customersService.findById(id);
    }

    @Post()
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Cadastra novo cliente PF ou PJ (com telefones e endereços opcionais)' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['personType', 'name', 'whatsappPhone'],
            properties: {
                personType: { type: 'string', enum: ['PF', 'PJ'], example: 'PJ' },
                name: { type: 'string', example: 'Construtora Horizonte LTDA' },
                tradeName: { type: 'string', example: 'Horizonte Engenharia' },
                documentCpfCnpj: { type: 'string', example: '11.222.333/0001-81' },
                stateRegistration: { type: 'string', example: 'ISENTO' },
                email: { type: 'string', example: 'compras@horizonte.com.br' },
                whatsappPhone: { type: 'string', example: '(61) 99888-7766' },
                billingType: {
                    type: 'string',
                    enum: ['AVISTA', 'FATURADO_MENSAL'],
                    example: 'AVISTA',
                },
                addresses: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            addressType: { type: 'string', example: 'AMBOS' },
                            zipCode: { type: 'string', example: '73750-000' },
                            street: { type: 'string', example: 'Av. Brasil' },
                            number: { type: 'string', example: '150' },
                            neighborhood: { type: 'string', example: 'Centro' },
                            city: { type: 'string', example: 'Planaltina' },
                            state: { type: 'string', example: 'GO' },
                        },
                    },
                },
            },
        },
    })
    create(
        @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.customersService.create(body, user.id);
    }

    @Patch(':id')
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Atualiza dados cadastrais e fiscais de um cliente' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                priceTableId: { type: 'string', format: 'uuid' },
                assignedUserId: { type: 'string', format: 'uuid', nullable: true },
                personType: { type: 'string', enum: ['PF', 'PJ'], example: 'PJ' },
                name: { type: 'string', example: 'Construtora Horizonte LTDA' },
                tradeName: { type: 'string', example: 'Horizonte Engenharia', nullable: true },
                documentCpfCnpj: { type: 'string', example: '11.222.333/0001-81', nullable: true },
                stateRegistration: { type: 'string', example: 'ISENTO', nullable: true },
                email: { type: 'string', example: 'compras@horizonte.com.br', nullable: true },
                whatsappPhone: { type: 'string', example: '(61) 99888-7766' },
                billingType: { type: 'string', enum: ['AVISTA', 'FATURADO_MENSAL'], example: 'AVISTA' },
                creditLimit: { type: 'string', example: '5000.00' },
                notes: { type: 'string', example: 'Cliente prefere entrega pela manhã', nullable: true },
            },
        },
    })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    ) {
        return this.customersService.update(id, body);
    }

    @Delete(':id')
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Remove um cadastro de cliente' })
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.customersService.remove(id);
    }

    @Post(':id/phones')
    @RequirePermissions('crm.manage')
    @ApiOperation({
        summary: 'Vincula um novo número de telefone secundário (customer_phones) ao cliente',
    })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['phoneE164'],
            properties: {
                phoneE164: { type: 'string', example: '(61) 99999-8888' },
                label: { type: 'string', example: 'Setor de Compras', nullable: true },
            },
        },
    })
    addPhone(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(customerPhoneInputSchema)) body: CustomerPhoneInput,
    ) {
        return this.customersService.addPhone(id, body);
    }

    @Delete(':id/phones/:phoneId')
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Remove um telefone secundário vinculado ao cliente' })
    removePhone(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('phoneId', ParseUUIDPipe) phoneId: string,
    ) {
        return this.customersService.removePhone(id, phoneId);
    }

    @Post(':id/addresses')
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Adiciona um endereço de entrega/cobrança ao cliente' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['zipCode', 'street', 'number', 'neighborhood', 'city', 'state'],
            properties: {
                addressType: { type: 'string', enum: ['ENTREGA', 'COBRANCA', 'AMBOS'], example: 'ENTREGA' },
                zipCode: { type: 'string', example: '73750-000' },
                street: { type: 'string', example: 'Av. Brasil' },
                number: { type: 'string', example: '150' },
                complement: { type: 'string', example: 'Sala 04', nullable: true },
                neighborhood: { type: 'string', example: 'Centro' },
                city: { type: 'string', example: 'Planaltina' },
                state: { type: 'string', example: 'GO' },
                defaultDeliveryFee: { type: 'string', example: '15.00' },
            },
        },
    })
    addAddress(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(customerAddressInputSchema)) body: CustomerAddressInput,
    ) {
        return this.customersService.addAddress(id, body);
    }

    @Patch(':id/addresses/:addressId')
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Atualiza um endereço existente do cliente' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                addressType: { type: 'string', enum: ['ENTREGA', 'COBRANCA', 'AMBOS'], example: 'AMBOS' },
                zipCode: { type: 'string', example: '73750-000' },
                street: { type: 'string', example: 'Av. Brasil' },
                number: { type: 'string', example: '200' },
                complement: { type: 'string', example: 'Galpão B', nullable: true },
                neighborhood: { type: 'string', example: 'Centro' },
                city: { type: 'string', example: 'Planaltina' },
                state: { type: 'string', example: 'GO' },
                defaultDeliveryFee: { type: 'string', example: '20.00' },
            },
        },
    })
    updateAddress(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('addressId', ParseUUIDPipe) addressId: string,
        @Body(new ZodValidationPipe(updateCustomerAddressSchema)) body: UpdateCustomerAddressInput,
    ) {
        return this.customersService.updateAddress(id, addressId, body);
    }

    @Delete(':id/addresses/:addressId')
    @RequirePermissions('crm.manage')
    @ApiOperation({ summary: 'Remove um endereço do cliente' })
    removeAddress(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('addressId', ParseUUIDPipe) addressId: string,
    ) {
        return this.customersService.removeAddress(id, addressId);
    }
}