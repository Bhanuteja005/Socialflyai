"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { Clapperboard, Eye, GalleryHorizontal, ImageIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAiCapabilities } from "@/hooks/use-ai";
import type { AiCapabilities } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { AiUsage } from "../ai/ai-shared";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { CarouselStudio } from "./carousel-studio";
import { ImageStudio } from "./image-studio";
import { RecentGenerations } from "./recent-generations";
import { VideoStudio } from "./video-studio";

type CreateTab = "image" | "carousel" | "video";

const TOOLS: {
	value: CreateTab;
	label: string;
	description: string;
	icon: typeof ImageIcon;
	/** Without the model the studio still works by hand (or not at all, for images). */
	available: (caps: AiCapabilities) => boolean;
}[] = [
	{
		value: "image",
		label: "Image",
		description: "Turn a prompt into a picture in any aspect ratio.",
		icon: ImageIcon,
		available: (c) => c.images,
	},
	{
		value: "carousel",
		label: "Carousel",
		description: "Outline slides and render a branded, swipeable set.",
		icon: GalleryHorizontal,
		available: (c) => c.text,
	},
	{
		value: "video",
		label: "Video",
		description: "Script scenes and render a short vertical video.",
		icon: Clapperboard,
		available: (c) => c.text,
	},
];
const TABS: readonly string[] = ["image", "carousel", "video"];

/**
 * `/create?tab=carousel|video&topic=…` opens a studio with its topic filled in —
 * the hand-off from a Research content idea. Read once; the studios own it after.
 */
function useHandOff() {
	const params = useSearchParams();
	const tab = params.get("tab");
	const topic = params.get("topic")?.slice(0, 500) ?? "";
	return {
		tab: (tab && TABS.includes(tab) ? tab : "image") as CreateTab,
		topic: tab === "carousel" || tab === "video" ? topic : "",
	};
}

export function CreateView() {
	const { can } = useOrg();
	const caps = useAiCapabilities();
	const handOff = useHandOff();
	const [tab, setTab] = useState<CreateTab>(handOff.tab);

	return (
		<div className="grid gap-6">
			<PageHeader
				className="mb-0"
				title="AI Studio"
				description="Images, carousels and short videos for your posts."
				actions={<AiUsage className="min-w-52" />}
			/>

			{!can("editor") ? (
				<EmptyState
					icon={Eye}
					title="You have view-only access"
					description="Ask an admin to make you an editor to generate images, carousels and videos."
				/>
			) : caps.isPending ? (
				<div className="grid gap-4">
					<div className="grid gap-3 sm:grid-cols-3">
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
					</div>
					<Skeleton className="h-96" />
				</div>
			) : caps.isError ? (
				<EmptyState
					title="Couldn't load AI features"
					description={errorMessage(caps.error)}
					action={
						<Button variant="outline" onClick={() => caps.refetch()}>
							Retry
						</Button>
					}
				/>
			) : (
				<Tabs value={tab} onValueChange={(v) => setTab(v as CreateTab)} className="grid gap-6">
					<TabsList
						aria-label="What to create"
						className="grid h-auto grid-cols-1 items-stretch gap-3 overflow-visible border-0 bg-transparent p-0 sm:grid-cols-3"
					>
						{TOOLS.map((tool) => {
							const available = tool.available(caps.data);
							return (
								<TabsTrigger
									key={tool.value}
									value={tool.value}
									className="group h-auto items-start justify-start gap-3 whitespace-normal rounded-2xl border border-border bg-surface-raised p-4 text-left transition-[border-color,box-shadow] hover:border-border-strong data-[state=active]:border-foreground data-[state=active]:bg-surface-raised data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-foreground [&_svg]:size-4"
								>
									<span
										className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground group-data-[state=active]:bg-ink group-data-[state=active]:text-ink-foreground"
										aria-hidden="true"
									>
										<tool.icon />
									</span>
									<span className="grid min-w-0 flex-1 gap-0.5">
										<span className="flex items-center gap-2 font-medium text-foreground text-sm">
											{tool.label}
											{available ? null : (
												<span className="rounded-full bg-muted px-2 py-px font-medium text-[11px] text-muted-foreground">
													{tool.value === "image" ? "Needs setup" : "Manual"}
												</span>
											)}
										</span>
										<span className="font-normal text-muted-foreground text-xs leading-snug">
											{tool.description}
										</span>
									</span>
								</TabsTrigger>
							);
						})}
					</TabsList>
					{/* Kept mounted so switching tabs doesn't lose a generation in progress. */}
					<TabsContent value="image" forceMount className="data-[state=inactive]:hidden">
						<ImageStudio caps={caps.data} />
					</TabsContent>
					<TabsContent value="carousel" forceMount className="data-[state=inactive]:hidden">
						<CarouselStudio
							caps={caps.data}
							initialTopic={handOff.tab === "carousel" ? handOff.topic : undefined}
						/>
					</TabsContent>
					<TabsContent value="video" forceMount className="data-[state=inactive]:hidden">
						<VideoStudio
							caps={caps.data}
							initialTopic={handOff.tab === "video" ? handOff.topic : undefined}
						/>
					</TabsContent>
				</Tabs>
			)}

			<RecentGenerations />
		</div>
	);
}
