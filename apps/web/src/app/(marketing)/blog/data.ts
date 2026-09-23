export type BlogPost = {
	id: number;
	title: string;
	description: string;
	category: string;
	author: string;
	role: string;
	readTime: string;
	image: string;
	featured?: boolean;
};

export const BLOG_CATEGORIES = ["All", "Strategy", "Product", "Case Study", "Updates"];

export const BLOG_POSTS: BlogPost[] = [
	{
		id: 1,
		title: "10 Viral Hook Strategies for 2026",
		description:
			"How to stop the scroll and maximize your engagement with SocialflyAI's Hook Generator—the tool that predicts your next viral first line. Learn the psychology behind the scroll-stop and how to implement it across multi-platform campaigns.",
		category: "Strategy",
		author: "Sarah Miller",
		role: "Head of Content",
		readTime: "5 min",
		image: "/blog/post1.png",
		featured: true,
	},
	{
		id: 2,
		title: "Autonomous Interaction: The Future of Growth",
		description:
			"Why manual engagement is dead. A deep-dive into SocialflyAI's Autonomous Logic and why it's the safest way to build a community in 2026.",
		category: "Product",
		author: "Alex Rivera",
		role: "Product Lead",
		readTime: "8 min",
		image: "/blog/post2.png",
	},
	{
		id: 3,
		title: "Agency Scaling: Managing 50+ Clients Solo",
		description:
			"How boutique agencies are using the SocialflyAI White-label Dashboard to scale their operations without increasing headcount.",
		category: "Case Study",
		author: "Marcus Thorne",
		role: "Agency Founder",
		readTime: "12 min",
		image: "/blog/post3.png",
	},
	{
		id: 4,
		title: "Q1 Product Update: Video Downloader & More",
		description:
			"Exploring the expanded SocialflyAI Free Tools ecosystem, featuring our new high-speed Video Downloader and LinkedIn Resizer.",
		category: "Updates",
		author: "Socialfly Team",
		role: "Core Team",
		readTime: "3 min",
		image: "/blog/post4.png",
	},
];

export function authorInitials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0] ?? "")
		.join("")
		.slice(0, 2)
		.toUpperCase();
}
