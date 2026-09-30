import { toast } from "@socialfly/ui/components/toast";

/** Roomy form-control styling shared by the interactive free tools. */
export const toolControl =
	"w-full min-w-0 rounded-xl border border-input bg-surface-raised px-4 py-3 text-base text-foreground placeholder:text-subtle-foreground transition-colors focus-visible:border-ring focus-visible:outline-none";

export const toolLabel = "mb-2 block font-medium text-foreground text-sm";

export const toolPanel = "rounded-3xl border border-border bg-surface-raised p-5 text-left sm:p-8";

export const toolButtonPrimary =
	"inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-medium text-ink-foreground text-sm transition-colors hover:bg-ink-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const toolButtonSecondary =
	"inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface-raised px-5 py-2.5 font-medium text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Copy text to the clipboard and confirm with a toast. */
export async function copyToClipboard(text: string, successMessage = "Copied to clipboard") {
	if (!text) return;
	try {
		await navigator.clipboard.writeText(text);
		toast.success(successMessage);
	} catch {
		toast.error("Couldn't access the clipboard. Please copy the text manually.");
	}
}

/** Trigger a download of plain text content. */
export function downloadText(text: string, filename: string) {
	const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
