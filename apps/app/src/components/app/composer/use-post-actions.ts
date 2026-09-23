"use client";

import { toast } from "@socialfly/ui/components/toast";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, call } from "@/lib/api-client";
import type { PostDetail } from "@/lib/api-types";
import { errorMessage, isApiError, type PostInvalidTarget } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import type { Composer } from "./use-composer";

function useDebounced<T>(value: T, ms: number) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}

/** Debounced dry-run of the post against every selected platform. */
export function useLiveValidation(composer: Composer, enabled: boolean) {
	const { orgId } = useOrg();
	const payload = useMemo(
		() =>
			JSON.stringify({
				content: composer.state.content,
				mediaIds: composer.mediaIds,
				targets: composer.targets,
			}),
		[composer.state.content, composer.mediaIds, composer.targets],
	);
	const debounced = useDebounced(payload, 600);
	const query = useQuery({
		queryKey: ["org", orgId, "validate", debounced],
		queryFn: () => call(api.posts.validate.$post({ json: JSON.parse(debounced) })),
		enabled: enabled && composer.targets.length > 0,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
		retry: false,
	});
	return { ...query, settling: payload !== debounced || query.isFetching };
}

type SubmitAction = "draft" | "schedule" | "now";

/**
 * Create or update, then schedule. For an existing scheduled post, "save as draft"
 * unschedules FIRST — the API re-schedules edited scheduled posts, and without a
 * time that would mean "publish now".
 */
export function useSubmitPost(composer: Composer, existing?: PostDetail) {
	const { orgId, org } = useOrg();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [invalidTargets, setInvalidTargets] = useState<PostInvalidTarget[] | null>(null);

	const mutation = useMutation({
		mutationFn: async (action: SubmitAction) => {
			const scheduledAt = action === "now" ? null : (composer.scheduledAt?.toISOString() ?? null);
			const body = {
				content: composer.state.content,
				mediaIds: composer.mediaIds,
				targets: composer.targets,
				scheduledAt:
					action === "draft" ? (composer.state.mode === "later" ? scheduledAt : null) : scheduledAt,
			};

			if (!existing) {
				return call(
					api.posts.$post({
						json: { ...body, action: action === "draft" ? "draft" : "schedule" },
					}),
				);
			}

			const id = existing.id;
			const wasScheduled = existing.status === "scheduled";
			if (action === "draft") {
				if (wasScheduled) await call(api.posts[":id"].unschedule.$post({ param: { id } }));
				return call(api.posts[":id"].$put({ param: { id }, json: body }));
			}
			const updated = await call(api.posts[":id"].$put({ param: { id }, json: body }));
			// A scheduled post is re-scheduled by the update itself.
			if (wasScheduled) return updated;
			return call(api.posts[":id"].schedule.$post({ param: { id }, json: { scheduledAt } }));
		},
		onSuccess: (post, action) => {
			setInvalidTargets(null);
			composer.setDirty(false);
			queryClient.setQueryData(qk.post(orgId, post.id), post);
			void queryClient.invalidateQueries({ queryKey: qk.postsAll(orgId) });
			if (action === "draft") toast.success("Draft saved");
			else if (action === "now")
				toast.success("Publishing now", {
					description: "We'll update each channel's status as it goes out.",
				});
			else if (post.scheduledAt)
				toast.success(`Scheduled for ${formatDateTime(post.scheduledAt, org.timezone)}`);
			router.push(`/posts/${post.id}`);
		},
		onError: (error) => {
			if (isApiError(error) && error.code === "post_invalid") {
				setInvalidTargets(error.targets);
				toast.error(error.message, { description: "Fix the highlighted channels and try again." });
				return;
			}
			if (isApiError(error) && error.code === "post_locked") {
				toast.error(errorMessage(error));
				if (existing) router.push(`/posts/${existing.id}`);
				return;
			}
			toast.error(errorMessage(error));
		},
	});

	return { ...mutation, invalidTargets, clearInvalid: () => setInvalidTargets(null) };
}
