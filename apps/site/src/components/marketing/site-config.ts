/** Static navigation + footer data shared by every marketing page. */

export type NavLink = {
	label: string;
	href: string;
	/** One line under the label in the rich dropdown panels. */
	description?: string;
};

export const FEATURE_LINKS: NavLink[] = [
	{
		label: "AI Assistant",
		href: "/features/ai-assistant",
		description: "Draft, rewrite and plan posts with AI",
	},
	{
		label: "Calendar Planner",
		href: "/features/calendar-planner",
		description: "Every channel on one drag-and-drop calendar",
	},
	{
		label: "Best Time to Post",
		href: "/features/best-time",
		description: "Post when your audience is online",
	},
	{
		label: "Scheduling",
		href: "/features/scheduling",
		description: "Queue posts across six networks at once",
	},
	{
		label: "AI Reply",
		href: "/features/ai-reply",
		description: "Suggested replies in your brand voice",
	},
	{
		label: "AI Caption Generator",
		href: "/features/ai-caption-generator",
		description: "Captions and hashtags in seconds",
	},
	{
		label: "Comment Management",
		href: "/features/comment-management",
		description: "Every comment and DM in one inbox",
	},
	{
		label: "In-depth Analytics",
		href: "/features/analytics",
		description: "Reach, engagement and growth per channel",
	},
	{
		label: "Agency-specific",
		href: "/features/agency",
		description: "Client workspaces, approvals and reports",
	},
];

export const SOLUTION_LINKS: NavLink[] = [
	{
		label: "Creators",
		href: "/solutions/creators",
		description: "Grow an audience without living in the apps",
	},
	{
		label: "Small Businesses",
		href: "/solutions/smb",
		description: "Stay consistent with a small team",
	},
	{ label: "Agencies", href: "/solutions/agencies", description: "Run many brands from one place" },
	{
		label: "Non-profits",
		href: "/solutions/non-profits",
		description: "Tell your story on a lean budget",
	},
	{
		label: "Higher Education",
		href: "/solutions/higher-education",
		description: "Coordinate campus accounts and approvals",
	},
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

export type NavSection = {
	title: string;
	links: NavLink[];
	/** Index page for the section ("All …"), when there is one. */
	more?: NavLink;
};

export type NavGroup = {
	label: string;
	/** Landing page for the group ("See all"), when there is one. */
	href?: string;
	links: NavLink[];
	/** Column layout for mixed menus; `links` still lists every page for active-state checks. */
	sections?: NavSection[];
};

const pick = (links: NavLink[], hrefs: string[]) =>
	hrefs.map((href) => {
		const link = links.find((l) => l.href === href);
		if (!link) throw new Error(`Unknown nav link ${href}`);
		return link;
	});

/*
 * Compare and free-tool pages are search landing pages: visitors arrive on them from Google, not
 * from the menu. Menus and footer show the most-used few; /free-tools and sitemap.xml list them all.
 */
export const LEARN_LINKS: NavLink[] = [
	{ label: "Blog", href: "/blog" },
	{ label: "FAQ", href: "/faq" },
	{ label: "Testimonials", href: "/testimonials" },
	{ label: "Feedback", href: "/feedback" },
];

/** The most-used free tools and comparisons, shown in the Resources menu and the footer. */
export const FEATURED_FREE_TOOLS = pick(FREE_TOOL_LINKS, [
	"/free-tools/hashtag-generator",
	"/free-tools/youtube-tags-generator",
	"/free-tools/youtube-ai-description-generator",
	"/free-tools/twitter-thread-maker",
	"/free-tools/utm-generator",
]);

export const FEATURED_COMPARISONS = pick(COMPETITOR_LINKS, [
	"/vs-buffer",
	"/vs-hootsuite",
	"/vs-sprout-social",
	"/vs-later",
	"/vs-agorapulse",
]);

export const ALL_FREE_TOOLS_LINK: NavLink = {
	label: `All ${FREE_TOOL_LINKS.length} free tools`,
	href: "/free-tools",
};

const RESOURCE_SECTIONS: NavSection[] = [
	{ title: "Free tools", links: FEATURED_FREE_TOOLS, more: ALL_FREE_TOOLS_LINK },
	{ title: "Compare", links: FEATURED_COMPARISONS },
	{ title: "Learn", links: LEARN_LINKS },
];

/**
 * Dropdown menus in the top bar: the pages people navigate to on purpose.
 */
export const NAV_GROUPS: NavGroup[] = [
	{ label: "Features", href: "/features", links: FEATURE_LINKS },
	{ label: "Solutions", links: SOLUTION_LINKS },
	{
		label: "Resources",
		links: [...FREE_TOOL_LINKS, ...COMPETITOR_LINKS, ...LEARN_LINKS],
		sections: RESOURCE_SECTIONS,
	},
];

/** Plain links shown after the dropdowns. */
export const NAV_LINKS: NavLink[] = [
	{ label: "About", href: "/about" },
	{ label: "Contact", href: "/contact" },
];

export const SUPPORT_EMAIL = "support@socialflyai.com";
