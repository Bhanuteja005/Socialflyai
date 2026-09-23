import { MessageSquare } from "lucide-react";
import { pageMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";
import { FeedbackForm } from "./feedback-form";

export const metadata = pageMetadata({
	title: "Share Your Feedback",
	description:
		"Your ideas directly influence the SocialflyAI product roadmap. Rate your experience and tell us how SocialflyAI can work better for your brand.",
	path: "/feedback",
});

export default function FeedbackPage() {
	return (
		<PageHero
			badge={{ icon: MessageSquare, label: "Help Us Build Better" }}
			title={
				<>
					Share Your <Accent>Feedback.</Accent>
				</>
			}
			description="Your ideas directly influence our product roadmap. Let us know how SocialflyAI can work better for your brand."
		>
			<div className="mx-auto max-w-3xl">
				<FeedbackForm />
			</div>
		</PageHero>
	);
}
