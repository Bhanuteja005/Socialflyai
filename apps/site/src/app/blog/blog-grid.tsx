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
					"flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 font-bold text-white",
					size === "lg" ? "size-12 text-sm" : "size-8 text-[10px]",
				)}
			>
				{authorInitials(post.author)}
			</div>
			<div>
				<p className="font-bold text-white text-xs uppercase tracking-wider">{post.author}</p>
				{size === "lg" ? (
					<p className="font-bold text-[10px] text-white/50 uppercase tracking-widest">
						{post.role}
					</p>
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
								"whitespace-nowrap rounded-full border px-6 py-2.5 font-bold text-xs transition",
								category === item
									? "border-primary bg-primary text-black"
									: "border-white/10 bg-white/5 text-white/60 hover:border-white/20",
								focusRing,
							)}
						>
							{item}
						</button>
					))}
				</fieldset>
				<div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-primary/40 lg:w-80">
					<Search
						className="size-4 shrink-0 text-white/40 group-focus-within:text-primary"
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
						className="w-full bg-transparent py-4 text-sm text-white placeholder:text-white/40 focus:outline-none"
					/>
				</div>
			</div>

			{showFeatured ? (
				<article className="group mb-16 grid overflow-hidden rounded-[32px] border border-white/10 bg-white/5 transition hover:border-primary/40 lg:grid-cols-2 lg:rounded-[40px]">
					<div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto">
						<Image
							src={featured.image}
							alt=""
							fill
							priority
							sizes="(min-width: 1024px) 50vw, 100vw"
							className="object-cover transition-transform duration-700 group-hover:scale-105"
						/>
						<span className="absolute top-6 left-6 rounded-full border border-primary/20 bg-black/60 px-4 py-2 font-black text-[10px] text-primary uppercase tracking-widest backdrop-blur-md">
							Featured Article
						</span>
					</div>
					<div className="flex flex-col justify-center p-6 sm:p-8 lg:p-16">
						<p className="mb-6 flex items-center gap-4 font-black text-[10px] text-primary uppercase tracking-widest">
							<span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5">
								{featured.category}
							</span>
							<span className="text-white/40">{featured.readTime} read</span>
						</p>
						<h2 className="mb-6 font-bold text-3xl text-white leading-tight lg:text-5xl">
							{featured.title}
						</h2>
						<p className="mb-10 text-lg text-white/60 leading-relaxed">{featured.description}</p>
						<div className="border-white/5 border-t pt-8">
							<AuthorBadge post={featured} size="lg" />
						</div>
					</div>
				</article>
			) : null}

			{visible.length > 0 ? (
				<ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
					{visible.map((post) => (
						<li key={post.id}>
							<article className="group flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-2xl transition hover:border-primary/40">
								<div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0A0A0A]">
									<Image
										src={post.image}
										alt=""
										fill
										sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
										className="object-cover transition-transform duration-500 group-hover:scale-110"
									/>
									<span className="absolute top-4 right-4 rounded-full border border-white/10 bg-black/40 px-3 py-1 font-black text-[10px] text-white uppercase tracking-widest backdrop-blur-md">
										{post.category}
									</span>
								</div>
								<div className="flex flex-1 flex-col p-6 sm:p-8">
									<p className="mb-4 flex items-center gap-1.5 font-black text-[10px] text-white/50 uppercase tracking-widest">
										<Clock className="size-3 text-primary" aria-hidden="true" /> {post.readTime}{" "}
										read
									</p>
									<h3 className="mb-4 font-bold text-white text-xl transition-colors group-hover:text-primary">
										{post.title}
									</h3>
									<p className="mb-8 flex-1 text-sm text-white/60 leading-relaxed">
										{post.description}
									</p>
									<div className="border-white/5 border-t pt-6">
										<AuthorBadge post={post} />
									</div>
								</div>
							</article>
						</li>
					))}
				</ul>
			) : (
				<div role="status" className="py-32 text-center">
					<Search className="mx-auto mb-6 size-12 text-white/10" aria-hidden="true" />
					<p className="mb-2 font-bold text-white text-xl">No articles found</p>
					<p className="text-white/50">Try adjusting your search or category filter.</p>
				</div>
			)}
		</>
	);
}
