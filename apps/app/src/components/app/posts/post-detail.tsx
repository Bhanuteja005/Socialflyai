"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarX2, Clock, Megaphone, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePost } from "@/hooks/queries";
import { useAdAccounts } from "@/hooks/use-ads";
import { api, call, callVoid } from "@/lib/api-client";
import type { PostDetail, TargetStatus } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { formatDateTime, formatRelative, pluralize, textLength, zoneLabel } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { isPostEditable, TARGET_STATUS } from "@/lib/status";
import { PostPerformance } from "../analytics/post-performance";
import { MediaThumb } from "../media/media-thumb";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { PostStatusBadge } from "../status-badge";
import { PostTimeline } from "./post-timeline";
import { TargetCard } from "./target-card";

function usePostMutations(post: PostDetail | undefined) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const router = useRouter();
	const id = post?.id ?? "";
	const onUpdated = (updated: PostDetail) => {
		queryClient.setQueryData(qk.post(orgId, updated.id), updated);
		void queryClient.invalidateQueries({ queryKey: qk.postsAll(orgId) });
	};

	return {
		unschedule: useMutation({
			mutationFn: () => call(api.posts[":id"].unschedule.$post({ param: { id } })),
			onSuccess: (p) => {
				onUpdated(p);
				toast.success("Moved back to drafts");
			},
			onError: (e) => toast.error(errorMessage(e)),
		}),
		publishNow: useMutation({
			mutationFn: () =>
				call(api.posts[":id"].schedule.$post({ param: { id }, json: { scheduledAt: null } })),
			onSuccess: (p) => {
				onUpdated(p);
				toast.success("Publishing now");
			},
			onError: (e) =>
				toast.error(
					isApiError(e) && e.code === "post_invalid"
						? `${e.message}. Edit the post to fix it.`
						: errorMessage(e),
				),
		}),
		retry: useMutation({
			mutationFn: (v: { targetId: string; confirmNotPublished: boolean }) =>
				call(
					api.posts[":id"].targets[":targetId"].retry.$post({
						param: { id, targetId: v.targetId },
						json: { confirmNotPublished: v.confirmNotPublished },
					}),
				),
			onSuccess: (p) => {
				onUpdated(p);
				toast.success("Retrying — we'll update the status shortly");
			},
			onError: (e) => toast.error(errorMessage(e)),
		}),
		remove: useMutation({
			mutationFn: () => callVoid(api.posts[":id"].$delete({ param: { id } })),
			onSuccess: () => {
				queryClient.removeQueries({ queryKey: qk.post(orgId, id) });
				void queryClient.invalidateQueries({ queryKey: qk.postsAll(orgId) });
				toast.success("Post deleted");
				router.replace("/posts");
			},
			onError: (e) => toast.error(errorMessage(e)),
		}),
	};
}

