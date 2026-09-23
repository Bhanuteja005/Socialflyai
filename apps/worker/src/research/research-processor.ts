import type { ResearchJob } from "@socialfly/queue";
import { ResearchCrawl } from "./crawl.ts";
import type { ResearchDeps } from "./deps.ts";
import { SeoRefresh } from "./seo.ts";
import { VisibilityChecks } from "./visibility.ts";

/** Routes a research-queue job to its processor. */
export class ResearchProcessor {
	readonly crawl: ResearchCrawl;
	readonly visibility: VisibilityChecks;
	readonly seo: SeoRefresh;

	constructor(deps: ResearchDeps) {
		this.crawl = new ResearchCrawl(deps);
		this.visibility = new VisibilityChecks(deps);
		this.seo = new SeoRefresh(deps);
	}

	async run(job: ResearchJob, attempt: { attemptsMade: number; maxAttempts: number }) {
		switch (job.task) {
			case "crawl":
				return this.crawl.run(job.runId, attempt);
			case "visibility-plan":
				return this.visibility.plan();
			case "visibility-org":
				return this.visibility.runForOrg(job.organizationId, { force: job.force ?? false });
			case "seo-plan":
				return this.seo.plan();
			case "seo-refresh":
				return this.seo.runForOrg(job.organizationId);
		}
	}
}
