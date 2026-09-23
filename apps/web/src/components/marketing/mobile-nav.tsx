"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { focusRing } from "./primitives";
import { PRIMARY_NAV } from "./site-config";

/** Hamburger menu shown below the `lg` breakpoint. */
export function MobileNav() {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const close = () => setOpen(false);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<div className="lg:hidden">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				aria-label={open ? "Close menu" : "Open menu"}
				onClick={() => setOpen((value) => !value)}
				className={`flex size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white ${focusRing}`}
			>
				{open ? (
					<X className="size-5" aria-hidden="true" />
				) : (
					<Menu className="size-5" aria-hidden="true" />
				)}
			</button>
			<div
				id={panelId}
				hidden={!open}
				className="absolute inset-x-0 top-[calc(100%+0.5rem)] rounded-3xl border border-white/10 bg-black/95 p-3 shadow-2xl backdrop-blur-md"
			>
				<ul className="flex flex-col">
					{PRIMARY_NAV.map((link) => (
						<li key={link.href}>
							<Link
								href={link.href}
								onClick={close}
								className={`block rounded-2xl px-4 py-3 text-base text-white/80 hover:bg-white/5 hover:text-white ${focusRing}`}
							>
								{link.label}
							</Link>
						</li>
					))}
					<li className="mt-2 border-white/10 border-t pt-2">
						<Link
							href="/login"
							onClick={close}
							className={`block rounded-2xl px-4 py-3 text-base text-white/80 hover:bg-white/5 hover:text-white ${focusRing}`}
						>
							Log in
						</Link>
					</li>
				</ul>
			</div>
		</div>
	);
}
