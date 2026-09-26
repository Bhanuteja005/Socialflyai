"use client";

import { cn } from "@socialfly/ui/utils";
import { Clock, Search } from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";
import { focusRing } from "@/components/marketing/primitives";
import { authorInitials, BLOG_CATEGORIES, type BlogPost } from "./data";

function AuthorBadge({ post, size = "sm" }: { post: BlogPost; size?: "sm" | "lg" }) {
	return (
		<div className="flex items-center gap-3">
			<div
				aria-hidden="true"
				className={cn(
					"flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-medium text-foreground",
					size === "lg" ? "size-12 text-sm" : "size-8 text-[10px]",
				)}
			>
				{authorInitials(post.author)}
			</div>
			<div>
				<p className="font-medium text-foreground text-xs font-mono">{post.author}</p>
				{size === "lg" ? (
					<p className="font-mono text-[11px] text-muted-foreground">{post.role}</p>
				) : null}
			</div>
		</div>
	);
}

/** Client-side filter + search over the static post list. */
export function BlogGrid({ featured, posts }: { featured?: BlogPost; posts: BlogPost[] }) {
	const searchId = useId();
	const [category, setCategory] = useState("All");
	const [query, setQuery] = useState("");

	const normalized = query.trim().toLowerCase();
	const visible = posts.filter(
		(post) =>
			(category === "All" || post.category === category) &&
			(post.title.toLowerCase().includes(normalized) ||
				post.description.toLowerCase().includes(normalized)),
	);
	const showFeatured = featured && category === "All" && normalized === "";

	return (
		<>
			<div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
				<fieldset className="-mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 pb-2">
					<legend className="sr-only">Filter by category</legend>
					{BLOG_CATEGORIES.map((item) => (
						<button
							key={item}
							type="button"
							aria-pressed={category === item}
							onClick={() => setCategory(item)}
							className={cn(
								"whitespace-nowrap rounded-full border px-4 py-2 font-medium text-[13px] transition",
								category === item
									? "border-brand bg-brand text-brand-foreground"
									: "border-border bg-surface-raised text-muted-foreground hover:border-border-strong",
								focusRing,
							)}
						>
							{item}
						</button>
					))}
				</fieldset>
				<div className="group flex items-center gap-3 rounded-full border border-border bg-surface-raised px-4 transition focus-within:border-border-strong lg:w-80">
					<Search
						className="size-4 shrink-0 text-subtle-foreground group-focus-within:text-foreground"
						aria-hidden="true"
					/>
					<label htmlFor={searchId} className="sr-only">
						Search articles
					</label>
					<input
						id={searchId}
						type="search"
						placeholder="Search articles..."
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="w-full bg-transparent py-2.5 text-sm text-foreground placeholder:text-subtle-foreground focus:outline-none"
					/>
				</div>
			</div>

			{showFeatured ? (
				<article className="group mb-16 grid overflow-hidden rounded-3xl border border-border bg-surface-raised transition hover:border-border-strong lg:grid-cols-2 lg:rounded-3xl">
					<div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto">
						<Image
							src={featured.image}
							alt=""
							fill
							priority
							sizes="(min-width: 1024px) 50vw, 100vw"
							className="object-cover transition-transform duration-700"
						/>
						<span className="absolute top-6 left-6 rounded-full border border-border-strong bg-surface-raised/90 px-4 py-2 font-mono text-[11px] text-foreground">
							Featured Article
						</span>
					</div>
					<div className="flex flex-col justify-center p-6 sm:p-8 lg:p-16">
						<p className="mb-6 flex items-center gap-4 font-mono text-[11px] text-foreground">
							<span className="rounded-full bg-muted px-2 py-0.5">{featured.category}</span>
							<span className="text-subtle-foreground">{featured.readTime} read</span>
						</p>
						<h2 className="mb-5 font-medium text-2xl text-foreground leading-tight tracking-tight lg:text-4xl">
							{featured.title}
						</h2>
						<p className="mb-8 text-base text-muted-foreground leading-relaxed">
							{featured.description}
						</p>
						<div className="border-border border-t pt-8">
							<AuthorBadge post={featured} size="lg" />
						</div>
					</div>
				</article>
			) : null}

			{visible.length > 0 ? (
				<ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
					{visible.map((post) => (
						<li key={post.id}>
							<article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface-raised transition hover:border-border-strong">
								<div className="relative aspect-[16/10] w-full overflow-hidden bg-surface">
									<Image
										src={post.image}
										alt=""
										fill
										sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
										className="object-cover transition-transform duration-500"
									/>
									<span className="absolute top-4 right-4 rounded-full border border-border bg-surface-raised/90 px-3 py-1 font-mono text-[11px] text-foreground">
										{post.category}
									</span>
								</div>
								<div className="flex flex-1 flex-col p-6 sm:p-8">
									<p className="mb-4 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
										<Clock className="size-3" aria-hidden="true" /> {post.readTime} read
									</p>
									<h3 className="mb-4 font-medium text-foreground text-lg transition-colors group-hover:text-muted-foreground">
										{post.title}
									</h3>
									<p className="mb-8 flex-1 text-sm text-muted-foreground leading-relaxed">
										{post.description}
									</p>
									<div className="border-border border-t pt-6">
										<AuthorBadge post={post} />
									</div>
								</div>
							</article>
						</li>
					))}
				</ul>
			) : (
				<div role="status" className="py-32 text-center">
					<Search className="mx-auto mb-6 size-12 text-subtle-foreground" aria-hidden="true" />
					<p className="mb-2 font-medium text-foreground text-xl">No articles found</p>
					<p className="text-muted-foreground">Try adjusting your search or category filter.</p>
				</div>
			)}
		</>
	);
}
