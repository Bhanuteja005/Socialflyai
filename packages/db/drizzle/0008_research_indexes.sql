DROP INDEX "competitors_org_name_uq";--> statement-breakpoint
CREATE INDEX "research_runs_active_idx" ON "research_runs" USING btree ("organization_id","created_at") WHERE "research_runs"."status" in ('pending', 'crawling', 'analyzing');--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_org_name_uq" ON "competitors" USING btree ("organization_id",lower("name"));