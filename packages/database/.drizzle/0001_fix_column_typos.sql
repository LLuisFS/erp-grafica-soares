ALTER TABLE "users" RENAME COLUMN "max_dicount_pct" TO "max_discount_pct";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "comission_pct" TO "commission_pct";--> statement-breakpoint
ALTER TABLE "machines" RENAME COLUMN "max_heigth_mm" TO "max_height_mm";--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_type_check";--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_type_check" CHECK ("customer_addresses"."address_type" IN ('ENTREGA', 'COBRANCA', 'AMBOS'));