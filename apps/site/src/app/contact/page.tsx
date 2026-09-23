import { Mail, MapPin, MessageSquare } from "lucide-react";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent, Container, Glow, headingDisplay } from "@/components/marketing/primitives";
import { ContactForm } from "./contact-form";

export const metadata = pageMetadata({
	title: "Contact Us",
	description:
		"Questions about your plan, collaboration ideas, or the future of AI social media? Contact the SocialflyAI team for support and enterprise enquiries.",
	path: "/contact",
});

const CONTACTS = [
	{
		label: "General Support",
		value: "support@socialflyai.com",
		href: "mailto:support@socialflyai.com",
		icon: Mail,
	},
	{
		label: "Enterprise",
		value: "enterprise@socialflyai.com",
		href: "mailto:enterprise@socialflyai.com",
		icon: MessageSquare,
	},
	{
		label: "Office",
		value: "5th Floor, Shanta Sriram Building, PSR Prime Towers Rd, Gachibowli, Hyderabad, 500032",
		icon: MapPin,
	},
];

export default function ContactPage() {
	return (
		<section className="relative overflow-hidden pt-32 pb-16 lg:pt-44 lg:pb-24">
			<Glow />
			<Container className="relative">
				<div className="grid grid-cols-1 items-start gap-12 md:grid-cols-2 lg:gap-16">
					<div>
						<h1 className={`${headingDisplay} lg:text-7xl`}>
							Let&apos;s <Accent>Connect.</Accent>
						</h1>
						<p className="mt-8 max-w-md text-lg text-white/60 leading-8">
							Questions about your plan? Collaboration ideas? Or just want to talk about the future
							of AI social media? Reach out below.
						</p>

						<address className="mt-12 space-y-8 not-italic">
							{CONTACTS.map(({ label, value, href, icon: Icon }) => (
								<div key={label} className="flex items-start gap-4">
									<div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
										<Icon className="size-5 text-primary" aria-hidden="true" />
									</div>
									<div className="min-w-0">
										<p className="font-bold text-[10px] text-white/50 uppercase tracking-widest">
											{label}
										</p>
										{href ? (
											<a
												href={href}
												className="break-words font-bold text-lg text-white hover:text-primary"
											>
												{value}
											</a>
										) : (
											<p className="font-bold text-lg text-white">{value}</p>
										)}
									</div>
								</div>
							))}
						</address>
					</div>

					<div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md sm:p-8">
						<h2 className="sr-only">Send us a message</h2>
						<ContactForm />
					</div>
				</div>
			</Container>
		</section>
	);
}
