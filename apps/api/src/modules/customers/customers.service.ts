import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    and,
    customerAddresses,
    customerPhones,
    customers,
    Database,
    desc,
    eq,
    ilike,
    ne,
    or,
    priceTables,
    sql,
} from '@soares/database';
import {
    CreateCustomerInput,
    CustomerAddressInput,
    CustomerPhoneInput,
    ListCustomersQuery,
    LookupCustomerQuery,
    onlyDigits,
    UpdateCustomerAddressInput,
    UpdateCustomerInput
} from '@soares/shared';
import { DRIZZLE_DB } from '../../database/database.module';

/** Origem do match encontrado em `CustomersService.lookup` para orientar o atendimento omnichannel (RF02). */
export type LookupMatchSource = 'WHATSAPP_PRIMARY' | 'SECONDARY_PHONE' | 'DOCUMENT';

/**
 * Serviço de domínio do CRM interno (`customers`, `customer_phones`, `customer_addresses`).
 * Consome `DRIZZLE_DB` (`@soares/database`) e contratos normalizados de `@soares/shared` para busca omnichannel e gestão fiscal.
 */
@Injectable()
export class CustomersService {
    constructor(@Inject(DRIZZLE_DB) private readonly db: Database) { }

    /**
     * Busca hierárquica para o atendimento WhatsApp (RF02): telefone principal -> telefone secundário -> CPF/CNPJ.
     * Sinaliza `isNewPhoneCustomer` quando o cliente foi encontrado pelo documento mas entrou por um número novo.
     */
    async lookup(query: LookupCustomerQuery) {
        let customerId: string | null = null;
        let matchedBy: LookupMatchSource | null = null;

        if (query.phone) {
            const [primaryMatch] = await this.db
                .select({ id: customers.id })
                .from(customers)
                .where(eq(customers.whatsappPhone, query.phone))
                .limit(1);

            if (primaryMatch) {
                customerId = primaryMatch.id;
                matchedBy = 'WHATSAPP_PRIMARY';
            } else {
                const [secondaryMatch] = await this.db
                    .select({ customerId: customerPhones.customerId })
                    .from(customerPhones)
                    .where(eq(customerPhones.phoneE164, query.phone))
                    .limit(1);

                if (secondaryMatch) {
                    customerId = secondaryMatch.customerId;
                    matchedBy = 'SECONDARY_PHONE';
                }
            }
        }

        if (!customerId && query.document) {
            const [docMatch] = await this.db
                .select({ id: customers.id })
                .from(customers)
                .where(eq(customers.documentCpfCnpj, query.document))
                .limit(1);

            if (docMatch) {
                customerId = docMatch.id;
                matchedBy = 'DOCUMENT';
            }
        }

        if (!customerId || !matchedBy) {
            throw new NotFoundException(
                'Nenhum cliente encontrado para o telefone ou CPF/CNPJ informado.',
            );
        }

        const customer = await this.findById(customerId);

        const isNewPhoneCustomer =
            Boolean(query.phone) &&
            customer.whatsappPhone !== query.phone &&
            !customer.phones.some((p) => p.phoneE164 === query.phone);

        return {
            matchedBy,
            isNewPhoneCustomer,
            customer,
        };
    }

