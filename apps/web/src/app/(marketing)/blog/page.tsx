import { TrendingUp, Zap } from "lucide-react";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent, Container, headingDisplay } from "@/components/marketing/primitives";
import { BlogGrid } from "./blog-grid";
import { BLOG_POSTS } from "./data";
import { NewsletterForm } from "./newsletter-form";

export const metadata = pageMetadata({
	title: "Blog — Socialfly Insights",
	description:
		"Expert social media strategies, AI breakthroughs and brand growth tactics from the SocialflyAI team: viral hooks, autonomous engagement, agency scaling and product updates.",
	path: "/blog",
});

export default function BlogPage() {
	const featured = BLOG_POSTS.find((post) => post.featured);
	const posts = BLOG_POSTS.filter((post) => !post.featured);

	return (
		<section className="relative overflow-hidden pt-32 pb-20 lg:pt-44 lg:pb-28">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-0 left-1/2 h-[800px] w-full -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_50%_20%,#0BE27D_0%,transparent_70%)] opacity-10 blur-[150px]"
			/>
			<Container className="relative">
				<header className="mb-12 max-w-2xl">
					<p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-black text-[10px] text-primary uppercase tracking-widest">
						<TrendingUp className="size-3" aria-hidden="true" />
						Latest Insights
					</p>
					<h1 className={`${headingDisplay} lg:text-7xl`}>
						Socialfly <Accent>Insights.</Accent>
					</h1>
					<p className="mt-6 text-lg text-white/60 leading-relaxed">
						Expert strategies, AI breakthroughs, and brand growth tactics delivered to your
						dashboard daily.
					</p>
				</header>

				<BlogGrid featured={featured} posts={posts} />

				<div className="relative mt-32 overflow-hidden rounded-[32px] border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-10 lg:mt-40 lg:rounded-[40px] lg:p-20">
					<div
						aria-hidden="true"
						className="absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
					/>
					<Zap className="mx-auto mb-8 size-12 text-primary" aria-hidden="true" />
					<h2 className="mb-6 font-bold text-3xl text-white lg:text-5xl">Master Social ROI</h2>
					<p className="mx-auto mb-10 max-w-xl text-lg text-white/60">
						Join 50,000+ creators and brands receiving our weekly strategy teardowns, AI tool
						updates, and industry insights.
					</p>
					<NewsletterForm />
					<p className="mt-6 font-black text-[10px] text-white/40 uppercase tracking-widest">
						No Spam. Just Alpha. Unsubscribe at any time.
					</p>
				</div>
			</Container>
		</section>
	);
}
