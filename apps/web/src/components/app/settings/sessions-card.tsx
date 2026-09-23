"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, LogOut, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { useSignOut } from "@/hooks/use-session";
import { type ActiveSession, authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { qk } from "@/lib/query-keys";

/** "Chrome on Windows" from a user agent string — good enough for recognising devices. */
function describeAgent(ua: string | null) {
	if (!ua) return { label: "Unknown device", mobile: false };
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /Firefox\//.test(ua)
			? "Firefox"
			: /Chrome\//.test(ua)
				? "Chrome"
				: /Safari\//.test(ua)
					? "Safari"
					: "Browser";
	const os = /Windows/.test(ua)
		? "Windows"
		: /iPhone|iPad/.test(ua)
			? "iOS"
			: /Android/.test(ua)
				? "Android"
				: /Mac OS X/.test(ua)
					? "macOS"
					: /Linux/.test(ua)
						? "Linux"
						: "";
	return { label: os ? `${browser} on ${os}` : browser, mobile: /Mobile|iPhone|Android/.test(ua) };
}

export function SessionsCard() {
	const queryClient = useQueryClient();
	const signOut = useSignOut();
	const sessions = useQuery({
		queryKey: qk.authSessions,
		queryFn: authClient.sessions,
		select: (d) => d.sessions,
	});

	const revoke = useMutation({
		mutationFn: (id: string) => authClient.revokeSession(id),
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: qk.authSessions });
			const previous = queryClient.getQueryData<{ sessions: ActiveSession[] }>(qk.authSessions);
			queryClient.setQueryData<{ sessions: ActiveSession[] }>(qk.authSessions, (prev) =>
				prev ? { sessions: prev.sessions.filter((s) => s.id !== id) } : prev,
			);
			return { previous };
		},
		onError: (e, _id, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(qk.authSessions, ctx.previous);
			toast.error(errorMessage(e));
		},
		onSuccess: () => toast.success("Session signed out"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Active sessions</CardTitle>
				<CardDescription>
					Devices signed in to your account. Sign out any you don't recognise.
				</CardDescription>
			</CardHeader>
			<CardContent className="px-0 pb-2">
				{sessions.isPending ? (
					<div className="grid gap-2 px-5">
						<Skeleton className="h-12" />
						<Skeleton className="h-12" />
					</div>
				) : sessions.isError ? (
					<p className="px-5 text-danger text-sm">{errorMessage(sessions.error)}</p>
				) : (
					<ul className="divide-y divide-border">
						{sessions.data.map((s) => {
							const agent = describeAgent(s.userAgent);
							const Icon = agent.mobile ? Smartphone : Laptop;
							return (
								<li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
									<span className="flex size-9 items-center justify-center rounded-md bg-muted">
										<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
									</span>
									<div className="grid min-w-0 flex-1">
										<p className="flex items-center gap-2 font-medium text-sm">
											{agent.label}
											{s.current ? <Badge tone="primary">This device</Badge> : null}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{s.ip ? `${s.ip} · ` : ""}
											{s.lastUsedAt
												? `Active ${formatRelative(s.lastUsedAt)}`
												: `Signed in ${formatRelative(s.authenticatedAt)}`}
										</p>
									</div>
									{s.current ? null : (
										<Button
											variant="outline"
											size="sm"
											loading={revoke.isPending && revoke.variables === s.id}
											onClick={() => revoke.mutate(s.id)}
										>
											Sign out
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
			<CardFooter className="justify-start">
				<Button variant="ghost" onClick={() => void signOut()}>
					<LogOut />
					Sign out of this device
				</Button>
			</CardFooter>
		</Card>
	);
}
