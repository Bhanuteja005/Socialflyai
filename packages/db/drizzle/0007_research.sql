CREATE TYPE "public"."competitor_source" AS ENUM('user', 'ai');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('pending', 'crawling', 'analyzing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."visibility_sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
ALTER TYPE "public"."ai_generation_kind" ADD VALUE 'research';--> statement-breakpoint
ALTER TYPE "public"."ai_generation_kind" ADD VALUE 'visibility';--> statement-breakpoint
ALTER TYPE "public"."ai_generation_kind" ADD VALUE 'seo';--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"source" "competitor_source" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_rankings" (
	"keyword_id" uuid NOT NULL,
	"day" date NOT NULL,
	"position" integer,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_rankings_keyword_id_day_pk" PRIMARY KEY("keyword_id","day")
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer DEFAULT 2840 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"tracked" boolean DEFAULT false NOT NULL,
	"search_volume" integer,
	"difficulty" integer,
	"cpc_usd" numeric(10, 2),
	"metrics_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"title" text,
	"description" text,
	"headings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by" uuid,
	"start_url" text NOT NULL,
	"status" "research_status" DEFAULT 'pending' NOT NULL,
	"pages_found" integer DEFAULT 0 NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"insights" jsonb,
	"model" text,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visibility_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"model" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answer" text NOT NULL,
	"brand_mentioned" boolean NOT NULL,
	"brand_rank" integer,
	"sentiment" "visibility_sentiment",
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitors_mentioned" uuid[] DEFAULT '{}' NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "visibility_prompts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD CONSTRAINT "keyword_rankings_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_pages" ADD CONSTRAINT "research_pages_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_pages" ADD CONSTRAINT "research_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_checks" ADD CONSTRAINT "visibility_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_checks" ADD CONSTRAINT "visibility_checks_prompt_id_visibility_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."visibility_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_prompts" ADD CONSTRAINT "visibility_prompts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_org_name_uq" ON "competitors" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_org_kw_uq" ON "keywords" USING btree ("organization_id","keyword","location_code","language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "research_pages_run_url_uq" ON "research_pages" USING btree ("run_id","url");--> statement-breakpoint
CREATE INDEX "research_runs_org_idx" ON "research_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "visibility_checks_org_idx" ON "visibility_checks" USING btree ("organization_id","checked_at");--> statement-breakpoint
CREATE INDEX "visibility_checks_prompt_idx" ON "visibility_checks" USING btree ("prompt_id","checked_at");--> statement-breakpoint
CREATE INDEX "visibility_prompts_org_idx" ON "visibility_prompts" USING btree ("organization_id");