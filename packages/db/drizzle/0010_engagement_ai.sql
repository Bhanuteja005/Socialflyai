ALTER TYPE "public"."ai_generation_kind" ADD VALUE 'triage';--> statement-breakpoint
ALTER TYPE "public"."ai_generation_kind" ADD VALUE 'reply_draft';--> statement-breakpoint
CREATE INDEX "engagement_items_thread_idx" ON "engagement_items" USING btree ("channel_id","post_external_id");--> statement-breakpoint
CREATE INDEX "engagement_replies_sending_idx" ON "engagement_replies" USING btree ("updated_at") WHERE "engagement_replies"."status" = 'sending';