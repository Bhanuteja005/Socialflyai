"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { SectionHeader } from "@socialfly/ui/components/page";
import { toast } from "@socialfly/ui/components/toast";
import { Plus, Radio } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useChannels } from "@/hooks/queries";
import { connectErrorMessage } from "@/hooks/use-connect-channel";
import { errorMessage } from "@/lib/errors";
import { providerName } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ChannelList } from "./channel-list";
import { ConnectGrid } from "./connect-grid";

/** Toasts for the OAuth round trip (`?connected=` / `?error=`), then cleans the URL. */
function useConnectResultToast() {
	const params = useSearchParams();
	const router = useRouter();
	const handled = useRef(false);
	useEffect(() => {
		if (handled.current) return;
		const connected = params.get("connected");
		const error = params.get("error");
		if (!connected && !error) return;
		handled.current = true;
		if (connected) toast.success(`${providerName(connected)} connected`);
		if (error) {
			const provider = params.get("provider");
			toast.error(provider ? `Couldn't connect ${providerName(provider)}` : "Couldn't connect", {
				description: connectErrorMessage(error),
			});
		}
		router.replace("/channels", { scroll: false });
	}, [params, router]);
}

export function ChannelsView() {
	useConnectResultToast();
	const { can } = useOrg();
	const { data: channels, isPending, isError, error, refetch } = useChannels();
	const broken = channels?.filter((c) => c.status === "needs_reauth").length ?? 0;

	return (
		<>
			<PageHeader
				title="Channels"
				description="The social accounts this organization publishes to."
				actions={
					can("admin") ? (
						<Button asChild>
							<a href="#connect">
								<Plus />
								Connect channel
							</a>
						</Button>
					) : null
				}
			/>
			<section aria-labelledby="connected-heading" className="mb-10">
				<SectionHeader
					title={<span id="connected-heading">Connected accounts</span>}
					description={
						channels?.length
							? `${channels.length} connected${broken ? ` · ${broken} to reconnect` : ""}`
							: undefined
					}
					actions={
						channels?.length ? (
							broken ? (
								<Badge tone="warning" dot>
									Action needed
								</Badge>
							) : (
								<Badge tone="success" dot>
									All healthy
								</Badge>
							)
						) : null
					}
				/>
				{isPending ? (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{["a", "b", "c"].map((k) => (
							<Skeleton key={k} className="h-32 rounded-xl" />
						))}
					</div>
				) : isError ? (
					<EmptyState
						title="Couldn't load channels"
						description={errorMessage(error)}
						action={
							<Button variant="outline" onClick={() => refetch()}>
								Retry
							</Button>
						}
					/>
				) : channels.length === 0 ? (
					<EmptyState
						icon={Radio}
						title="No channels yet"
						description="Connect a social account below to start scheduling posts."
					/>
				) : (
					<ChannelList channels={channels} />
				)}
			</section>
			<section id="connect" aria-labelledby="connect-heading" className="scroll-mt-20">
				<SectionHeader
					title={<span id="connect-heading">Add a channel</span>}
					description="Posting to a platform needs its account connected here once."
				/>
				<ConnectGrid />
			</section>
		</>
	);
}
