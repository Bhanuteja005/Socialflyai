import { TrendingUp, Zap } from "lucide-react";
import { pageMetadata } from "@/components/marketing/metadata";
import {
	Accent,
	Container,
	headingDisplay,
	headingSection,
	PixelField,
} from "@/components/marketing/primitives";
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
			<PixelField />
			<Container className="relative">
				<header className="mb-12 max-w-2xl">
					<p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 font-mono text-muted-foreground text-xs">
						<TrendingUp className="size-3" aria-hidden="true" />
						Latest Insights
					</p>
					<h1 className={headingDisplay}>
						Socialfly <Accent>Insights.</Accent>
					</h1>
					<p className="mt-5 text-base text-muted-foreground leading-relaxed sm:text-lg">
						Expert strategies, AI breakthroughs, and brand growth tactics delivered to your
						dashboard daily.
					</p>
				</header>

				<BlogGrid featured={featured} posts={posts} />

				<div className="relative mt-32 overflow-hidden rounded-3xl border border-border bg-surface-raised p-8 text-center sm:p-10 lg:mt-40 lg:p-16">
					<Zap className="mx-auto mb-6 size-6 text-foreground" aria-hidden="true" />
					<h2 className={`mb-4 ${headingSection}`}>Master Social ROI</h2>
					<p className="mx-auto mb-8 max-w-xl text-base text-muted-foreground">
						Join 50,000+ creators and brands receiving our weekly strategy teardowns, AI tool
						updates, and industry insights.
					</p>
					<NewsletterForm />
					<p className="mt-5 font-mono text-subtle-foreground text-xs">
						No Spam. Just Alpha. Unsubscribe at any time.
					</p>
				</div>
			</Container>
		</section>
	);
}
