import { Card, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import {
	Clapperboard,
	GalleryHorizontal,
	ImageIcon,
	type LucideIcon,
	PenSquare,
} from "lucide-react";
import Link from "next/link";

const SHORTCUTS: { href: string; label: string; body: string; icon: LucideIcon }[] = [
	{ href: "/compose", label: "Write a post", body: "Draft with AI assist", icon: PenSquare },
	{ href: "/create?tab=image", label: "Image", body: "Generate a visual", icon: ImageIcon },
	{
		href: "/create?tab=carousel",
		label: "Carousel",
		body: "Slides from an idea",
		icon: GalleryHorizontal,
	},
	{ href: "/create?tab=video", label: "Short video", body: "Reels and Shorts", icon: Clapperboard },
];

/** Quick ways into the composer and AI Studio from the home page. */
export function CreateShortcuts() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Create</CardTitle>
			</CardHeader>
			<div className="grid grid-cols-2 gap-2 p-5 pt-4">
				{SHORTCUTS.map((s) => {
					const Icon = s.icon;
					return (
						<Link
							key={s.href}
							href={s.href}
							className="group grid gap-2 rounded-xl border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
						>
							<span className="flex size-8 items-center justify-center rounded-full bg-muted text-foreground">
								<Icon className="size-4" aria-hidden="true" />
							</span>
							<span className="grid">
								<span className="font-medium text-[13px]">{s.label}</span>
								<span className="text-muted-foreground text-xs">{s.body}</span>
							</span>
						</Link>
					);
				})}
			</div>
		</Card>
	);
}
