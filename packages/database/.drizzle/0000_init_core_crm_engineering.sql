CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(150) NOT NULL,
	"password_hash" text NOT NULL,
	"approval_pin_hash" text,
	"max_dicount_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"comission_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_type" varchar(20) DEFAULT 'AMBOS' NOT NULL,
	"zip_code" varchar(10) NOT NULL,
	"street" varchar(160) NOT NULL,
	"number" varchar(20) NOT NULL,
	"complement" varchar(80),
	"neighborhood" varchar(80) NOT NULL,
	"city" varchar(80) NOT NULL,
	"state" char(2) NOT NULL,
	"default_delivery_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	CONSTRAINT "customer_addresses_type_check" CHECK ("customer_addresses"."address_type" IN ('ENTREGA', 'COBRANCA', 'AMBOS'))
);
--> statement-breakpoint
CREATE TABLE "customer_phones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"phone_e164" varchar(20) NOT NULL,
	"label" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_phones_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_table_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"person_type" varchar(2),
	"name" varchar(160) NOT NULL,
	"trade_name" varchar(160),
	"document_cpf_cnpj" varchar(14),
	"state_registration" varchar(30),
	"email" varchar(150),
	"whatsapp_phone" varchar(20) NOT NULL,
	"billing_type" varchar(20) DEFAULT 'AVISTA' NOT NULL,
	"credit_limit" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "customers_document_cpf_cnpj_unique" UNIQUE("document_cpf_cnpj"),
	CONSTRAINT "customers_person_type_check" CHECK ("customers"."person_type" IN ('PF', 'PJ')),
	CONSTRAINT "customers_billing_type_check" CHECK ("customers"."billing_type" in ('AVISTA', 'FATURADO_MENSAL'))
);
--> statement-breakpoint
CREATE TABLE "price_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"markup_multiplier" numeric(6, 4) DEFAULT '1.000' NOT NULL,
	"default_discount_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "price_tables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "finishing_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"machine_id" uuid,
	"calc_basis" varchar(20) NOT NULL,
	"setup_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"unit_cost" numeric(10, 4) NOT NULL,
	"is_outsourced" boolean DEFAULT false NOT NULL,
	"default_supplier_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "finishing_calc_basis_check" CHECK ("finishing_services"."calc_basis" IN ('POR_UNIDADE', 'POR_FOLHA', 'POR_M2', 'FIXO_SETUP'))
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"sector" varchar(25) NOT NULL,
	"billing_unit" varchar(15) NOT NULL,
	"unit_cost" numeric(10, 4) NOT NULL,
	"setup_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"setup_waste_sheets" integer DEFAULT 0 NOT NULL,
	"max_width_mm" integer NOT NULL,
	"max_heigth_mm" integer NOT NULL,
	"gripper_margin_mm" integer DEFAULT 10 NOT NULL,
	"current_odometer" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "machines_sector_check" CHECK ("machines"."sector" IN ('PRE_IMPRESSÃO', 'DIGITAL', 'OFFSET', 'COM_VISUAL', 'ACABAMENTO')),
	CONSTRAINT "machine_billing_unit_check" CHECK ("machines"."billing_unit" IN ('CLIQUE', 'HORA', 'M2'))
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(40),
	"name" varchar(140) NOT NULL,
	"category" varchar(25) NOT NULL,
	"purchase_unit" varchar(20) NOT NULL,
	"consumption_unit" varchar(20) NOT NULL,
	"conversion_factor" numeric(12, 4) NOT NULL,
	"width_mm" integer,
	"height_mm" integer,
	"grammage_gsm" integer,
	"unit_cost" numeric(12, 4) NOT NULL,
	"stock_qty" numeric(12, 4) DEFAULT '0' NOT NULL,
	"min_stock_qty" numeric(12, 4) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "materials_sku_unique" UNIQUE("sku"),
	CONSTRAINT "materials_category_check" CHECK ("materials"."category" IN ('PAPEL', 'LONA_VINIL', 'CHAPA_RIGIDA', 'TINTA_INSUMO', 'EMBALAGEM'))
);
--> statement-breakpoint
CREATE TABLE "product_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(25) NOT NULL,
	"default_machine_id" uuid,
	"default_material_id" uuid,
	"default_width_mm" integer NOT NULL,
	"default_height_mm" integer NOT NULL,
	"bleed_mm" integer DEFAULT 3 NOT NULL,
	"spacing_mm" integer DEFAULT 2 NOT NULL,
	CONSTRAINT "product_templates_category_check" CHECK ("product_templates"."category" IN ('DIGITAL', 'OFFSET', 'COM_VISUAL'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_price_table_id_price_tables_id_fk" FOREIGN KEY ("price_table_id") REFERENCES "public"."price_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finishing_services" ADD CONSTRAINT "finishing_services_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_templates" ADD CONSTRAINT "product_templates_default_machine_id_machines_id_fk" FOREIGN KEY ("default_machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_templates" ADD CONSTRAINT "product_templates_default_material_id_materials_id_fk" FOREIGN KEY ("default_material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_customers_whatsapp_phone" ON "customers" USING btree ("whatsapp_phone");