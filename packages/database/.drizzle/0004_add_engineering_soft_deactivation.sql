ALTER TABLE "machines" DROP CONSTRAINT "machines_sector_check";--> statement-breakpoint
ALTER TABLE "price_tables" ALTER COLUMN "markup_multiplier" SET DEFAULT '1.0000';--> statement-breakpoint
ALTER TABLE "price_tables" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finishing_services" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_templates" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_templates" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_sector_check" CHECK ("machines"."sector" IN ('PRE_IMPRESSAO', 'DIGITAL', 'OFFSET', 'COM_VISUAL', 'ACABAMENTO'));