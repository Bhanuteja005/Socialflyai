import { Quote, Sparkles, Star } from "lucide-react";
import Image from "next/image";
import { CtaSection } from "@/components/marketing/cta-section";
import { pageMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Testimonials",
	description:
		"The Wall of Love: real results from the creators, agencies and businesses powering their social media growth with SocialflyAI.",
	path: "/testimonials",
});

type Testimonial = { name: string; role: string; text: string; avatar?: string };

const TESTIMONIALS: Testimonial[] = [
	{
		name: "Alex Rivera",
		role: "Agency Founder",
		text: "SocialflyAI has completely transformed how our agency handles content. We've scaled from 5 to 20 clients without hiring more managers because the AI handles the bulk of the interaction and initial drafts.",
	},
	{
		name: "Sarah Miller",
		role: "Lifestyle Creator",
		text: "The hook generator is scary good. I used to spend hours thinking of the perfect first line for my reels—now I just pick the best one from SocialflyAI and it almost always goes viral.",
		avatar: "/avatars/sarah.png",
	},
	{
		name: "John Doe",
		role: "Social Media Manager",
		text: "Unified analytics across all platforms? Check. Automated replies that actually sound like me? Check. This is the first social tool I've liked in 5 years.",
		avatar: "/avatars/john.png",
	},
	{
		name: "Elena Vance",
		role: "Small Business Owner",
		text: "Consistency was my biggest problem. Now, I spend 30 minutes on Sunday and my entire local Instagram is active for the whole week. It's like having a full-time assistant.",
	},
	{
		name: "Marcus Thorne",
		role: "Head of Marketing",
		text: "White-label reporting is a game-changer for our education clients. The reports look exactly like they came from our house design team but take 0 time to generate.",
	},
	{
		name: "Lila Chen",
		role: "Non-profit Director",
		text: "The impact reporting helps us show donors exactly how their support translates to community engagement. Truly a mission-driven tool.",
	},
];

function initials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

export default function TestimonialsPage() {
	return (
		<>
			<PageHero
				badge={{ icon: Sparkles, label: "Trusted by 5,000+ Brands Worldwide" }}
				title={
					<>
						The <Accent>Wall of Love.</Accent>
					</>
				}
				description="Real results from the creators, agencies, and businesses powering their growth with SocialflyAI."
			>
				<ul className="columns-1 gap-6 space-y-6 text-left md:columns-2 lg:columns-3">
					{TESTIMONIALS.map((testimonial) => (
						<li
							key={testimonial.name}
							className="break-inside-avoid rounded-3xl border border-border bg-surface-raised p-8 transition hover:border-border-strong"
						>
							<figure>
								<div className="mb-4 flex items-center justify-between">
									<div className="flex items-center gap-1" role="img" aria-label="Rated 5 out of 5">
										{[1, 2, 3, 4, 5].map((star) => (
											<Star
												key={star}
												className="size-3 fill-primary text-primary"
												aria-hidden="true"
											/>
										))}
									</div>
									<Quote className="size-8 text-subtle-foreground" aria-hidden="true" />
								</div>
								<blockquote className="mb-6 text-foreground italic leading-relaxed">
									&ldquo;{testimonial.text}&rdquo;
								</blockquote>
								<figcaption className="flex items-center gap-4">
									<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-medium text-foreground text-xs">
										{testimonial.avatar ? (
											<Image
												src={testimonial.avatar}
												alt=""
												width={40}
												height={40}
												className="size-full object-cover"
											/>
										) : (
											<span aria-hidden="true">{initials(testimonial.name)}</span>
										)}
									</div>
									<div>
										<p className="font-medium text-sm text-foreground">{testimonial.name}</p>
										<p className="font-mono text-[11px] text-muted-foreground">
											{testimonial.role}
										</p>
									</div>
								</figcaption>
							</figure>
						</li>
					))}
				</ul>
			</PageHero>
			<CtaSection />
		</>
	);
}
