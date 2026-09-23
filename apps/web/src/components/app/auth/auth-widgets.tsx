"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { googleSignInUrl } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const NEXT_STORAGE_KEY = "sf-auth-next";

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
	return (
		<div className="mb-6 grid gap-1.5 text-center">
			<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
			{description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
		</div>
	);
}

function GoogleMark() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09"
			/>
			<path
				fill="#34A853"
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23"
			/>
			<path
				fill="#FBBC05"
				d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95z"
			/>
			<path
				fill="#EA4335"
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38"
			/>
		</svg>
	);
}

/** Full-page redirect to Google via the auth service; `next` survives the round trip in sessionStorage. */
export function GoogleButton({
	next,
	label = "Continue with Google",
}: {
	next?: string;
	label?: string;
}) {
	const [pending, setPending] = useState(false);
	return (
		<Button
			variant="outline"
			size="lg"
			className="w-full"
			loading={pending}
			onClick={() => {
				setPending(true);
				try {
					if (next) sessionStorage.setItem(NEXT_STORAGE_KEY, next);
				} catch {
					// Without storage the user lands on the dashboard instead.
				}
				window.location.assign(googleSignInUrl());
			}}
		>
			{pending ? null : <GoogleMark />}
			{label}
		</Button>
	);
}

export function Divider({ children }: { children: ReactNode }) {
	return (
		<div className="my-5 flex items-center gap-3 text-subtle-foreground text-xs uppercase tracking-wider">
			<span className="h-px flex-1 bg-border" />
			{children}
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}

export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
	const [visible, setVisible] = useState(false);
	return (
		<div className="relative">
			<Input type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
			<button
				type="button"
				onClick={() => setVisible((v) => !v)}
				className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				aria-label={visible ? "Hide password" : "Show password"}
				aria-pressed={visible}
			>
				{visible ? (
					<EyeOff className="size-4" aria-hidden="true" />
				) : (
					<Eye className="size-4" aria-hidden="true" />
				)}
			</button>
		</div>
	);
}

const RULES: [string, (p: string) => boolean][] = [
	["10+ characters", (p) => p.length >= 10],
	["Upper & lower case", (p) => /[a-z]/.test(p) && /[A-Z]/.test(p)],
	["A number", (p) => /\d/.test(p)],
	["A symbol", (p) => /[^A-Za-z0-9]/.test(p)],
];

/** Live checklist of the server's password rule. */
export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
	return (
		<ul
			id={id}
			className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"
			aria-label="Password requirements"
		>
			{RULES.map(([label, test]) => {
				const ok = test(password);
				return (
					<li
						key={label}
						className={cn(
							"flex items-center gap-1.5",
							ok ? "text-success" : "text-muted-foreground",
						)}
					>
						<span
							className={cn(
								"flex size-3.5 items-center justify-center rounded-full border",
								ok ? "border-success bg-success text-white" : "border-border-strong",
							)}
							aria-hidden="true"
						>
							{ok ? <Check className="size-2.5" strokeWidth={3} /> : null}
						</span>
						{label}
						<span className="sr-only">{ok ? "(met)" : "(not met)"}</span>
					</li>
				);
			})}
		</ul>
	);
}
