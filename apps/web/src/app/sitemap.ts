import { webEnv } from "@socialfly/config/web";
import type { MetadataRoute } from "next";
import { FREE_TOOLS } from "@/components/marketing/free-tools/tools";
import {
	COMPETITOR_LINKS,
	FEATURE_LINKS,
	SOLUTION_LINKS,
} from "@/components/marketing/site-config";

type Entry = MetadataRoute.Sitemap[number];

const STATIC_PAGES: {
	path: string;
	priority: number;
	changeFrequency: Entry["changeFrequency"];
}[] = [
	{ path: "/", priority: 1, changeFrequency: "weekly" },
	{ path: "/features", priority: 0.9, changeFrequency: "monthly" },
	{ path: "/free-tools", priority: 0.8, changeFrequency: "monthly" },
	{ path: "/blog", priority: 0.7, changeFrequency: "weekly" },
	{ path: "/about", priority: 0.6, changeFrequency: "monthly" },
	{ path: "/contact", priority: 0.6, changeFrequency: "yearly" },
	{ path: "/faq", priority: 0.6, changeFrequency: "monthly" },
	{ path: "/testimonials", priority: 0.5, changeFrequency: "monthly" },
	{ path: "/feedback", priority: 0.3, changeFrequency: "yearly" },
	{ path: "/privacy-policy", priority: 0.3, changeFrequency: "yearly" },
	{ path: "/terms-and-conditions", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
	const base = webEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
	const lastModified = new Date();
	const entry = (
		path: string,
		priority: number,
		changeFrequency: Entry["changeFrequency"],
	): Entry => ({
		url: `${base}${path === "/" ? "" : path}`,
		lastModified,
		changeFrequency,
		priority,
	});

	return [
		...STATIC_PAGES.map((page) => entry(page.path, page.priority, page.changeFrequency)),
		...FEATURE_LINKS.map((link) => entry(link.href, 0.8, "monthly")),
		...SOLUTION_LINKS.map((link) => entry(link.href, 0.8, "monthly")),
		...COMPETITOR_LINKS.map((link) => entry(link.href, 0.7, "monthly")),
		...FREE_TOOLS.map((tool) =>
			entry(`/free-tools/${tool.slug}`, tool.status === "live" ? 0.7 : 0.5, "monthly"),
		),
	];
}