export function PostDetailView({ id }: { id: string }) {
	const { org, can } = useOrg();
	const { data: post, isPending, isError, error } = usePost(id);
	const actions = usePostMutations(post);
	const [confirmDelete, setConfirmDelete] = useState(false);
	// Boosting needs an ad account; ask only when the viewer could boost at all.
	const adAccounts = useAdAccounts(can("editor"));
	const canBoost = adAccounts.data?.some((a) => a.status === "active") ?? false;

	if (isPending) {
		return (
			<div className="grid gap-6">
				<Skeleton className="h-9 w-64" />
				<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
					<div className="grid gap-6">
						<Skeleton className="h-40 rounded-2xl" />
						<Skeleton className="h-56 rounded-2xl" />
					</div>
					<Skeleton className="h-72 rounded-2xl" />
				</div>
			</div>
		);
	}
	if (isError) {
		return (
			<EmptyState
				title={
					isApiError(error) && error.status === 404 ? "Post not found" : "Couldn't load this post"
				}
				description={
					isApiError(error) && error.status === 404
						? "It may have been deleted."
						: errorMessage(error)
				}
				action={
					<Button variant="outline" asChild>
						<Link href="/posts">Back to posts</Link>
					</Button>
				}
			/>
		);
	}

	const editor = can("editor");
	const editable = editor && isPostEditable(post);
	const canPublishNow =
		editor && post.targets.some((t) => t.status === "draft" || t.status === "canceled");
	const anyPublished = post.targets.some((t) => t.status === "published");

	return (
		<>
			<PageHeader
				eyebrow={
					<Link href="/posts" className="inline-flex items-center gap-1 hover:text-foreground">
						<ArrowLeft className="size-3.5" aria-hidden="true" />
						Posts
					</Link>
				}
				title={
					<span className="flex flex-wrap items-center gap-3">
						Post
						<PostStatusBadge status={post.status} />
					</span>
				}
				description={
					post.scheduledAt ? (
						<span className="inline-flex items-center gap-1.5 font-mono text-[13px] tabular-nums">
							<Clock className="size-3.5" aria-hidden="true" />
							{formatDateTime(post.scheduledAt, org.timezone)}{" "}
							{zoneLabel(org.timezone, new Date(post.scheduledAt))} ·{" "}
							{formatRelative(post.scheduledAt)}
						</span>
					) : (
						`Created ${formatRelative(post.createdAt)}`
					)
				}
				actions={
					editor ? (
						<>
							{post.status === "scheduled" ? (
								<Button
									variant="outline"
									loading={actions.unschedule.isPending}
									onClick={() => actions.unschedule.mutate()}
								>
									<CalendarX2 />
									Unschedule
								</Button>
							) : null}
							{anyPublished && canBoost ? (
								<Button variant="outline" asChild>
									<Link href={`/ads/campaigns/new?post=${post.id}`}>
										<Megaphone />
										Boost this post
									</Link>
								</Button>
							) : null}
							{canPublishNow ? (
								<Button
									variant="outline"
									loading={actions.publishNow.isPending}
									onClick={() => actions.publishNow.mutate()}
								>
									<Send />
									Publish now
								</Button>
							) : null}
							{editable ? (
								<Button asChild>
									<Link href={`/posts/${post.id}/edit`}>
										<Pencil />
										Edit
									</Link>
								</Button>
							) : null}
							<Button
								variant="danger-outline"
								size="icon"
								aria-label="Delete post"
								onClick={() => setConfirmDelete(true)}
							>
								<Trash2 />
							</Button>
						</>
					) : null
				}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="grid min-w-0 gap-6">
					<Card>
						<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
							<CardTitle>Content</CardTitle>
							<span className="font-mono text-muted-foreground text-xs tabular-nums">
								{textLength(post.content)} chars
								{post.media.length ? ` · ${pluralize(post.media.length, "attachment")}` : ""}
							</span>
						</CardHeader>
						<CardContent className="grid gap-4">
							{post.content ? (
								<p className="whitespace-pre-wrap text-[15px] leading-relaxed">{post.content}</p>
							) : (
								<p className="text-muted-foreground text-sm italic">No main text.</p>
							)}
							{post.media.length ? (
								<ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
									{post.media.map((m) => (
										<li key={m.id}>
											<a
												href={m.url}
												target="_blank"
												rel="noreferrer"
												aria-label={`Open ${m.fileName}`}
												className="block rounded-xl transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
											>
												<MediaThumb asset={m} className="rounded-xl ring-1 ring-border" />
											</a>
										</li>
									))}
								</ul>
							) : null}
						</CardContent>
					</Card>
					<Card className="overflow-hidden">
						<CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-border border-b pb-4">
							<CardTitle>
								Channels{" "}
								<span className="font-mono font-normal text-muted-foreground text-sm tabular-nums">
									{post.targets.length}
								</span>
							</CardTitle>
							<DeliverySummary post={post} />
						</CardHeader>
						<ul className="divide-y divide-border">
							{post.targets.map((t) => (
								<TargetCard
									key={t.id}
									target={t}
									timeZone={org.timezone}
									canRetry={editor}
									retrying={actions.retry.isPending && actions.retry.variables?.targetId === t.id}
									onRetry={(confirmNotPublished) =>
										actions.retry
											.mutateAsync({ targetId: t.id, confirmNotPublished })
											.catch(() => undefined)
									}
								/>
							))}
						</ul>
					</Card>
					{anyPublished ? <PostPerformance postId={post.id} /> : null}
				</div>
				<Card className="lg:sticky lg:top-20">
					<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
						<CardTitle>Activity</CardTitle>
						{post.events.length ? (
							<span className="font-mono text-muted-foreground text-xs tabular-nums">
								{pluralize(post.events.length, "event")}
							</span>
						) : null}
					</CardHeader>
					<CardContent>
						<PostTimeline post={post} timeZone={org.timezone} />
					</CardContent>
				</Card>
			</div>

			<ConfirmDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title="Delete this post?"
				description={
					anyPublished
						? "Anything not yet sent is canceled. Copies already published stay on the platforms — delete those there if needed."
						: "Scheduled sends are canceled and the post is removed from SocialFly."
				}
				confirmLabel="Delete post"
				tone="danger"
				loading={actions.remove.isPending}
				onConfirm={() => actions.remove.mutate()}
			/>
		</>
	);
}

/** "2 published · 1 failed": per-status counts of the post's targets, most urgent first. */
function DeliverySummary({ post }: { post: PostDetail }) {
	const counts = new Map<TargetStatus, number>();
	for (const t of post.targets) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
	const order: TargetStatus[] = ["failed", "unconfirmed", "published"];
	const entries = [...counts.entries()].sort(
		([a], [b]) =>
			(order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
			(order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
	);
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{entries.map(([status, n]) => (
				<Badge key={status} tone={TARGET_STATUS[status].tone}>
					<span className="font-mono tabular-nums">{n}</span>{" "}
					{TARGET_STATUS[status].label.toLowerCase()}
				</Badge>
			))}
		</div>
	);
}
