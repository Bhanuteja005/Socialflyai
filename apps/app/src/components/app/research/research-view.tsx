"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { Building2, Eye, KeyRound, Swords } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "../page-header";
import { BrandTab } from "./brand-tab";
import { CompetitorsTab } from "./competitors-tab";
import { KeywordsTab } from "./keywords-tab";
import { VisibilityTab } from "./visibility-tab";

const TABS = ["brand", "visibility", "keywords", "competitors"] as const;
type ResearchTab = (typeof TABS)[number];

export function ResearchView() {
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const raw = params.get("tab");
	const tab: ResearchTab = (TABS as readonly string[]).includes(raw ?? "")
		? (raw as ResearchTab)
		: "brand";

	/** Tabs and their options live in the URL so a view can be shared or reloaded. */
	const update = (changes: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) next.delete(k);
			else next.set(k, v);
		}
		router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
	};

	return (
		<>
			<PageHeader
				title="Research"
				description="Understand your brand, how AI assistants talk about it, and what people search for."
			/>
			<Tabs
				value={tab}
				// Each tab's own options (e.g. the visibility period) don't carry over.
				onValueChange={(v) => update({ tab: v === "brand" ? null : v, days: null })}
			>
				<TabsList className="mb-5 max-w-full overflow-x-auto" aria-label="Research sections">
					<TabsTrigger value="brand">
						<Building2 />
						Brand
					</TabsTrigger>
					<TabsTrigger value="visibility">
						<Eye />
						AI visibility
					</TabsTrigger>
					<TabsTrigger value="keywords">
						<KeyRound />
						Keywords
					</TabsTrigger>
					<TabsTrigger value="competitors">
						<Swords />
						Competitors
					</TabsTrigger>
				</TabsList>
				<TabsContent value="brand">
					<BrandTab onOpenTab={(t) => update({ tab: t, days: null })} />
				</TabsContent>
				<TabsContent value="visibility">
					<VisibilityTab
						days={params.get("days") === "90" ? 90 : 30}
						onDays={(d) => update({ days: d === 30 ? null : String(d) })}
					/>
				</TabsContent>
				<TabsContent value="keywords">
					<KeywordsTab />
				</TabsContent>
				<TabsContent value="competitors">
					<CompetitorsTab />
				</TabsContent>
			</Tabs>
		</>
	);
}
