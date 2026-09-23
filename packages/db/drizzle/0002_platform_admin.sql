CREATE TYPE "public"."platform_role" AS ENUM('user', 'admin');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ai_monthly_budget_usd" numeric(10, 2);