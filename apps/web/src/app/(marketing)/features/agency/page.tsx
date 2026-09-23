import { Briefcase, FileText, Globe, ShieldCheck, Users, Zap } from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { ListMockup, MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "Agency Social Media Management Software",
	description:
		"Scale your agency with AI. Manage unlimited clients from one dashboard with white-label reporting, granular team permissions and client approval flows.",
	path: "/features/agency",
});

export default function AgencyFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: Briefcase, label: "Enterprise-Grade Social Management" }}
				title={
					<>
						Scale Your <Accent>Agency</Accent> <br />
						With AI Intelligence
					</>
				}
				description="One dashboard, unlimited clients. Empower your team with white-label reporting, custom permissions, and AI-powered interaction at scale."
				actions={[
					{ label: "Get started for free", href: "/signup" },
					{ label: "Upgrade to Agency", href: "/signup", variant: "secondary", icon: Zap },
				]}
			>
				<MockupFrame title="Team Permissions" icon={ShieldCheck}>
					<ListMockup
						rows={[
							{ title: "Sarah Miller", subtitle: "Editor", status: "Active", avatar: "SM" },
							{ title: "John Doe", subtitle: "Manager", status: "Active", avatar: "JD" },
							{
								title: "Client X",
								subtitle: "Viewer",
								status: "Pending",
								tone: "warning",
								avatar: "CX",
							},
						]}
					/>
				</MockupFrame>
			</PageHero>

			<FeatureSplitSection
				heading={<h2 className="sr-only">Agency features</h2>}
				items={[
					{
						title: (
							<>
								One Dashboard, <br />
								<Accent>Unlimited Clients.</Accent>
							</>
						),
						description:
							"Stop juggling dozens of logins. SocialflyAI allows you to manage all your clients' social profiles from a single, high-performance workspace. Scale your agency without ever losing context.",
						bullets: [
							"Isolated client workspaces",
							"One-click client reporting",
							"Centralized media libraries",
							"Mass-posting across account clusters",
						],
						visual: (
							<MockupFrame title="Switching workspace…" icon={Briefcase}>
								<ListMockup
									rows={[
										{ title: "Client 1", subtitle: "Active workspace", status: "Live" },
										{ title: "Client 2", subtitle: "12 scheduled posts", tone: "muted" },
										{ title: "Client 3", subtitle: "Awaiting approval", tone: "muted" },
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Your Brand, <br />
								<Accent>Our Intelligence.</Accent>
							</>
						),
						description:
							"Impress your clients with premium, white-labeled performance reports. Set up automated weekly or monthly deliveries that use your agency's logo and branding—powered by SocialflyAI insights.",
						chips: [
							{ icon: FileText, label: "Custom Logo Placement" },
							{ icon: Globe, label: "Public Report Links" },
						],
						visual: (
							<MockupFrame title="Agency Name" icon={FileText}>
								<ListMockup
									rows={[
										{ title: "Monthly Report: Jan 2026", subtitle: "Delivered", status: "Sent" },
										{
											title: "Generating PDF…",
											subtitle: "Weekly digest",
											status: "Queued",
											tone: "muted",
										},
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Granular Team <br />
								<Accent>& Client Permissions.</Accent>
							</>
						),
						description:
							"Secure your workflow with role-based access control. Assign curators, editors, and managers while giving clients limited 'view-only' access for approval—without risking your settings.",
						stats: [
							{ icon: Users, label: "Role Management", value: "Unlimited" },
							{ icon: Globe, label: "Client Portals", value: "Infinite" },
							{ icon: ShieldCheck, label: "Audit Logs", value: "90-Day" },
							{ icon: Zap, label: "Team Sync", value: "Instant" },
						],
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="Agency Features"
				pricingDescription="Every viral post starts with a single high-quality measurement. Choose the plan that's right for your volume."
				plans={plans}
				columns={["Starter", "Pro Agency", "Enterprise"]}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI Agency features."
				faqs={faqs}
			/>
		</>
	);
}
