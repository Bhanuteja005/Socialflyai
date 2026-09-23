"use client";

import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { Plus } from "lucide-react";
import { useProviders } from "@/hooks/queries";
import { useConnectChannel } from "@/hooks/use-connect-channel";
import { providerMeta } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";

export function ConnectGrid() {
	const { can } = useOrg();
	const { data: providers, isPending } = useProviders();
	const connect = useConnectChannel();
	const allowed = can("admin");

	if (isPending) {
		return (
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{["a", "b", "c"].map((k) => (
					<Skeleton key={k} className="h-28" />
				))}
			</div>
		);
	}

	if (!providers?.length) {
		return (
			<p className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
				No platforms are configured on this SocialFly server yet.
			</p>
		);
	}

	return (
		<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{providers.map((p) => {
				const meta = providerMeta(p.id);
				const pending = connect.isPending && connect.variables === p.id;
				const button = (
					<Button
						variant="outline"
						size="sm"
						disabled={!allowed || connect.isPending}
						loading={pending}
						onClick={() => connect.mutate(p.id)}
						aria-label={`Connect ${p.name}`}
					>
						{pending ? null : <Plus />}
						Connect
					</Button>
				);
				return (
					<li
						key={p.id}
						className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-xs transition-colors hover:border-border-strong"
					>
						<div className="flex items-center gap-3">
							<ProviderIcon provider={p.id} size="md" />
							<p className="font-medium text-sm">{p.name}</p>
						</div>
						<p className="flex-1 text-muted-foreground text-xs leading-relaxed">
							{meta.description}
						</p>
						<div>
							{allowed ? (
								button
							) : (
								<Tooltip content="Only admins can connect channels">
									<span className="inline-flex">{button}</span>
								</Tooltip>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
