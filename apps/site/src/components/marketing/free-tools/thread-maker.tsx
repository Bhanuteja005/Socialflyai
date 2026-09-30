"use client";

import { CircleCheck, Copy, Download, PenLine } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import {
	copyToClipboard,
	downloadText,
	toolButtonPrimary,
	toolButtonSecondary,
	toolControl,
	toolLabel,
	toolPanel,
} from "./tool-ui";

const TWEET_LIMIT = 280;
/** Room reserved for a " (12/12)" suffix when numbering is on. */
const NUMBERING_RESERVE = 8;

/**
 * Splits text into tweet-sized chunks. Blank lines force a new tweet; otherwise words are
 * packed greedily and overly long words are hard-split.
 */
export function splitThread(text: string, limit: number): string[] {
	const tweets: string[] = [];
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	for (const paragraph of paragraphs) {
		let current = "";
		for (const word of paragraph.split(/[ \t]+/)) {
			let token = word;
			while (token.length > limit) {
				if (current) {
					tweets.push(current);
					current = "";
				}
				tweets.push(token.slice(0, limit));
				token = token.slice(limit);
			}
			if (!token) continue;
			const candidate = current ? `${current} ${token}` : token;
			if (candidate.length <= limit) {
				current = candidate;
			} else {
				tweets.push(current);
				current = token;
			}
		}
		if (current) tweets.push(current);
	}
	return tweets;
}

export function ThreadMaker() {
	const id = useId();
	const [content, setContent] = useState("");
	const [title, setTitle] = useState("");
	const [numbering, setNumbering] = useState(true);

	const tweets = useMemo(() => {
		const chunks = splitThread(content, numbering ? TWEET_LIMIT - NUMBERING_RESERVE : TWEET_LIMIT);
		return numbering
			? chunks.map((chunk, index) => `${chunk} (${index + 1}/${chunks.length})`)
			: chunks;
	}, [content, numbering]);

	const threadText = tweets.join("\n\n");

	return (
		<div className={toolPanel}>
			<label htmlFor={`${id}-content`} className={`${toolLabel} flex items-center gap-2`}>
				<PenLine className="size-4 text-brand-text" aria-hidden="true" />
				Write your thread content
			</label>
			<textarea
				id={`${id}-content`}
				value={content}
				onChange={(event) => setContent(event.target.value)}
				rows={8}
				placeholder="Start typing your thread content here. The tool will automatically split it into tweets of the right length. Leave a blank line to force a new tweet."
				className={`${toolControl} min-h-48 resize-y`}
			/>

			<div className="mt-6 grid gap-6 md:grid-cols-2 md:items-end">
				<div>
					<label htmlFor={`${id}-title`} className={toolLabel}>
						Thread title (used for the download file name)
					</label>
					<input
						id={`${id}-title`}
						type="text"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="My awesome thread"
						className={toolControl}
					/>
				</div>
				<label className="flex cursor-pointer items-center gap-3 py-3 text-sm text-foreground">
					<input
						type="checkbox"
						checked={numbering}
						onChange={(event) => setNumbering(event.target.checked)}
						className="size-5 accent-primary"
					/>
					Include tweet numbering (1/5, 2/5, etc.)
				</label>
			</div>

			<div className="mt-8 flex flex-col gap-4 border-border border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm text-muted-foreground" aria-live="polite">
					{content.length} characters · {tweets.length} {tweets.length === 1 ? "tweet" : "tweets"}
				</p>
				<div className="flex flex-col gap-3 sm:flex-row">
					<button
						type="button"
						disabled={!threadText}
						onClick={() => copyToClipboard(threadText, "Thread copied to clipboard")}
						className={toolButtonPrimary}
					>
						<Copy className="size-4" aria-hidden="true" />
						Copy thread
					</button>
					<button
						type="button"
						disabled={!threadText}
						onClick={() =>
							downloadText(
								threadText,
								`${title.trim().replace(/[^\w-]+/g, "-") || "twitter-thread"}.txt`,
							)
						}
						className={toolButtonSecondary}
					>
						<Download className="size-4" aria-hidden="true" />
						Download .txt
					</button>
				</div>
			</div>

			{tweets.length > 0 ? (
				<section aria-label="Live thread preview" className="mt-10">
					<p className={toolLabel}>Live thread preview</p>
					<ol className="space-y-4">
						{tweets.map((tweet, index) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: a tweet's identity is its position in the thread
								key={index}
								className="rounded-2xl border border-border bg-surface p-5"
							>
								<div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
									<span className="font-medium text-foreground">SocialflyAI</span>
									<CircleCheck className="size-4 text-brand-text" aria-hidden="true" />
									<span className="text-subtle-foreground">@socialflyai · Just now</span>
									<span className="ml-auto font-mono text-[11px] text-subtle-foreground">
										Tweet {index + 1} · {tweet.length}/{TWEET_LIMIT}
									</span>
								</div>
								<p className="whitespace-pre-wrap break-words text-foreground">{tweet}</p>
							</li>
						))}
					</ol>
					<p className="mt-6 text-center text-sm text-muted-foreground">
						Want to save and schedule threads?{" "}
						<Link href={SIGNUP_URL} className="font-medium text-brand-text hover:underline">
							Create a free SocialFly AI account
						</Link>
						.
					</p>
				</section>
			) : null}
		</div>
	);
}
