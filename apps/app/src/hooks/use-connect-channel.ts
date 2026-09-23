"use client";

import { toast } from "@socialfly/ui/components/toast";
import { useMutation } from "@tanstack/react-query";
import { api, call } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";

/** Starts OAuth for a platform and sends the browser to its consent screen. */
export function useConnectChannel() {
	return useMutation({
		mutationFn: (provider: string) =>
			call(api.channels.connect[":provider"].$post({ param: { provider } })),
		onSuccess: ({ url }) => window.location.assign(url),
		onError: (error) => toast.error(errorMessage(error, "Couldn't start the connection")),
	});
}

const CONNECT_ERRORS: Record<string, string> = {
	connect_expired: "The connection took too long. Please try again.",
	connect_mismatch: "Something went wrong with the connection. Please try again.",
	connect_denied: "Permission wasn't granted, so nothing was connected.",
	no_accounts: "We didn't find any accounts you can post to with that login.",
	connect_auth: "The platform rejected the sign-in. Please try again.",
	connect_rate_limited: "The platform is rate limiting us. Try again in a few minutes.",
	connect_invalid_request: "The platform rejected the request. Check your account's permissions.",
	connect_transient: "The platform had a temporary problem. Please try again.",
	connect_unknown_outcome: "We couldn't confirm the connection. Check your channels and try again.",
	connect_failed: "Connecting failed. Please try again.",
};

export const connectErrorMessage = (code: string) =>
	CONNECT_ERRORS[code] ?? "Connecting failed. Please try again.";
