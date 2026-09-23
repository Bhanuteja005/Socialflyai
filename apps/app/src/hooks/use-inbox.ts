"use client";

import { toast } from "@socialfly/ui/components/toast";
import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useOrg } from "@/components/app/org-provider";
import { api, call, callVoid } from "@/lib/api-client";
import type {
	InboxDraftInput,
	InboxItem,
	InboxItemDetail,
	InboxItemStatus,
	InboxItemsPage,
	InboxItemsQuery,
	ListeningInput,
} from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { pluralize } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useAfterAiCall } from "./use-ai";
import { retryAfterSeconds } from "./use-research";

const PAGE_SIZE = 30;
/** Comments arrive through background syncs; a minute of staleness is honest and cheap. */
const COUNTS_POLL_MS = 60_000;

export function useInboxItems(query: Omit<InboxItemsQuery, "before" | "limit">, enabled = true) {
	const { orgId } = useOrg();
	return useInfiniteQuery({
		queryKey: qk.inboxItems(orgId, query),
		queryFn: ({ pageParam }) =>
			call(
				api.inbox.items.$get({
					query: { ...query, before: pageParam ?? undefined, limit: String(PAGE_SIZE) },
				}),
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		placeholderData: (prev) => prev,
		enabled,
	});
}

/** Unread / open / awaiting-approval counts, for the sidebar badge and the tab badges. */
export function useInboxCounts() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.inboxCounts(orgId),
		queryFn: () => call(api.inbox.items.$get({ query: { status: "new", limit: "1" } })),
		select: (d) => d.counts,
		refetchInterval: COUNTS_POLL_MS,
		staleTime: COUNTS_POLL_MS / 2,
	});
}

export function useInboxItem(id: string | null) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.inboxItem(orgId, id ?? ""),
		queryFn: () => call(api.inbox.items[":id"].$get({ param: { id: id ?? "" } })),
		enabled: Boolean(id),
		// A reply on its way: follow it until it lands (or needs a human).
		refetchInterval: (q) =>
			q.state.data?.replies.some((r) => ["approved", "queued", "sending"].includes(r.status))
				? 4_000
				: false,
	});
}

type ItemsCache = InfiniteData<InboxItemsPage, string | null>;

/** Status changes are shown immediately in every cached list and detail, then confirmed. */
function usePatchItemsCache() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return (ids: string[], patch: Partial<Pick<InboxItem, "status">>) => {
		const set = new Set(ids);
		queryClient.setQueriesData<ItemsCache>(
			{ queryKey: [...qk.inboxItemsAll(orgId), "list"] },
			(old) =>
				old
					? {
							...old,
							pages: old.pages.map((p) => ({
								...p,
								items: p.items.map((i) => (set.has(i.id) ? { ...i, ...patch } : i)),
							})),
						}
					: old,
		);
		for (const id of ids) {
			queryClient.setQueryData<InboxItemDetail>(qk.inboxItem(orgId, id), (old) =>
				old ? { ...old, ...patch } : old,
			);
		}
	};
}

function useInvalidateInbox() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: qk.inboxItemsAll(orgId) });
		void queryClient.invalidateQueries({ queryKey: qk.inboxCounts(orgId) });
		void queryClient.invalidateQueries({ queryKey: qk.inboxApprovals(orgId) });
	};
}

const STATUS_DONE: Partial<Record<InboxItemStatus, string>> = {
	read: "Marked as read",
	new: "Marked as unread",
	archived: "Archived",
	spam: "Marked as spam",
};

export function useSetItemStatus() {
	const patch = usePatchItemsCache();
	const invalidate = useInvalidateInbox();
	return useMutation({
		mutationFn: ({ ids, status }: { ids: string[]; status: InboxItemStatus; quiet?: boolean }) =>
			ids.length === 1 && ids[0]
				? call(api.inbox.items[":id"].$patch({ param: { id: ids[0] }, json: { status } })).then(
						() => ({ updated: 1 }),
					)
				: call(api.inbox.items.$patch({ json: { ids, status } })),
		onMutate: ({ ids, status }) => patch(ids, { status }),
		onSuccess: (_r, { ids, status, quiet }) => {
			const label = STATUS_DONE[status];
			if (!quiet && label)
				toast.success(ids.length > 1 ? `${label}: ${pluralize(ids.length, "item")}` : label);
		},
		onError: (e) => toast.error(errorMessage(e)),
		onSettled: invalidate,
	});
}

// ── Replies ─────────────────────────────────────────────────────────────────

export function useDraftReply(itemId: string) {
	const afterAiCall = useAfterAiCall();
	return useMutation({
		mutationFn: (json: InboxDraftInput) =>
			call(api.inbox.items[":id"].draft.$post({ param: { id: itemId }, json })),
		onSettled: afterAiCall,
	});
}

