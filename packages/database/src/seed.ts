import { randomBytes, scryptSync } from 'node:crypto';
import { db, queryClient } from './client';
import {
  finishingServices,
  machines,
  materials,
  priceTables,
  productTemplates,
  roles,
  users,
} from './schema';

/** Gera hash salted no formato `scrypt:<salt>:<key>`, compatível com `PasswordService.verify` em `@soares/api`. */
function hashSecret(plainText: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(plainText, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

// UUIDs determinísticos garantem idempotência mesmo em tabelas sem UNIQUE na coluna name
const IDS = {
  roles: {
    ADMIN: '10000000-0000-4000-8000-000000000001',
    GERENTE: '10000000-0000-4000-8000-000000000002',
    ATENDENTE: '10000000-0000-4000-8000-000000000003',
    ARTE_FINALISTA: '10000000-0000-4000-8000-000000000004',
    OPERADOR_MAQUINA: '10000000-0000-4000-8000-000000000005',
    FINANCEIRO: '10000000-0000-4000-8000-000000000006',
  },
  adminUser: '20000000-0000-4000-8000-000000000001',
  priceTables: {
    BALCAO: '30000000-0000-4000-8000-000000000001',
    AGENCIA: '30000000-0000-4000-8000-000000000002',
    CORPORATIVO: '30000000-0000-4000-8000-000000000003',
  },
  machines: {
    EPSON_C5390: '40000000-0000-4000-8000-000000000001',
    KONICA_C360I: '40000000-0000-4000-8000-000000000002',
    GUILHOTINA: '40000000-0000-4000-8000-000000000003',
    PLOTTER_1600: '40000000-0000-4000-8000-000000000004',
  },
  materials: {
    COUCHE_150_SRA3: '50000000-0000-4000-8000-000000000001',
    COUCHE_250_SRA3: '50000000-0000-4000-8000-000000000002',
    COUCHE_300_SRA3: '50000000-0000-4000-8000-000000000003',
    OFFSET_75_A4: '50000000-0000-4000-8000-000000000004',
    OFFSET_90_A4: '50000000-0000-4000-8000-000000000005',
    OFFSET_90_SRA3: '50000000-0000-4000-8000-000000000006',
    OFFSET_180_SRA3: '50000000-0000-4000-8000-000000000007',
    ADESIVO_COUCHE_SRA3: '50000000-0000-4000-8000-000000000008',
    ADESIVO_VINIL_BOBINA: '50000000-0000-4000-8000-000000000009',
    LONA_440G_BOBINA: '50000000-0000-4000-8000-000000000010',
    BOPP_FOSCO_BOBINA: '50000000-0000-4000-8000-000000000011',
    SUPREMO_250_SRA3: '50000000-0000-4000-8000-000000000012',
  },
  finishings: {
    LAMINACAO_FOSCA: '60000000-0000-4000-8000-000000000001',
    REFILE_GUILHOTINA: '60000000-0000-4000-8000-000000000002',
    VINCO_DOBRA: '60000000-0000-4000-8000-000000000003',
    ILHOS_BANNER: '60000000-0000-4000-8000-000000000004',
    BAINHA_SOLDA: '60000000-0000-4000-8000-000000000005',
    CANTOS_ARREDONDADOS: '60000000-0000-4000-8000-000000000006',
  },
  templates: {
    CARTAO_VISITA: '70000000-0000-4000-8000-000000000001',
    FLYER_A5: '70000000-0000-4000-8000-000000000002',
    BANNER_LONA: '70000000-0000-4000-8000-000000000003',
    ADESIVO_VINIL_M2: '70000000-0000-4000-8000-000000000004',
    TIMBRADO_A4: '70000000-0000-4000-8000-000000000005',
  },
} as const;

async function seed() {
  console.log('Iniciando seed idempotente da Gráfica Soares...');

  // 1. Perfis de Acesso (RBAC)
  await db
    .insert(roles)
    .values([
      {
        id: IDS.roles.ADMIN,
        name: 'ADMIN',
        permissions: {
          'system.all': true,
          'os.view_financial': true,
          'quote.create': true,
          'quote.approve_discount': true,
          'crm.delete': true,
          'finance.manage': true,
          'engineering.manage': true,
          'engineering.delete': true,
        },
      },
      {
        id: IDS.roles.GERENTE,
        name: 'GERENTE',
        permissions: {
          'os.view_financial': true,
          'quote.create': true,
          'quote.approve_discount': true,
          'finance.manage': true,
          'engineering.manage': true,
          'production.manage': true,
        },
      },
      {
        id: IDS.roles.ATENDENTE,
        name: 'ATENDENTE',
        permissions: {
          'os.view_financial': true,
          'quote.create': true,
          'quote.approve_discount': false,
          'crm.manage': true,
          'whatsapp.manage': true,
        },
      },
      {
        id: IDS.roles.ARTE_FINALISTA,
        name: 'ARTE_FINALISTA',
        permissions: {
          'os.view_financial': false,
          'artwork.manage': true,
          'production.view': true,
        },
      },
      {
        id: IDS.roles.OPERADOR_MAQUINA,
        name: 'OPERADOR_MAQUINA',
        permissions: {
          'os.view_financial': false,
          'production.view': true,
          'production.update_step': true,
        },
      },
      {
        id: IDS.roles.FINANCEIRO,
        name: 'FINANCEIRO',
        permissions: {
          'os.view_financial': true,
          'finance.manage': true,
          'crm.view': true,
        },
      },
    ])
    .onConflictDoNothing();

  // 2. Usuário Administrador Inicial
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Luis Fernando Soares';
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@graficasoares.com.br'
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || 'Admin@Soares2026';
  const adminPin = process.env.SEED_ADMIN_PIN?.trim() || '1234';

  await db
    .insert(users)
    .values({
      id: IDS.adminUser,
      roleId: IDS.roles.ADMIN,
      name: adminName,
      email: adminEmail,
      passwordHash: hashSecret(adminPassword),
      approvalPinHash: hashSecret(adminPin),
      maxDiscountPct: '100.00',
      commissionPct: '0.00',
      active: true,
    })
    .onConflictDoNothing();

  // 3. Tabelas Comerciais de Preço
  await db
    .insert(priceTables)
    .values([
      {
        id: IDS.priceTables.BALCAO,
        name: 'Balcão (Consumidor Final)',
        markupMultiplier: '1.0000',
        defaultDiscountPct: '0.00',
        active: true,
      },
      {
        id: IDS.priceTables.AGENCIA,
        name: 'Agência / Revenda',
        markupMultiplier: '0.8200',
        defaultDiscountPct: '0.00',
        active: true,
      },
      {
        id: IDS.priceTables.CORPORATIVO,
        name: 'Corporativo',
        markupMultiplier: '0.9200',
        defaultDiscountPct: '5.00',
        active: true,
      },
    ])
    .onConflictDoNothing();

  // 4. Equipamentos Base da Gráfica Soares
  await db
    .insert(machines)
    .values([
      {
        id: IDS.machines.EPSON_C5390,
        name: 'Epson WF-C5390',
        sector: 'DIGITAL',
        billingUnit: 'CLIQUE',
        unitCost: '0.1800',
        setupCost: '2.50',
        setupWasteSheets: 2,
        maxWidthMm: 216,
        maxHeightMm: 356,
        gripperMarginMm: 5,
        currentOdometer: 0,
        active: true,
      },
      {
        id: IDS.machines.KONICA_C360I,
        name: 'Konica Minolta C360i',
        sector: 'DIGITAL',
        billingUnit: 'CLIQUE',
        unitCost: '0.4500',
        setupCost: '8.00',
        setupWasteSheets: 5,
        maxWidthMm: 320,
        maxHeightMm: 450,
        gripperMarginMm: 10,
        currentOdometer: 0,
        active: true,
      },
      {
        id: IDS.machines.GUILHOTINA,
        name: 'Guilhotina Industrial',
        sector: 'ACABAMENTO',
        billingUnit: 'HORA',
        unitCost: '45.0000',
        setupCost: '3.00',
        setupWasteSheets: 0,
        maxWidthMm: 800,
        maxHeightMm: 800,
        gripperMarginMm: 0,
        currentOdometer: 0,
        active: true,
      },
      {
        id: IDS.machines.PLOTTER_1600,
        name: 'Plotter Eco-Solvente 1600mm',
        sector: 'COM_VISUAL',
        billingUnit: 'M2',
        unitCost: '14.5000',
        setupCost: '10.00',
        setupWasteSheets: 0,
        maxWidthMm: 1600,
        maxHeightMm: 50000,
        gripperMarginMm: 15,
        currentOdometer: 0,
        active: true,
      },
    ])
    .onConflictDoNothing();

  // 5. Substratos e Insumos Base (12 itens)
  await db
    .insert(materials)
    .values([
      {
        id: IDS.materials.COUCHE_150_SRA3,
        sku: 'PAP-COU-150-SRA3',
        name: 'Couchê Brilho 150g SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_250',
        consumptionUnit: 'FOLHA',
        conversionFactor: '250.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 150,
        unitCost: '0.2800',
        stockQty: '1000.0000',
        minStockQty: '250.0000',
        active: true,
      },
      {
        id: IDS.materials.COUCHE_250_SRA3,
        sku: 'PAP-COU-250-SRA3',
        name: 'Couchê Brilho 250g SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_250',
        consumptionUnit: 'FOLHA',
        conversionFactor: '250.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 250,
        unitCost: '0.4600',
        stockQty: '750.0000',
        minStockQty: '200.0000',
        active: true,
      },
      {
        id: IDS.materials.COUCHE_300_SRA3,
        sku: 'PAP-COU-300-SRA3',
        name: 'Couchê Fosco/Brilho 300g SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_200',
        consumptionUnit: 'FOLHA',
        conversionFactor: '200.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 300,
        unitCost: '0.5800',
        stockQty: '800.0000',
        minStockQty: '200.0000',
        active: true,
      },
      {
        id: IDS.materials.OFFSET_75_A4,
        sku: 'PAP-OFF-075-A4',
        name: 'Sulfite Offset 75g A4 (210x297mm)',
        category: 'PAPEL',
        purchaseUnit: 'RESMA_500',
        consumptionUnit: 'FOLHA',
        conversionFactor: '500.0000',
        widthMm: 210,
        heightMm: 297,
        grammageGsm: 75,
        unitCost: '0.0560',
        stockQty: '2500.0000',
        minStockQty: '500.0000',
        active: true,
      },
      {
        id: IDS.materials.OFFSET_90_A4,
        sku: 'PAP-OFF-090-A4',
        name: 'Sulfite Offset 90g A4 (210x297mm)',
        category: 'PAPEL',
        purchaseUnit: 'RESMA_500',
        consumptionUnit: 'FOLHA',
        conversionFactor: '500.0000',
        widthMm: 210,
        heightMm: 297,
        grammageGsm: 90,
        unitCost: '0.0720',
        stockQty: '1500.0000',
        minStockQty: '500.0000',
        active: true,
      },
      {
        id: IDS.materials.OFFSET_90_SRA3,
        sku: 'PAP-OFF-090-SRA3',
        name: 'Offset 90g SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_250',
        consumptionUnit: 'FOLHA',
        conversionFactor: '250.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 90,
        unitCost: '0.1800',
        stockQty: '500.0000',
        minStockQty: '150.0000',
        active: true,
      },
      {
        id: IDS.materials.OFFSET_180_SRA3,
        sku: 'PAP-OFF-180-SRA3',
        name: 'Offset 180g SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_250',
        consumptionUnit: 'FOLHA',
        conversionFactor: '250.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 180,
        unitCost: '0.3500',
        stockQty: '500.0000',
        minStockQty: '150.0000',
        active: true,
      },
      {
        id: IDS.materials.ADESIVO_COUCHE_SRA3,
        sku: 'ADE-COU-SRA3',
        name: 'Papel Adesivo Couchê Brilho SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_100',
        consumptionUnit: 'FOLHA',
        conversionFactor: '100.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 190,
        unitCost: '0.9500',
        stockQty: '300.0000',
        minStockQty: '100.0000',
        active: true,
      },
      {
        id: IDS.materials.ADESIVO_VINIL_BOBINA,
        sku: 'VIN-ADE-152-50M',
        name: 'Adesivo Vinil Brilho 0.10mm Bobina 1,52m',
        category: 'LONA_VINIL',
        purchaseUnit: 'BOBINA_50M',
        consumptionUnit: 'M2',
        conversionFactor: '76.0000',
        widthMm: 1520,
        heightMm: null,
        grammageGsm: 140,
        unitCost: '11.8000',
        stockQty: '76.0000',
        minStockQty: '15.0000',
        active: true,
      },
      {
        id: IDS.materials.LONA_440G_BOBINA,
        sku: 'LON-FRO-440-160',
        name: 'Lona Frontlit 440g Fosca/Brilho Bobina 1,60m',
        category: 'LONA_VINIL',
        purchaseUnit: 'BOBINA_50M',
        consumptionUnit: 'M2',
        conversionFactor: '80.0000',
        widthMm: 1600,
        heightMm: null,
        grammageGsm: 440,
        unitCost: '9.9000',
        stockQty: '80.0000',
        minStockQty: '20.0000',
        active: true,
      },
      {
        id: IDS.materials.BOPP_FOSCO_BOBINA,
        sku: 'INS-BOPP-FOSCO-32',
        name: 'Bobina BOPP Fosco Termolaminação 320mm',
        category: 'TINTA_INSUMO',
        purchaseUnit: 'BOBINA_200M',
        consumptionUnit: 'FOLHA',
        conversionFactor: '440.0000',
        widthMm: 320,
        heightMm: null,
        grammageGsm: 24,
        unitCost: '0.1600',
        stockQty: '440.0000',
        minStockQty: '100.0000',
        active: true,
      },
      {
        id: IDS.materials.SUPREMO_250_SRA3,
        sku: 'PAP-SUP-250-SRA3',
        name: 'Cartão Supremo 250g SRA3 (320x450mm)',
        category: 'PAPEL',
        purchaseUnit: 'PACOTE_250',
        consumptionUnit: 'FOLHA',
        conversionFactor: '250.0000',
        widthMm: 320,
        heightMm: 450,
        grammageGsm: 250,
        unitCost: '0.5200',
        stockQty: '500.0000',
        minStockQty: '150.0000',
        active: true,
      },
    ])
    .onConflictDoNothing();

  // 6. Serviços de Acabamento
  await db
    .insert(finishingServices)
    .values([
      {
        id: IDS.finishings.LAMINACAO_FOSCA,
        name: 'Laminação Fosca BOPP (Frente)',
        machineId: null,
        calcBasis: 'POR_FOLHA',
        setupCost: '5.00',
        unitCost: '0.3500',
        isOutsourced: false,
        defaultSupplierId: null,
        active: true,
      },
      {
        id: IDS.finishings.REFILE_GUILHOTINA,
        name: 'Refile Final em Guilhotina',
        machineId: IDS.machines.GUILHOTINA,
        calcBasis: 'FIXO_SETUP',
        setupCost: '4.00',
        unitCost: '0.0000',
        isOutsourced: false,
        defaultSupplierId: null,
        active: true,
      },
      {
        id: IDS.finishings.VINCO_DOBRA,
        name: 'Vinco Central / Dobra',
        machineId: null,
        calcBasis: 'POR_UNIDADE',
        setupCost: '5.00',
        unitCost: '0.0400',
        isOutsourced: false,
        defaultSupplierId: null,
        active: true,
      },
      {
        id: IDS.finishings.ILHOS_BANNER,
        name: 'Aplicação de Ilhós Metálico',
        machineId: null,
        calcBasis: 'POR_UNIDADE',
        setupCost: '0.00',
        unitCost: '0.4500',
        isOutsourced: false,
        defaultSupplierId: null,
        active: true,
      },
      {
        id: IDS.finishings.BAINHA_SOLDA,
        name: 'Solda / Bainha + Bastão e Cordão',
        machineId: null,
        calcBasis: 'POR_M2',
        setupCost: '3.00',
        unitCost: '4.5000',
        isOutsourced: false,
        defaultSupplierId: null,
        active: true,
      },
      {
        id: IDS.finishings.CANTOS_ARREDONDADOS,
        name: 'Corte Cantos Arredondados',
        machineId: null,
        calcBasis: 'POR_UNIDADE',
        setupCost: '3.00',
        unitCost: '0.0300',
        isOutsourced: false,
        defaultSupplierId: null,
        active: true,
      },
    ])
    .onConflictDoNothing();

  // 7. Gabaritos de Produtos (Product Templates)
  await db
    .insert(productTemplates)
    .values([
      {
        id: IDS.templates.CARTAO_VISITA,
        name: 'Cartão de Visita 90x50mm',
        category: 'DIGITAL',
        defaultMachineId: IDS.machines.KONICA_C360I,
        defaultMaterialId: IDS.materials.COUCHE_300_SRA3,
        defaultWidthMm: 90,
        defaultHeightMm: 50,
        bleedMm: 3,
        spacingMm: 2,
      },
      {
        id: IDS.templates.FLYER_A5,
        name: 'Flyer / Panfleto A5 (148x210mm)',
        category: 'DIGITAL',
        defaultMachineId: IDS.machines.KONICA_C360I,
        defaultMaterialId: IDS.materials.COUCHE_150_SRA3,
        defaultWidthMm: 148,
        defaultHeightMm: 210,
        bleedMm: 3,
        spacingMm: 2,
      },
      {
        id: IDS.templates.BANNER_LONA,
        name: 'Banner em Lona 440g (800x1200mm)',
        category: 'COM_VISUAL',
        defaultMachineId: IDS.machines.PLOTTER_1600,
        defaultMaterialId: IDS.materials.LONA_440G_BOBINA,
        defaultWidthMm: 800,
        defaultHeightMm: 1200,
        bleedMm: 20,
        spacingMm: 10,
      },
      {
        id: IDS.templates.ADESIVO_VINIL_M2,
        name: 'Adesivo Vinil Recorte/Impressão (100x100mm)',
        category: 'COM_VISUAL',
        defaultMachineId: IDS.machines.PLOTTER_1600,
        defaultMaterialId: IDS.materials.ADESIVO_VINIL_BOBINA,
        defaultWidthMm: 100,
        defaultHeightMm: 100,
        bleedMm: 3,
        spacingMm: 3,
      },
      {
        id: IDS.templates.TIMBRADO_A4,
        name: 'Papel Timbrado A4 (210x297mm)',
        category: 'DIGITAL',
        defaultMachineId: IDS.machines.EPSON_C5390,
        defaultMaterialId: IDS.materials.OFFSET_90_A4,
        defaultWidthMm: 210,
        defaultHeightMm: 297,
        bleedMm: 0,
        spacingMm: 0,
      },
    ])
    .onConflictDoNothing();

  console.log('Seed concluído com sucesso!');
  console.log(`Admin inicial: ${adminEmail} (PIN gerencial: ${adminPin})`);
}

seed()
  .catch((error) => {
    console.error('Erro ao executar seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });