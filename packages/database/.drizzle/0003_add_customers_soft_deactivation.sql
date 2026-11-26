ALTER TABLE "customers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_customers_active" ON "customers" USING btree ("active");