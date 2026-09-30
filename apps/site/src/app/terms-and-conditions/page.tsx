import {
	LegalLink,
	LegalList,
	LegalPage,
	type LegalSection,
} from "@/components/marketing/company-legal";
import { pageMetadata } from "@/components/marketing/metadata";

export const metadata = pageMetadata({
	title: "Terms of Service",
	description:
		"The Terms of Service governing your use of SocialflyAI, the social media management platform: accounts, acceptable use, billing, data ownership and liability.",
	path: "/terms-and-conditions",
});

const note = "text-xs italic text-subtle-foreground";
const label = (text: string) => <span className="font-medium text-foreground">{text}:</span>;
const support = (
	<LegalLink href="mailto:support@socialflyai.com">support@socialflyai.com</LegalLink>
);

const SECTIONS: LegalSection[] = [
	{
		id: 1,
		title: "Acceptance of Terms",
		content: (
			<div className="space-y-3">
				<p>
					Welcome to SocialflyAI (&quot;Service,&quot; &quot;Platform,&quot; &quot;we,&quot;
					&quot;us,&quot; or &quot;our&quot;). These Terms of Service (&quot;Terms&quot;) govern
					your use of our social media management SaaS platform and related services.
				</p>
				<p>
					By accessing or using SocialflyAI, you agree to be bound by these Terms and our Privacy
					Policy. If you disagree with any part of these terms, you may not access the Service.
				</p>
			</div>
		),
	},
	{
		id: 2,
		title: "Description of Service",
		content: (
			<div>
				<p className="mb-4">
					SocialflyAI is a social media management SaaS platform that enables users to:
				</p>
				<LegalList
					items={[
						"Manage and schedule social media posts across platforms",
						"Monitor social media analytics and engagement metrics",
						"Automate social media workflows and content distribution",
						"Integrate with LinkedIn and other social platforms via APIs",
						"Track performance and optimize social media strategies",
					]}
				/>
				<p className="mt-4">
					Our platform integrates with third-party services including LinkedIn APIs for social media
					management, Firebase for authentication, and GCP for hosting.
				</p>
			</div>
		),
	},
	{
		id: 3,
		title: "User Accounts and Registration",
		content: (
			<div>
				<p className="mb-4">To use our Service, you must:</p>
				<LegalList
					className="mb-4"
					items={[
						"Be at least 18 years old or have parental consent",
						"Provide accurate and complete registration information",
						"Maintain the security of your account credentials",
						"Accept responsibility for all activities under your account",
						"Notify us immediately of any unauthorized use",
					]}
				/>
				<p>
					You may register using Google OAuth or email/password authentication. Account deletion
					requests can be made by contacting {support}.
				</p>
			</div>
		),
	},
	{
		id: 4,
		title: "Acceptable Use Policy",
		content: (
			<div>
				<p className="mb-4">
					You agree <strong className="text-foreground">NOT</strong> to use the Service to:
				</p>
				<LegalList
					tone="danger"
					className="mb-4"
					items={[
						"Send spam, unsolicited emails, or violate anti-spam laws",
						"Collect email addresses without proper consent",
						"Create misleading or deceptive lead magnets",
						"Violate any applicable laws or regulations",
						"Infringe on intellectual property rights",
						"Transmit malware, viruses, or harmful code",
						"Attempt to gain unauthorized access to our systems",
						"Use the platform for illegal or unethical purposes",
					]}
				/>
				<p className="text-subtle-foreground italic">
					Violation of this policy may result in immediate account suspension or termination.
				</p>
			</div>
		),
	},
	{
		id: 5,
		title: "Third-Party Service Integration",
		content: (
			<div>
				<p className="mb-4">
					By using SocialflyAI, you acknowledge and agree to the terms of service and privacy
					policies of our integrated third-party services:
				</p>
				<LegalList
					className="mb-4"
					items={[
						<>{label("LinkedIn APIs")} Used for social media management and analytics</>,
						<>{label("Firebase")} Handles authentication and user management</>,
						<>{label("Google Cloud Platform (GCP)")} Provides hosting and data storage</>,
					]}
				/>
				<p className={note}>
					We are not responsible for the availability, functionality, or policies of these
					third-party services.
				</p>
			</div>
		),
	},
	{
		id: 6,
		title: "Payment Terms and Billing",
		content: (
			<div>
				<p className="mb-4">
					Payment processing is handled exclusively by Polar.sh. Our current pricing structure
					includes:
				</p>
				<LegalList
					className="mb-4"
					items={[
						<>{label("Free Plan")} Limited features with usage restrictions</>,
						<>{label("Lifetime Plan")} One-time payment for unlimited access</>,
					]}
				/>
				<p>
					All payments are processed securely by Polar.sh according to their terms of service.
					Refunds are subject to Polar.sh&apos;s refund policy.
				</p>
			</div>
		),
	},
	{
		id: 7,
		title: "Data Ownership and Usage Rights",
		content: (
			<div className="space-y-5">
				<div>
					<h3 className="mb-2 font-medium text-sm text-foreground">Your Data</h3>
					<p>
						You retain ownership of all social media content, posts, and data you create or upload
						to the platform, including analytics and engagement metrics.
					</p>
				</div>
				<div>
					<h3 className="mb-2 font-medium text-sm text-foreground">Our Rights</h3>
					<p className="mb-3">
						You grant us a limited license to process your data solely to provide our services,
						including:
					</p>
					<LegalList
						items={[
							"Displaying social media content in the dashboard",
							"Processing API data from LinkedIn for analytics",
							"Generating performance reports and insights",
							"Providing customer support",
						]}
					/>
				</div>
				<p className="text-subtle-foreground italic">
					We do not claim ownership of your social media content and will not use it for purposes
					outside of providing our services.
				</p>
			</div>
		),
	},
	{
		id: 8,
		title: "GDPR and Privacy Compliance",
		content: (
			<div>
				<p className="mb-4">As a user of SocialflyAI, you are responsible for:</p>
				<LegalList
					className="mb-4"
					items={[
						"Obtaining proper consent for social media data collection",
						"Providing clear privacy notices on your social media profiles",
						"Complying with GDPR, CCPA, and other applicable privacy laws",
						"Honoring user requests for data deletion or access",
						"Ensuring your social media activities comply with platform policies",
					]}
				/>
				<p className="text-subtle-foreground italic">
					We provide tools to help with compliance, but ultimate responsibility rests with you as
					the data controller for your social media data.
				</p>
			</div>
		),
	},
	{
		id: 9,
		title: "Service Availability and Limitations",
		content: (
			<div>
				<p className="mb-4">
					We strive to maintain high service availability but cannot guarantee:
				</p>
				<LegalList
					className="mb-4"
					items={[
						"100% uptime or uninterrupted service",
						"Compatibility with all devices or browsers",
						"Availability of third-party integrations",
						"Data backup or recovery in all circumstances",
					]}
				/>
				<p>
					We reserve the right to modify, suspend, or discontinue any aspect of the service with
					reasonable notice.
				</p>
			</div>
		),
	},
	{
		id: 10,
		title: "Intellectual Property Rights",
		content: (
			<div className="space-y-3">
				<p>
					The SocialflyAI platform, including its design, code, features, and branding, is protected
					by intellectual property laws and remains our exclusive property.
				</p>
				<p>
					You may not copy, modify, distribute, or create derivative works of our platform without
					explicit written permission.
				</p>
			</div>
		),
	},
	{
		id: 11,
		title: "Limitation of Liability",
		content: (
			<div>
				<p className="mb-4">
					To the maximum extent permitted by law, SocialflyAI shall not be liable for:
				</p>
				<LegalList
					className="mb-4"
					items={[
						"Indirect, incidental, or consequential damages",
						"Loss of profits, data, or business opportunities",
						"Damages resulting from third-party service failures",
						"Social media content or platform performance",
						"Compliance failures related to your use of collected data",
					]}
				/>
				<p>
					Our total liability shall not exceed the amount paid by you for the service in the 12
					months preceding the claim.
				</p>
			</div>
		),
	},
	{
		id: 12,
		title: "Indemnification",
		content: (
			<p>
				You agree to indemnify and hold SocialflyAI harmless from any claims, damages, or expenses
				arising from your use of the service, violation of these terms, or infringement of
				third-party rights.
			</p>
		),
	},
	{
		id: 13,
		title: "Account Termination",
		content: (
			<div>
				<p className="mb-4">Either party may terminate the service relationship:</p>
				<LegalList
					className="mb-4"
					items={[
						<>
							{label("By You")} At any time by contacting {support}
						</>,
						<>{label("By Us")} For violation of terms, illegal activity, or abuse</>,
					]}
				/>
				<p>
					Upon termination, your access will be suspended, and data may be deleted according to our
					retention policies.
				</p>
			</div>
		),
	},
	{
		id: 14,
		title: "Dispute Resolution",
		content: (
			<p>
				Any disputes arising from these terms shall be resolved through binding arbitration or in
				courts of competent jurisdiction. You waive the right to participate in class action
				lawsuits.
			</p>
		),
	},
	{
		id: 15,
		title: "Changes to Terms",
		content: (
			<p>
				We reserve the right to modify these Terms at any time. Material changes will be
				communicated via email with 30 days&apos; notice. Continued use after changes constitutes
				acceptance of new terms.
			</p>
		),
	},
	{
		id: 16,
		title: "Governing Law",
		content: (
			<p>
				These Terms are governed by applicable laws and regulations. Any legal proceedings shall be
				conducted in English.
			</p>
		),
	},
	{
		id: 17,
		title: "Contact Information",
		content: (
			<div className="space-y-2">
				<p className="mb-1">For questions about these Terms of Service, please contact us:</p>
				<p>
					<span className="font-medium text-foreground">Email:</span> {support}
				</p>
				<p>
					<span className="font-medium text-foreground">Website:</span>{" "}
					<LegalLink href="https://socialflyai.com">socialflyai.com</LegalLink>
				</p>
				<p className={note}>
					<span className="font-medium">Response Time:</span> We aim to respond within 5 business
					days
				</p>
			</div>
		),
	},
	{
		id: 18,
		title: "Severability",
		content: (
			<p>
				If any provision of these Terms is found to be unenforceable, the remaining provisions shall
				remain in full force and effect.
			</p>
		),
	},
	{
		id: 19,
		title: "Entire Agreement",
		content: (
			<p>
				These Terms, together with our Privacy Policy, constitute the entire agreement between you
				and SocialflyAI regarding the use of our service.
			</p>
		),
	},
];

export default function TermsPage() {
	return (
		<LegalPage
			title="Terms of Service"
			dateLine="Last updated: June 28, 2025"
			intro="Please read these Terms of Service carefully before using our platform. By accessing or using SocialflyAI, you agree to be bound by these terms."
			sections={SECTIONS}
			contactPrompt="Questions about our terms?"
		/>
	);
}
