"use client";

import { Eye, GalleryHorizontal, ImageIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAiCapabilities } from "@/hooks/use-ai";
import { errorMessage } from "@/lib/errors";
import { AiUsage } from "../ai/ai-shared";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { CarouselStudio } from "./carousel-studio";
import { ImageStudio } from "./image-studio";
import { RecentGenerations } from "./recent-generations";

type CreateTab = "image" | "carousel";

export function CreateView() {
	const { can } = useOrg();
	const caps = useAiCapabilities();
	const [tab, setTab] = useState<CreateTab>("image");

	return (
		<div className="grid gap-6">
			<PageHeader
				className="mb-0"
				title="Create"
				description="Generate images and carousels, then drop them into a post."
				actions={<AiUsage className="min-w-52" />}
			/>

			{!can("editor") ? (
				<EmptyState
					icon={Eye}
					title="You have view-only access"
					description="Ask an admin to make you an editor to generate images and carousels."
				/>
			) : caps.isPending ? (
				<div className="grid gap-4">
					<Skeleton className="h-8 w-48" />
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
				<Tabs value={tab} onValueChange={(v) => setTab(v as CreateTab)} className="grid gap-4">
					<TabsList aria-label="What to create" className="justify-self-start">
						<TabsTrigger value="image">
							<ImageIcon />
							Image
						</TabsTrigger>
						<TabsTrigger value="carousel">
							<GalleryHorizontal />
							Carousel
						</TabsTrigger>
					</TabsList>
					{/* Kept mounted so switching tabs doesn't lose a generation in progress. */}
					<TabsContent value="image" forceMount className="data-[state=inactive]:hidden">
						<ImageStudio caps={caps.data} />
					</TabsContent>
					<TabsContent value="carousel" forceMount className="data-[state=inactive]:hidden">
						<CarouselStudio caps={caps.data} />
					</TabsContent>
				</Tabs>
			)}

			<RecentGenerations />
		</div>
	);
}
