"use client";

import { Radio } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { useChannels } from "@/hooks/queries";
import { connectErrorMessage } from "@/hooks/use-connect-channel";
import { errorMessage } from "@/lib/errors";
import { providerName } from "@/lib/providers";
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
	const { data: channels, isPending, isError, error, refetch } = useChannels();

	return (
		<>
			<PageHeader
				title="Channels"
				description="The social accounts this organization publishes to."
			/>
			<section aria-labelledby="connected-heading" className="mb-10">
				<h2 id="connected-heading" className="mb-3 font-medium text-muted-foreground text-sm">
					Connected
				</h2>
				{isPending ? (
					<div className="grid gap-2">
						{["a", "b"].map((k) => (
							<Skeleton key={k} className="h-16" />
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
			<section aria-labelledby="connect-heading">
				<h2 id="connect-heading" className="mb-3 font-medium text-muted-foreground text-sm">
					Connect a new channel
				</h2>
				<ConnectGrid />
			</section>
		</>
	);
}
