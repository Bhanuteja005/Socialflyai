/** Static navigation + footer data shared by every marketing page. */

export type NavLink = { label: string; href: string };

export const FEATURE_LINKS: NavLink[] = [
	{ label: "AI Assistant", href: "/features/ai-assistant" },
	{ label: "Calendar Planner", href: "/features/calendar-planner" },
	{ label: "Best Time to Post", href: "/features/best-time" },
	{ label: "Scheduling", href: "/features/scheduling" },
	{ label: "AI Reply", href: "/features/ai-reply" },
	{ label: "AI Caption Generator", href: "/features/ai-caption-generator" },
	{ label: "Comment Management", href: "/features/comment-management" },
	{ label: "In-depth Analytics", href: "/features/analytics" },
	{ label: "Agency-specific", href: "/features/agency" },
];

export const SOLUTION_LINKS: NavLink[] = [
	{ label: "Creators", href: "/solutions/creators" },
	{ label: "Small Businesses", href: "/solutions/smb" },
	{ label: "Agencies", href: "/solutions/agencies" },
	{ label: "Non-profits", href: "/solutions/non-profits" },
	{ label: "Higher Education", href: "/solutions/higher-education" },
];

export const COMPANY_LINKS: NavLink[] = [
	{ label: "About Us", href: "/about" },
	{ label: "Contact Us", href: "/contact" },
	{ label: "Testimonials", href: "/testimonials" },
	{ label: "Features", href: "/features" },
	{ label: "FAQ", href: "/faq" },
	{ label: "Blog", href: "/blog" },
	{ label: "Feedback", href: "/feedback" },
	{ label: "Privacy Policy", href: "/privacy-policy" },
	{ label: "Terms & Conditions", href: "/terms-and-conditions" },
];

export const COMPETITOR_LINKS: NavLink[] = [
	{ label: "vs Buffer", href: "/vs-buffer" },
	{ label: "vs Hootsuite", href: "/vs-hootsuite" },
	{ label: "vs Sprout Social", href: "/vs-sprout-social" },
	{ label: "vs Agorapulse", href: "/vs-agorapulse" },
	{ label: "vs ContentStudio", href: "/vs-contentstudio" },
	{ label: "vs Planable", href: "/vs-planable" },
	{ label: "vs Sendible", href: "/vs-sendible" },
	{ label: "vs SocialPilot", href: "/vs-socialpilot" },
	{ label: "vs HeyOrca", href: "/vs-heyorca" },
	{ label: "vs Publer", href: "/vs-publer" },
	{ label: "vs Metricool", href: "/vs-metricool" },
	{ label: "vs Hypefury", href: "/vs-hypefury" },
	{ label: "vs TweetHunter", href: "/vs-tweethunter" },
	{ label: "vs Ordinal", href: "/vs-ordinal" },
	{ label: "vs Later", href: "/vs-later" },
	{ label: "vs MeetEdgar", href: "/vs-meetedgar" },
];

export const FREE_TOOL_LINKS: NavLink[] = [
	{ label: "YouTube Video Downloader", href: "/free-tools/youtube-video-downloader" },
	{ label: "YouTube Tags Generator", href: "/free-tools/youtube-tags-generator" },
	{
		label: "YouTube AI Description Generator",
		href: "/free-tools/youtube-ai-description-generator",
	},
	{ label: "Hashtag Generator", href: "/free-tools/hashtag-generator" },
	{ label: "Photo and Video Downloader", href: "/free-tools/photo-video-downloader" },
	{ label: "UTM Generator", href: "/free-tools/utm-generator" },
	{ label: "Twitter Photo Resizer", href: "/free-tools/twitter-photo-resizer" },
	{ label: "LinkedIn Photo Resizer", href: "/free-tools/linkedin-photo-resizer" },
	{ label: "Pinterest Photo Resizer", href: "/free-tools/pinterest-photo-resizer" },
	{ label: "Twitter Thread Maker", href: "/free-tools/twitter-thread-maker" },
	{
		label: "LinkedIn Bold and Italic Text Generator",
		href: "/free-tools/linkedin-bold-italic-text-generator",
	},
];

export const INTEGRATIONS = ["Instagram", "Facebook", "Twitter/X", "LinkedIn", "TikTok", "YouTube"];

/** Primary links shown in the top navigation bar. */
export const PRIMARY_NAV: NavLink[] = [
	{ label: "Features", href: "/features" },
	{ label: "Solutions", href: "/solutions/creators" },
	{ label: "Free Tools", href: "/free-tools" },
	{ label: "Blog", href: "/blog" },
	{ label: "Contact", href: "/contact" },
];

export const SUPPORT_EMAIL = "support@socialflyai.com";
