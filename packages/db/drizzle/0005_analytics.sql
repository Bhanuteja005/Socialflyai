CREATE TABLE "channel_metrics_daily" (
	"channel_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"followers" integer,
	"impressions" integer,
	"reach" integer,
	"profile_views" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_metrics_daily_channel_id_day_pk" PRIMARY KEY("channel_id","day")
);
--> statement-breakpoint
CREATE TABLE "post_target_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"impressions" integer,
	"reach" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"saves" integer,
	"clicks" integer,
	"video_views" integer
);
--> statement-breakpoint
ALTER TABLE "channel_metrics_daily" ADD CONSTRAINT "channel_metrics_daily_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_metrics_daily" ADD CONSTRAINT "channel_metrics_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_target_metrics" ADD CONSTRAINT "post_target_metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_target_metrics" ADD CONSTRAINT "post_target_metrics_target_id_post_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."post_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_metrics_daily_org_idx" ON "channel_metrics_daily" USING btree ("organization_id","day");--> statement-breakpoint
CREATE INDEX "post_target_metrics_target_idx" ON "post_target_metrics" USING btree ("target_id","captured_at");--> statement-breakpoint
CREATE INDEX "post_target_metrics_org_idx" ON "post_target_metrics" USING btree ("organization_id","captured_at");