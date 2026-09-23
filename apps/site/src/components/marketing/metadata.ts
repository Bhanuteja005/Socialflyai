import type { Metadata } from "next";

type PageMetadataInput = {
	/** Page title without the " | SocialFly AI" suffix (the root template adds it). */
	title: string;
	description: string;
	/** Canonical path, e.g. "/features/scheduling". */
	path: string;
	/** Bypass the root title template (used by the home page). */
	absoluteTitle?: boolean;
	/** Optional Open Graph image path (defaults to the brand logo). */
	image?: string;
	keywords?: string[];
};

const DEFAULT_OG_IMAGE = "/assets/socialflyai_logo/socialflyailogo.png";

/**
 * Builds consistent per-page metadata: title, description, canonical URL, Open Graph and
 * Twitter cards. `metadataBase` is set in the root layout, so relative paths resolve to
 * absolute URLs automatically.
 */
export function pageMetadata({
	title,
	description,
	path,
	absoluteTitle = false,
	image = DEFAULT_OG_IMAGE,
	keywords,
}: PageMetadataInput): Metadata {
	const fullTitle = absoluteTitle ? title : `${title} | SocialFly AI`;
	return {
		title: absoluteTitle ? { absolute: title } : title,
		description,
		keywords,
		alternates: { canonical: path },
		openGraph: {
			type: "website",
			siteName: "SocialFly AI",
			title: fullTitle,
			description,
			url: path,
			images: [{ url: image, alt: "SocialFly AI" }],
		},
		twitter: {
			card: "summary_large_image",
			title: fullTitle,
			description,
			images: [image],
		},
	};
}
