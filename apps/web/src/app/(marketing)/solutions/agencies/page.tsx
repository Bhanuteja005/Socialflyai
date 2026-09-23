import {
	Briefcase,
	CalendarClock,
	FileText,
	Globe,
	LayoutGrid,
	ShieldCheck,
	Users,
	Zap,
} from "lucide-react";
import { SolutionPage, type SolutionPageData } from "@/components/marketing/company-solution-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { ListMockup, MockupFrame } from "@/components/marketing/mockups";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Social Media Management for Agencies",
	description:
		"Scale your agency without limitations. Manage unlimited clients from one dashboard with white-label reporting, multi-level team roles and AI-powered interaction.",
	path: "/solutions/agencies",
});

const data: SolutionPageData = {
	hero: {
		badge: { icon: Briefcase, label: "Enterprise-Grade Agency Solution" },
		title: (
			<>
				Scale Without <br />
				<Accent>Limitations.</Accent>
			</>
		),
		description:
			"One dashboard, unlimited client success. Empower your agency with white-label reporting, multi-level roles, and AI-powered interaction at global scale.",
		actions: [
			{ label: "Get started for free", href: "/signup" },
			{
				label: "Book a Strategy Call",
				href: "/contact",
				variant: "secondary",
				icon: CalendarClock,
			},
		],
		metrics: [
			{ label: "Client Capacity", value: "Unlimited", note: "Scaling Freedom", icon: Users },
			{ label: "Team Productivity", value: "x5 Efficiency", note: "AI Advantage", icon: Zap },
		],
	},
	features: [
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
				<MockupFrame title="Switching workspace" icon={LayoutGrid}>
					<ListMockup
						rows={[
							{ title: "Client 1", avatar: "C1", subtitle: "Active workspace", status: "Active" },
							{ title: "Client 2", avatar: "C2", subtitle: "12 scheduled posts", tone: "muted" },
							{ title: "Client 3", avatar: "C3", subtitle: "Awaiting approval", tone: "muted" },
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
							{ title: "Monthly Report: Jan 2026", avatar: "PDF", status: "Ready" },
							{ title: "Generating PDF...", avatar: "…", status: "Queued", tone: "muted" },
						]}
					/>
				</MockupFrame>
			),
		},
		{
			title: (
				<>
					Granular Team <br />
					<Accent>&amp; Client Permissions.</Accent>
				</>
			),
			description:
				"Secure your workflow with role-based access control. Assign curators, editors, and managers while giving clients limited 'view-only' access for approval—without risking your settings.",
			stats: [
				{ label: "Role Management", value: "Unlimited", icon: Users },
				{ label: "Client Portals", value: "Infinite", icon: Globe },
				{ label: "Audit Logs", value: "90-Day", icon: ShieldCheck },
				{ label: "Team Sync", value: "Instant", icon: Zap },
			],
		},
	],
	pricing: {
		title: (
			<>
				Invest in <Accent>Growth,</Accent> Not Just Tools
			</>
		),
		description: "Choose the plan that fits your agency's scale and client volume.",
		plans: [
			{
				name: "Scale",
				price: "$149",
				description: "Ideal for boutique agencies and growing social teams.",
				features: [
					"Up to 10 Client Workspaces",
					"Agency Team (5 Members)",
					"Basic White-label Reports",
					"AI Interaction Suite",
					"Email Support",
					"Unified Media Library",
				],
				cta: "Start for free",
			},
			{
				name: "Pro Agency",
				price: "$299",
				description: "Best for high-growth firms and established social agencies.",
				features: [
					"Unlimited Client Workspaces",
					"Agency Team (Unlimited)",
					"Advanced White-label Reports",
					"Granular Team Roles",
					"Priority Support",
					"Brand Voice Management",
					"Custom Approval Flows",
				],
				cta: "Get Pro Access",
				highlight: true,
			},
			{
				name: "Enterprise",
				price: "$599+",
				description: "For global agencies with complex client infrastructures.",
				features: [
					"Everything in Pro",
					"Public Client Portals",
					"Audit Logs & Safety Controls",
					"Dedicated Success Manager",
					"Custom API Development",
					"SLA Support Guarantee",
				],
				cta: "Contact Sales",
			},
		],
	},
	cta: {
		title: (
			<>
				Ready to <Accent>Scale</Accent> Your Agency?
			</>
		),
		description: "Bring every client, teammate and report into one workspace.",
	},
};

export default function AgenciesSolutionPage() {
	return <SolutionPage data={data} />;
}