    /** Lista clientes com paginação, filtros (`personType`, `billingType`) e busca textual/numérica em paralelo com `COUNT(*)`. */
    async list(query: ListCustomersQuery) {
        const conditions = [];

        if (query.personType) {
            conditions.push(eq(customers.personType, query.personType));
        }

        if (query.billingType) {
            conditions.push(eq(customers.billingType, query.billingType));
        }

        if (query.search) {
            const term = `%${query.search}%`;
            const digits = onlyDigits(query.search);

            const searchFilters = [
                ilike(customers.name, term),
                ilike(customers.tradeName, term),
                ilike(customers.email, term),
                ilike(customers.whatsappPhone, term),
            ];

            if (digits.length > 0) {
                searchFilters.push(ilike(customers.documentCpfCnpj, `%${digits}%`));
                searchFilters.push(ilike(customers.whatsappPhone, `%${digits}%`));
            }

            conditions.push(or(...searchFilters));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        const offset = (query.page - 1) * query.limit;

        const [items, countResult] = await Promise.all([
            this.db.query.customers.findMany({
                where: whereClause,
                with: {
                    priceTable: true,
                    phones: true,
                    addresses: true,
                },
                orderBy: [desc(customers.createdAt)],
                limit: query.limit,
                offset,
            }),
            this.db
                .select({ count: sql<number>`count(*)::int` })
                .from(customers)
                .where(whereClause),
        ]);

        const total = countResult[0]?.count ?? 0;

        return {
            data: items,
            meta: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    }

    /** Carrega o cliente completo com tabela de preço, vendedor responsável, telefones e endereços; lança 404 se inexistente. */
    async findById(id: string) {
        const customer = await this.db.query.customers.findFirst({
            where: eq(customers.id, id),
            with: {
                priceTable: true,
                assignedUser: {
                    columns: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                phones: true,
                addresses: true,
            },
        });

        if (!customer) {
            throw new NotFoundException('Cliente não encontrado.');
        }

        return customer;
    }

    /**
     * Cadastra cliente PF/PJ com telefones e endereços iniciais em transação atômica.
     * Aplica fallback da tabela de preço ativa e vincula `currentUserId` caso `assignedUserId` não seja informado.
     */
    async create(input: CreateCustomerInput, currentUserId: string) {
        if (input.documentCpfCnpj) {
            await this.ensureDocumentAvailable(input.whatsappPhone);
        }

        await this.ensurePhoneAvailable(input.whatsappPhone);
        for (const extraPhone of input.phones ?? []) {
            if (extraPhone.phoneE164 === input.whatsappPhone) {
                throw new BadRequestException(
                    'O telefone secuntário não pode ser igual ao Whatsapp principal do mesmo cadastro.'
                );
            }
            await this.ensurePhoneAvailable(extraPhone.phoneE164);
        }

        const priceTableId = input.priceTableId ?? (await this.getDefaultPriceTableId());

        const createdId = await this.db.transaction(async (tx) => {
            const [inserted] = await tx
                .insert(customers)
                .values({
                    priceTableId,
                    assignedUserId: input.assignedUserId ?? currentUserId,
                    personType: input.personType,
                    name: input.name,
                    tradeName: input.tradeName ?? null,
                    documentCpfCnpj: input.documentCpfCnpj ?? null,
                    stateRegistration: input.stateRegistration ?? null,
                    email: input.email ?? null,
                    whatsappPhone: input.whatsappPhone,
                    billingType: input.billingType,
                    creditLimit: input.creditLimit,
                    notes: input.notes ?? null,
                })
                .returning({ id: customers.id });

            const customerId = inserted!.id;

            if (input.phones && input.phones.length > 0) {
                await tx.insert(customerPhones).values(
                    input.phones.map((p) => ({
                        customerId,
                        phoneE164: p.phoneE164,
                        label: p.label ?? null,
                    })),
                );
            }

            if (input.addresses && input.addresses.length > 0) {
                await tx.insert(customerAddresses).values(
                    input.addresses.map((addr) => ({
                        customerId,
                        addressType: addr.addressType,
                        zipCode: addr.zipCode,
                        street: addr.street,
                        number: addr.number,
                        complement: addr.complement ?? null,
                        neighborhood: addr.neighborhood,
                        city: addr.city,
                        state: addr.state,
                        defaultDeliveryFee: addr.defaultDeliveryFee,
                    })),
                );
            }

            return customerId;
        });

        return this.findById(createdId);
    }

    /** Atualiza parcialmente um cliente, revalidando consistência PF/PJ com CPF/CNPJ e unicidade de documento/WhatsApp. */
    async update(id: string, input: UpdateCustomerInput) {
        const existing = await this.findById(id);

        const nextPersonType = input.personType ?? (existing.personType as 'PF' | 'PJ');
        const nextDocument =
            input.documentCpfCnpj !== undefined ? input.documentCpfCnpj : existing.documentCpfCnpj;

        if (nextDocument) {
            if (nextPersonType === 'PF' && nextDocument.length !== 11) {
                throw new BadRequestException('Pessoa Física (PF) exige CPF com 11 dígitos.');
            }
            if (nextPersonType === 'PJ' && nextDocument.length !== 14) {
                throw new BadRequestException('Pessoa Jurídica (PJ) exige CNPJ com 14 dígitos.');
            }
            if (nextDocument !== existing.documentCpfCnpj) {
                await this.ensureDocumentAvailable(nextDocument, id);
            }
        }

        if (input.whatsappPhone && input.whatsappPhone !== existing.whatsappPhone) {
            await this.ensurePhoneAvailable(input.whatsappPhone, id);
        }

        await this.db
            .update(customers)
            .set({
                ...(input.priceTableId !== undefined && { priceTableId: input.priceTableId }),
                ...(input.assignedUserId !== undefined && { assignedUserId: input.assignedUserId }),
                ...(input.personType !== undefined && { personType: input.personType }),
                ...(input.name !== undefined && { name: input.name }),
                ...(input.tradeName !== undefined && { tradeName: input.tradeName }),
                ...(input.documentCpfCnpj !== undefined && { documentCpfCnpj: input.documentCpfCnpj, }),
                ...(input.stateRegistration !== undefined && { stateRegistration: input.stateRegistration, }),
                ...(input.email !== undefined && { email: input.email }),
                ...(input.whatsappPhone !== undefined && { whatsappPhone: input.whatsappPhone }),
                ...(input.billingType !== undefined && { billingType: input.billingType }),
                ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit }),
                ...(input.notes !== undefined && { notes: input.notes }),
                updatedAt: new Date(),
            })
            .where(eq(customers.id, id));

        return this.findById(id);
    }

    /** Remove o cadastro do cliente (telefones e endereços filhos são apagados em cascata pela FK `ON DELETE CASCADE`). */
    async remove(id: string) {
        await this.findById(id);
        await this.db.delete(customers).where(eq(customers.id, id));
        return { deleted: true, id };
    }

    /** Vincula um telefone secundário E.164 (`customer_phones`), bloqueando conflitos em qualquer cliente com 409. */
    async addPhone(customerId: string, input: CustomerPhoneInput) {
        const customer = await this.findById(customerId);

        if (customer.whatsappPhone === input.phoneE164) {
            throw new ConflictException({
                message: 'Este telefone já é o Whatsapp principal deste mesmo cliente.',
                conflictField: 'whatsappPhone',
                existingCustomer: {
                    id: customer.id,
                    name: customer.name,
                    documentCpfCnpj: customer.documentCpfCnpj,
                    whatsappPhone: customer.whatsappPhone,
                },
            });
        }

        await this.ensurePhoneAvailable(input.phoneE164);

        const [created] = await this.db
            .insert(customerPhones)
            .values({
                customerId,
                phoneE164: input.phoneE164,
                label: input.label ?? null,
            })
            .returning();

        return created;
    }

    /** Desvincula um telefone secundário garantindo que pertença ao `customerId` informado. */
    async removePhone(customerId: string, phoneId: string) {
        await this.findById(customerId);
        const [deleted] = await this.db
            .delete(customerPhones)
            .where(and(eq(customerPhones.id, phoneId), eq(customerPhones.customerId, customerId)))
            .returning({ id: customerPhones.id });

        if (!deleted) {
            throw new NotFoundException('Telefone secundário não encontrado para este cliente.');
        }

        return { deleted: true, id: deleted.id };
    }

    /** Adiciona endereço de entrega/cobrança (`customer_addresses`) ao cliente. */
    async addAddress(customerId: string, input: CustomerAddressInput) {
        await this.findById(customerId);

        const [created] = await this.db
            .insert(customerAddresses)
            .values({
                customerId,
                addressType: input.addressType,
                zipCode: input.zipCode,
                street: input.street,
                number: input.number,
                complement: input.complement ?? null,
                neighborhood: input.neighborhood,
                city: input.city,
                state: input.state,
                defaultDeliveryFee: input.defaultDeliveryFee,
            })
            .returning();

        return created;
    }

    /** Atualiza parcialmente um endereço garantindo o vínculo com `customerId`. */
    async updateAddress(customerId: string, addressId: string, input: UpdateCustomerAddressInput) {
        await this.findById(customerId);

        const [updated] = await this.db
            .update(customerAddresses)
            .set({
                ...(input.addressType !== undefined && { addressType: input.addressType }),
                ...(input.zipCode !== undefined && { zipCode: input.zipCode }),
                ...(input.street !== undefined && { street: input.street }),
                ...(input.number !== undefined && { number: input.number }),
                ...(input.complement !== undefined && { complement: input.complement }),
                ...(input.neighborhood !== undefined && { neighborhood: input.neighborhood }),
                ...(input.city !== undefined && { city: input.city }),
                ...(input.state !== undefined && { state: input.state }),
                ...(input.defaultDeliveryFee !== undefined && { defaultDeliveryFee: input.defaultDeliveryFee }),
            })
            .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
            .returning();

        if (!updated) {
            throw new NotFoundException('Endereço não encontrado para este cliente.');
        }

        return updated;
    }

    /** Remove um endereço específico do cliente; lança 404 caso não pertença ao `customerId`. */
    async removeAddress(customerId: string, addressId: string) {
        await this.findById(customerId);

        const [deleted] = await this.db
            .delete(customerAddresses)
            .where(
                and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)),
            )
            .returning({ id: customerAddresses.id });