/** Everything that changes a reply refreshes its conversation, the lists and the approvals queue. */
function useAfterReplyChange(itemId?: string) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const invalidate = useInvalidateInbox();
	return () => {
		if (itemId) void queryClient.invalidateQueries({ queryKey: qk.inboxItem(orgId, itemId) });
		invalidate();
	};
}

export function useCreateReply(itemId: string) {
	const onSettled = useAfterReplyChange(itemId);
	return useMutation({
		mutationFn: (json: { text: string; source: "ai" | "human"; submit: boolean }) =>
			call(api.inbox.items[":id"].replies.$post({ param: { id: itemId }, json })),
		onSettled,
	});
}

export function useReplyMutations(itemId?: string) {
	const onSettled = useAfterReplyChange(itemId);
	const onError = (e: unknown) => toast.error(errorMessage(e));
	const update = useMutation({
		mutationFn: ({ id, ...json }: { id: string; text?: string; submit?: boolean }) =>
			call(api.inbox.replies[":id"].$patch({ param: { id }, json })),
		onSettled,
	});
	const approve = useMutation({
		mutationFn: (id: string) => call(api.inbox.replies[":id"].approve.$post({ param: { id } })),
		onSuccess: () => toast.success("Approved. The reply is on its way."),
		onError,
		onSettled,
	});
	const reject = useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) =>
			call(api.inbox.replies[":id"].reject.$post({ param: { id }, json: { reason } })),
		onSuccess: () => toast.success("Reply rejected. The author can see your reason."),
		onError,
		onSettled,
	});
	const retry = useMutation({
		mutationFn: ({ id, confirmNotSent }: { id: string; confirmNotSent?: boolean }) =>
			call(
				api.inbox.replies[":id"].retry.$post({
					param: { id },
					json: confirmNotSent ? { confirmNotSent } : {},
				}),
			),
		onSuccess: () => toast.success("Trying again. We'll post it in a moment."),
		onError,
		onSettled,
	});
	const remove = useMutation({
		mutationFn: (id: string) => callVoid(api.inbox.replies[":id"].$delete({ param: { id } })),
		onSuccess: () => toast.success("Reply deleted"),
		onError,
		onSettled,
	});
	return { update, approve, reject, retry, remove };
}

export function useApprovals(enabled: boolean) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.inboxApprovals(orgId),
		queryFn: () => call(api.inbox.approvals.$get()),
		enabled,
	});
}

// ── Listening ───────────────────────────────────────────────────────────────

export const MAX_LISTENING = 10;

export function useListening() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.inboxListening(orgId),
		queryFn: () => call(api.inbox.listening.$get()),
	});
}

export function useListeningMutations() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const onSettled = () =>
		void queryClient.invalidateQueries({ queryKey: qk.inboxListening(orgId) });
	const onError = (e: unknown) => toast.error(errorMessage(e));
	const create = useMutation({
		mutationFn: (json: ListeningInput) => call(api.inbox.listening.$post({ json })),
		onSettled,
	});
	const update = useMutation({
		mutationFn: ({
			id,
			...json
		}: {
			id: string;
			query?: string;
			providers?: ListeningInput["providers"];
			active?: boolean;
		}) => call(api.inbox.listening[":id"].$patch({ param: { id }, json })),
		onSettled,
	});
	const remove = useMutation({
		mutationFn: (id: string) => callVoid(api.inbox.listening[":id"].$delete({ param: { id } })),
		onSuccess: () => toast.success("Listening query deleted"),
		onError,
		onSettled,
	});
	return { create, update, remove };
}

// ── Settings & sync ─────────────────────────────────────────────────────────

export function useInboxSettings(enabled = true) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.inboxSettings(orgId),
		queryFn: () => call(api.inbox.settings.$get()),
		enabled,
	});
}

export function useUpdateInboxSettings() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (json: { replyApprovalRequired: boolean }) =>
			call(api.inbox.settings.$patch({ json })),
		onSuccess: (_r, { replyApprovalRequired }) =>
			toast.success(
				replyApprovalRequired
					? "Replies from editors now need an admin's approval."
					: "Editors' replies are now sent straight away.",
			),
		onError: (e) => toast.error(errorMessage(e)),
		onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.inboxSettings(orgId) }),
	});
}

export function useSyncInbox() {
	const invalidate = useInvalidateInbox();
	return useMutation({
		mutationFn: () => call(api.inbox.sync.$post()),
		onSuccess: () => {
			toast.success("Checking your channels for new comments. They appear here in a minute.");
			// The sync runs in the worker; look again once it has had time to land.
			setTimeout(invalidate, 45_000);
		},
		onError: (e) => {
			const wait = retryAfterSeconds(e);
			if (wait !== null) {
				const minutes = Math.ceil(wait / 60);
				toast.error(
					`Synced recently. You can sync again in ${minutes <= 1 ? "a minute" : `${minutes} min`}.`,
				);
			} else {
				toast.error(errorMessage(e));
			}
		},
	});
}
