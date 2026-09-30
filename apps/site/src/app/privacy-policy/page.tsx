import {
	LegalLink,
	LegalList,
	LegalPage,
	type LegalSection,
} from "@/components/marketing/company-legal";
import { pageMetadata } from "@/components/marketing/metadata";

export const metadata = pageMetadata({
	title: "Privacy Policy",
	description:
		"How SocialflyAI collects, uses and protects your data, including integrations with Google (YouTube), Meta, LinkedIn, Pinterest and other supported platforms.",
	path: "/privacy-policy",
});

const note = "text-xs italic text-subtle-foreground";
const emphasis = "font-medium italic text-brand-text";
const subheading = "mb-2 font-medium text-base text-foreground";
const support = (
	<LegalLink href="mailto:support@socialflyai.com">support@socialflyai.com</LegalLink>
);

const SECTIONS: LegalSection[] = [
	{
		id: 1,
		title: "Information We Collect",
		content: (
			<div className="space-y-5">
				<div>
					<h3 className={subheading}>Account Information</h3>
					<p>We collect basic account data such as email address and authentication credentials.</p>
				</div>
				<div>
					<h3 className={subheading}>Social Media Data</h3>
					<p className="mb-3">
						When you connect third-party social media accounts (e.g., YouTube, Facebook, Instagram,
						LinkedIn, Pinterest), we may access and process limited data via official APIs,
						including:
					</p>
					<LegalList
						items={[
							"Account identifiers (e.g., channel ID, page ID, profile ID)",
							"Content data (e.g., posts, videos, captions)",
							"Engagement metrics (e.g., likes, comments, views, impressions)",
							"Access tokens required for authentication",
						]}
					/>
					<p className={`mt-3 ${note}`}>
						We only access the minimum data necessary to provide our services and do not access
						private personal data beyond what is required.
					</p>
				</div>
				<div>
					<h3 className={subheading}>Usage Data</h3>
					<p>
						We collect limited usage data such as login activity and feature usage to improve the
						Service.
					</p>
				</div>
			</div>
		),
	},
	{
		id: 2,
		title: "How We Use Information",
		content: (
			<div>
				<p className="mb-4">We use collected data to:</p>
				<LegalList
					items={[
						"Connect and manage user social media accounts",
						"Publish, schedule, and manage content across platforms",
						"Upload videos and posts (e.g., to YouTube or other platforms)",
						"Display analytics and performance insights",
						"Maintain, secure, and improve platform functionality",
					]}
				/>
				<p className={`mt-5 ${emphasis}`}>
					We do not use user data for advertising, profiling, or resale.
				</p>
			</div>
		),
	},
	{
		id: 3,
		title: "Google API Data Usage (YouTube)",
		highlight: true,
		content: (
			<div>
				<p className="mb-4">
					SocialflyAI uses Google APIs, including the YouTube Data API, to allow users to connect
					their YouTube accounts and manage or publish content.
				</p>
				<p className="mb-4 font-medium text-foreground">
					By using SocialFlyAI, you agree to be bound by the{" "}
					<LegalLink href="https://www.youtube.com/t/terms">YouTube Terms of Service</LegalLink>.
				</p>
				<LegalList
					className="mb-5"
					items={[
						"We only request access to the minimum necessary permissions (scopes) required for functionality",
						"We do not use Google user data for advertising or marketing purposes",
						"We do not sell or transfer Google user data to third parties",
					]}
				/>
				<p className="mb-5">
					Our use of information received from Google APIs adheres to the{" "}
					<LegalLink href="https://developers.google.com/terms/api-services-user-data-policy">
						Google API Services User Data Policy
					</LegalLink>
					, including the Limited Use requirements.
				</p>
				<div className="space-y-3 border-border border-t pt-5">
					<h3 className="font-medium text-sm text-foreground">Google API Services Disclosure</h3>
					<p>
						SocialFlyAI&apos;s use and transfer of information received from Google APIs to any
						other app will adhere to the Google API Services User Data Policy, including the Limited
						Use requirements.
					</p>
					<p>
						We only use Google user data to provide and improve our application&apos;s
						functionality. We do not use this data for advertising, profiling, or resale.
					</p>
					<p>We do not allow humans to read user data unless:</p>
					<LegalList
						items={[
							"We have the user's consent",
							"It is necessary for security purposes",
							"It is required by law",
						]}
					/>
					<p className={emphasis}>
						Users can revoke access at any time via:{" "}
						<LegalLink href="https://myaccount.google.com/permissions">
							myaccount.google.com/permissions
						</LegalLink>
					</p>
				</div>
			</div>
		),
	},
	{
		id: 4,
		title: "Meta (Facebook & Instagram) Data Usage",
		content: (
			<div>
				<p className="mb-4">
					When users connect Meta platforms (such as Facebook Pages or Instagram accounts), we
					access data necessary to:
				</p>
				<LegalList
					className="mb-4"
					items={[
						"Publish and manage posts",
						"Retrieve engagement metrics",
						"Manage comments and interactions",
					]}
				/>
				<p className="mb-3">
					We do not use this data beyond providing the Service and do not sell or misuse platform
					data.
				</p>
				<p className={emphasis}>
					Users can revoke access at any time through their Meta account settings.
				</p>
			</div>
		),
	},
	{
		id: 5,
		title: "LinkedIn Data Usage",
		content: (
			<div>
				<p className="mb-4">
					When users connect LinkedIn accounts or organization pages, we access limited data
					required to:
				</p>
				<LegalList
					className="mb-4"
					items={["Publish posts", "Retrieve engagement and analytics data", "Manage interactions"]}
				/>
				<p>
					We do not access personal profile data beyond what is required and do not share LinkedIn
					data externally.
				</p>
			</div>
		),
	},
	{
		id: 6,
		title: "Pinterest and Other Platforms",
		content: (
			<div className="space-y-3">
				<p>
					When users connect Pinterest or other supported platforms, we access only the necessary
					data required for content publishing, scheduling, and analytics.
				</p>
				<p>
					We follow each platform&apos;s API policies and restrict usage strictly to providing the
					Service.
				</p>
			</div>
		),
	},
	{
		id: 7,
		title: "Data Sharing",
		content: (
			<div>
				<p className="mb-4">We do not sell, rent, or trade user data.</p>
				<p className="mb-3">We may share data only in the following cases:</p>
				<LegalList
					className="mb-4"
					items={[
						"With trusted service providers (e.g., cloud hosting, authentication, infrastructure providers) strictly for operating the Service",
						"When required by law, legal process, or to protect rights and security",
					]}
				/>
				<p className={note}>
					All third-party service providers are contractually obligated to protect user data.
				</p>
			</div>
		),
	},
	{
		id: 8,
		title: "Data Retention and Deletion",
		content: (
			<div>
				<p className="mb-4">
					We retain user data only as long as necessary to provide the Service.
				</p>
				<LegalList
					items={[
						"API data is processed in real-time and not stored permanently unless required for core functionality",
						<>Users may request deletion of their data at any time by contacting {support}</>,
						"All deletion requests are completed within 30 days",
						"Users can revoke access via their connected platform settings, which immediately stops further data access",
					]}
				/>
			</div>
		),
	},
	{
		id: 9,
		title: "Data Security",
		content: (
			<p>
				We implement appropriate technical and organizational measures to protect user data,
				including encryption, secure storage, and access controls.
			</p>
		),
	},
	{
		id: 10,
		title: "User Rights",
		content: (
			<div>
				<p className="mb-4">Users have the right to:</p>
				<LegalList
					className="mb-4"
					items={[
						"Access their data",
						"Request correction or deletion",
						"Revoke access to connected accounts",
					]}
				/>
				<p>Requests can be made via {support}.</p>
			</div>
		),
	},
	{
		id: 11,
		title: "Children's Privacy",
		content: (
			<p>
				The Service is not intended for individuals under 18. We do not knowingly collect data from
				children.
			</p>
		),
	},
	{
		id: 12,
		title: "Changes to This Policy",
		content: (
			<p>
				We may update this Privacy Policy periodically. Continued use of the Service constitutes
				acceptance of the updated policy.
			</p>
		),
	},
	{
		id: 13,
		title: "Contact Us",
		content: (
			<div className="space-y-2">
				<p>
					<span className="font-medium text-foreground">Email:</span> {support}
				</p>
				<p>
					<span className="font-medium text-foreground">Location:</span> Hyderabad, Telangana, India
				</p>
			</div>
		),
	},
];

export default function PrivacyPolicyPage() {
	return (
		<LegalPage
			title="Privacy Policy"
			dateLine="Effective Date: January 19, 2026"
			intro={
				<>
					SocialflyAI (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates
					socialflyai.vercel.app (the &quot;Service&quot;). This Privacy Policy explains how we
					collect, use, and protect user data when you use our platform, including integrations with
					third-party platforms such as Google (YouTube), Meta (Facebook, Instagram), LinkedIn,
					Pinterest, and other supported services.
				</>
			}
			sections={SECTIONS}
			contactPrompt="Questions about your privacy?"
		/>
	);
}
