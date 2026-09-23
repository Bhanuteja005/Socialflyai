import { cn } from "@socialfly/ui/utils";
import type { ReactNode } from "react";
import { ADS_PROVIDERS } from "@/lib/ads";
import { providerMeta } from "@/lib/providers";

const glyphs: Record<string, ReactNode> = {
	x: (
		<path
			fill="currentColor"
			d="M17.53 3.5h2.9l-6.34 7.25L21.5 20.5h-5.84l-4.57-5.98-5.24 5.98H2.95l6.78-7.75L2.6 3.5h5.99l4.13 5.46zm-1.02 15.28h1.6L7.72 5.13H6z"
		/>
	),
	linkedin: (
		<path
			fill="currentColor"
			d="M6.94 8.98H3.56V20h3.38zM5.25 3.5a1.96 1.96 0 1 0 0 3.92 1.96 1.96 0 0 0 0-3.92M20.5 13.68c0-3.03-.65-5.36-4.19-5.36-1.7 0-2.84.93-3.3 1.82h-.05V8.98H9.72V20h3.37v-5.45c0-1.44.27-2.83 2.05-2.83 1.75 0 1.78 1.64 1.78 2.92V20h3.38z"
		/>
	),
	facebook: (
		<path
			fill="currentColor"
			d="M13.5 21v-7.6h2.56l.38-2.97H13.5V8.54c0-.86.24-1.44 1.47-1.44h1.57V4.44a21 21 0 0 0-2.29-.12c-2.27 0-3.82 1.38-3.82 3.93v2.18H7.87v2.97h2.56V21z"
		/>
	),
	instagram: (
		<g fill="none" stroke="currentColor" strokeWidth="1.9">
			<rect x="4" y="4" width="16" height="16" rx="4.6" />
			<circle cx="12" cy="12" r="3.7" />
			<circle cx="16.9" cy="7.1" r="0.6" fill="currentColor" stroke="none" />
		</g>
	),
	threads: (
		<path
			fill="currentColor"
			d="M16.3 11.4a5 5 0 0 0-.2-.1c-.1-2.3-1.4-3.6-3.5-3.6h-.03c-1.26 0-2.3.54-2.95 1.52l1.16.8c.48-.73 1.24-.89 1.8-.89h.02c.69 0 1.2.2 1.54.6.24.28.4.67.49 1.16a8.8 8.8 0 0 0-1.97-.1c-1.98.11-3.26 1.27-3.17 2.88.04.82.45 1.52 1.14 1.98.59.39 1.34.58 2.13.54 1.04-.06 1.86-.46 2.43-1.18.43-.55.7-1.26.83-2.15.5.3.86.69 1.06 1.16.34.8.36 2.1-.7 3.17-.94.93-2.06 1.34-3.76 1.35-1.89-.01-3.32-.62-4.25-1.8-.87-1.1-1.32-2.7-1.34-4.74.02-2.04.47-3.64 1.34-4.74.93-1.18 2.36-1.79 4.25-1.8 1.9.01 3.36.62 4.33 1.81.48.59.84 1.32 1.08 2.18l1.37-.37c-.3-1.06-.75-1.98-1.37-2.74-1.24-1.53-3.06-2.31-5.4-2.33h-.01c-2.34.02-4.13.8-5.33 2.33C4.62 7.51 4.07 9.44 4.05 11.99v.01c.02 2.55.57 4.48 1.63 5.83 1.2 1.53 3 2.32 5.33 2.33h.01c2.07-.01 3.53-.55 4.74-1.76 1.58-1.58 1.53-3.56 1.01-4.78-.37-.87-1.08-1.58-2.05-2.05zm-3.6 3.37c-.87.05-1.77-.34-1.81-1.17-.03-.62.44-1.3 1.87-1.39l.48-.01c.52 0 1 .05 1.45.15-.17 2.07-1.14 2.37-1.99 2.42"
		/>
	),
	reddit: (
		<g fill="currentColor">
			<path d="M20 12.06a1.94 1.94 0 0 0-3.28-1.37 9.47 9.47 0 0 0-4.64-1.46l.8-3.7 2.57.55a1.35 1.35 0 1 0 .15-.72l-2.9-.62a.37.37 0 0 0-.44.28l-.9 4.2a9.5 9.5 0 0 0-4.7 1.46 1.94 1.94 0 1 0-2.13 3.16 3.6 3.6 0 0 0-.04.56c0 2.9 3.37 5.24 7.52 5.24s7.52-2.35 7.52-5.24c0-.19-.02-.37-.05-.55A1.95 1.95 0 0 0 20 12.06" />
			<circle cx="9.3" cy="13" r="1.15" className="text-[#ff4500]" fill="currentColor" />
			<circle cx="14.7" cy="13" r="1.15" className="text-[#ff4500]" fill="currentColor" />
		</g>
	),
	youtube: <path fill="currentColor" d="M9.75 8.4v7.2L16 12z" />,
};
glyphs.linkedin_page = glyphs.linkedin;

const tileBackground: Record<string, string> = {
	instagram: "linear-gradient(45deg, #f9ce34 0%, #ee2a7b 45%, #6228d7 100%)",
};

const sizes = {
	xs: "size-4 rounded-[4px] [&_svg]:size-3",
	sm: "size-5 rounded-[5px] [&_svg]:size-3.5",
	md: "size-7 rounded-md [&_svg]:size-4.5",
	lg: "size-10 rounded-lg [&_svg]:size-6",
} as const;

/** A brand-coloured tile with the platform's mark. */
export function ProviderIcon({
	provider,
	size = "sm",
	className,
}: {
	provider: string;
	size?: keyof typeof sizes;
	className?: string;
}) {
	// Ad platforms (meta_ads, x_ads…) reuse the organic brand's mark where there is one.
	const ads = ADS_PROVIDERS[provider as keyof typeof ADS_PROVIDERS];
	const meta = ads ?? providerMeta(provider);
	const glyph = glyphs[provider] ?? (ads?.glyph ? glyphs[ads.glyph] : undefined);
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center text-white",
				sizes[size],
				className,
			)}
			style={{ background: tileBackground[provider] ?? meta.color }}
			title={meta.name}
		>
			{glyph ? (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					{glyph}
				</svg>
			) : (
				<span className="font-bold text-[10px] uppercase" aria-hidden="true">
					{meta.name.slice(0, 1)}
				</span>
			)}
			<span className="sr-only">{meta.name}</span>
		</span>
	);
}
