CREATE TYPE "public"."engagement_kind" AS ENUM('comment', 'reply', 'mention', 'discussion');--> statement-breakpoint
CREATE TYPE "public"."engagement_reply_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'queued', 'sending', 'sent', 'failed', 'unconfirmed');--> statement-breakpoint
CREATE TYPE "public"."engagement_sentiment" AS ENUM('positive', 'neutral', 'negative', 'question');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('new', 'read', 'replied', 'archived', 'spam');--> statement-breakpoint
CREATE TABLE "engagement_cursors" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"comments_since" timestamp with time zone,
	"mentions_since" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" "engagement_kind" NOT NULL,
	"external_id" text NOT NULL,
	"post_target_id" uuid,
	"post_external_id" text,
	"parent_external_id" text,
	"listening_query_id" uuid,
	"author" jsonb NOT NULL,
	"from_self" boolean DEFAULT false NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"url" text,
	"community" text,
	"posted_at" timestamp with time zone NOT NULL,
	"status" "engagement_status" DEFAULT 'new' NOT NULL,
	"relevance" integer,
	"relevance_reason" text,
	"sentiment" "engagement_sentiment",
	"triaged_at" timestamp with time zone,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" "engagement_reply_status" DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'human' NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"external_id" text,
	"external_url" text,
	"error_code" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_queries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"query" text NOT NULL,
	"providers" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reply_approval_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_cursors" ADD CONSTRAINT "engagement_cursors_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_post_target_id_post_targets_id_fk" FOREIGN KEY ("post_target_id") REFERENCES "public"."post_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_replies" ADD CONSTRAINT "engagement_replies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_replies" ADD CONSTRAINT "engagement_replies_item_id_engagement_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."engagement_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_replies" ADD CONSTRAINT "engagement_replies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_replies" ADD CONSTRAINT "engagement_replies_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_queries" ADD CONSTRAINT "listening_queries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_items_channel_ext_uq" ON "engagement_items" USING btree ("channel_id","external_id");--> statement-breakpoint
CREATE INDEX "engagement_items_inbox_idx" ON "engagement_items" USING btree ("organization_id","status","posted_at");--> statement-breakpoint
CREATE INDEX "engagement_items_untriaged_idx" ON "engagement_items" USING btree ("organization_id","created_at") WHERE "engagement_items"."triaged_at" is null and "engagement_items"."from_self" = false;--> statement-breakpoint
CREATE INDEX "engagement_replies_item_idx" ON "engagement_replies" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "engagement_replies_queue_idx" ON "engagement_replies" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "listening_queries_org_idx" ON "listening_queries" USING btree ("organization_id");