        if (!deleted) {
            throw new NotFoundException('Endereço não encontrado para este cliente.');
        }

        return { deleted: true, id: deleted.id };
    }

    /** Garante unicidade de CPF/CNPJ e devolve o cliente conflitante em 409 para facilitar unificação no atendimento. */
    private async ensureDocumentAvailable(documentCpfCnpj: string, ignoreCustomerId?: string) {
        const condition = ignoreCustomerId
            ? and(
                eq(customers.documentCpfCnpj, documentCpfCnpj),
                ne(customers.id, ignoreCustomerId),
            )
            : eq(customers.documentCpfCnpj, documentCpfCnpj);

        const [conflict] = await this.db
            .select({
                id: customers.id,
                name: customers.name,
                documentCpfCnpj: customers.documentCpfCnpj,
                whatsappPhone: customers.whatsappPhone,
            })
            .from(customers)
            .where(condition)
            .limit(1);

        if (conflict) {
            throw new ConflictException({
                message: 'Já existe um cliente cadastrado com este CPF/CNPJ.',
                conflictField: 'documentCpfCnpj',
                existingCustomer: conflict,
            });
        }
    }

    /** Valida que o telefone E.164 não está em uso em `customers.whatsapp_phone` nem em `customer_phones`. */
    private async ensurePhoneAvailable(phoneE164: string, ignoreCustomerId?: string) {
        const primaryCondition = ignoreCustomerId
            ? and(eq(customers.whatsappPhone, phoneE164), ne(customers.id, ignoreCustomerId))
            : eq(customers.whatsappPhone, phoneE164);

        const [primaryConflict] = await this.db
            .select({
                id: customers.id,
                name: customers.name,
                documentCpfCnpj: customers.documentCpfCnpj,
                whatsappPhone: customers.whatsappPhone,
            })
            .from(customers)
            .where(primaryCondition)
            .limit(1);

        if (primaryConflict) {
            throw new ConflictException({
                message: 'Este telefone já está cadastrado como WhatsApp principal de outro cliente.',
                conflictField: 'whatsappPhone',
                existingCustomer: primaryConflict,
            });
        }

        const secondaryCondition = ignoreCustomerId
            ? and(
                eq(customerPhones.phoneE164, phoneE164),
                ne(customerPhones.customerId, ignoreCustomerId),
            )
            : eq(customerPhones.phoneE164, phoneE164);

        const [secondaryConflict] = await this.db
            .select({
                id: customers.id,
                name: customers.name,
                documentCpfCnpj: customers.documentCpfCnpj,
                whatsappPhone: customers.whatsappPhone,
            })
            .from(customerPhones)
            .innerJoin(customers, eq(customerPhones.customerId, customers.id))
            .where(secondaryCondition)
            .limit(1);

        if (secondaryConflict) {
            throw new ConflictException({
                message: 'Este telefone já está vinculado como contato secundário de outro cliente.',
                conflictField: 'phoneE164',
                existingCustomer: secondaryConflict,
            });
        }
    }

    /** Seleciona a primeira tabela de preço ativa (ex.: Balcão do seed) como padrão quando `priceTableId` é omitido. */
    private async getDefaultPriceTableId(): Promise<string> {
        const [balcao] = await this.db
            .select({ id: priceTables.id })
            .from(priceTables)
            .where(eq(priceTables.active, true))
            .limit(1);

        if (!balcao) {
            throw new BadRequestException(
                'Nenhuma tabela de preço ativa encontrada.',
            );
        }

        return balcao.id;
    }
}