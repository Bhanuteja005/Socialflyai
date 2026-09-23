CREATE TYPE "public"."ad_account_status" AS ENUM('active', 'disabled', 'pending', 'needs_reauth', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."ad_campaign_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'creating', 'paused', 'active', 'completed', 'archived', 'failed', 'unconfirmed');--> statement-breakpoint
ALTER TYPE "public"."ai_generation_kind" ADD VALUE 'ad_copy';--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text,
	"status" "ad_account_status" DEFAULT 'active' NOT NULL,
	"access_token_enc" text NOT NULL,
	"token_secret_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaign_metrics_daily" (
	"campaign_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"spend" numeric(12, 2) DEFAULT 0 NOT NULL,
	"impressions" integer,
	"reach" integer,
	"clicks" integer,
	"conversions" integer,
	"video_views" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_campaign_metrics_daily_campaign_id_day_pk" PRIMARY KEY("campaign_id","day")
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"status" "ad_campaign_status" DEFAULT 'draft' NOT NULL,
	"draft" jsonb NOT NULL,
	"daily_budget" numeric(12, 2),
	"lifetime_budget" numeric(12, 2),
	"currency" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"source_post_id" uuid,
	"source" text DEFAULT 'human' NOT NULL,
	"external_id" text,
	"external_objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manage_url" text,
	"platform_status" text,
	"platform_status_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ads_max_daily_budget" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_metrics_daily" ADD CONSTRAINT "ad_campaign_metrics_daily_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_metrics_daily" ADD CONSTRAINT "ad_campaign_metrics_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_source_post_id_posts_id_fk" FOREIGN KEY ("source_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_accounts_org_provider_ext_uq" ON "ad_accounts" USING btree ("organization_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "ad_metrics_org_day_idx" ON "ad_campaign_metrics_daily" USING btree ("organization_id","day");--> statement-breakpoint
CREATE INDEX "ad_campaigns_org_idx" ON "ad_campaigns" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ad_campaigns_account_idx" ON "ad_campaigns" USING btree ("ad_account_id");