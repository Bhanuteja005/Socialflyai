import { CircleCheck, ExternalLink, Info, Link as LinkIcon, ShieldCheck, Star } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolFeatureGrid, ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { UtmGenerator } from "@/components/marketing/free-tools/utm-generator";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free UTM Generator — Campaign URL Builder",
	description:
		"Create custom tracking URLs with UTM parameters for your marketing campaigns in seconds. Free UTM builder for Google Analytics: source, medium, campaign, term and content.",
	path: "/free-tools/utm-generator",
	keywords: ["utm generator", "utm builder", "campaign url builder", "google analytics utm"],
});

const PARAMETERS = [
	{
		title: "UTM Source (utm_source)",
		description:
			"Identifies which site sent the traffic (e.g. google, facebook, newsletter). It is Required.",
		example: "google, newsletter, facebook",
	},
	{
		title: "UTM Medium (utm_medium)",
		description:
			"Identifies what type of link was used, such as cost-per-click (CPC), email, or social media post.",
		example: "cpc, email, social, banner",
	},
	{
		title: "UTM Campaign (utm_campaign)",
		description:
			"Identifies a specific product promotion or strategic campaign (e.g. product_launch, summer_sale).",
		example: "spring_sale, product_launch, black_friday",
	},
	{
		title: "UTM Content (utm_content)",
		description:
			"Identifies what specifically was clicked to bring the user to the site, such as a specific banner ad or a text link.",
		example: "logolink, textlink",
	},
	{
		title: "UTM Term (utm_term)",
		description:
			"Identifies search terms used to reach your page. This is primarily used for Google Ads search campaigns.",
		example: "running_shoes, crm_software",
	},
];

const PRACTICES = [
	{
		icon: CircleCheck,
		title: "Be Consistent with Naming",
		description:
			"Use a standard naming convention for your UTM parameters across all social media. For example, always use 'facebook' instead of switching with 'fb' and 'Facebook'.",
	},
	{
		icon: Info,
		title: "Use Lowercase",
		description:
			"UTM parameters are case sensitive. Using all lowercase tags ensures your data is not split into different categories in your Analytics.",
	},
	{
		icon: ShieldCheck,
		title: "Avoid Spaces",
		description:
			"Use underscores or hyphens instead of spaces in your UTM names (e.g. my_newsletter instead of 'my newsletter').",
	},
	{
		icon: ExternalLink,
		title: "Keep it Simple",
		description:
			"Keep your UTM parameters descriptive but concise. Long URLs can break in some email clients or messaging apps.",
	},
	{
		icon: Star,
		title: "Document Your Strategy",
		description:
			"Create a document that outlines your UTM naming conventions to ensure consistency across your team and campaigns.",
	},
];

const FAQ = [
	{
		question: "Which UTM parameters are required?",
		answer:
			"Google Analytics needs utm_source, utm_medium and utm_campaign to attribute traffic reliably. utm_term and utm_content are optional and mostly used for paid search and A/B tests.",
	},
	{
		question: "Do UTM parameters affect SEO?",
		answer:
			"No. UTM tags only add tracking information to the URL. Use them on links you share in campaigns, not on internal links within your own site.",
	},
	{
		question: "Is the UTM generator free?",
		answer:
			"Yes. The SocialFly AI UTM generator is 100% free, needs no signup and runs entirely in your browser.",
	},
];

export default function UtmGeneratorPage() {
	return (
		<>
			<ToolHero
				badge="Campaign tracking"
				badgeIcon={LinkIcon}
				title={
					<>
						Free <Accent>UTM Generator</Accent> Tool
					</>
				}
				description="Create custom tracking URLs with UTM parameters for your marketing campaigns in seconds. Track and measure your campaign performance with precision."
			>
				<UtmGenerator />
			</ToolHero>
			<ToolPromo />
			<ToolGuide
				title="What Are UTM Parameters?"
				description="UTM parameters are tags added to a URL that help you track the effectiveness of your marketing campaigns across traffic sources and publishing media."
				items={PARAMETERS}
				numbered={false}
			/>
			<ToolFeatureGrid title="UTM Tracking Best Practices" items={PRACTICES} />
			<FaqSection title="UTM Generator FAQ" items={FAQ} />
		</>
	);
}
