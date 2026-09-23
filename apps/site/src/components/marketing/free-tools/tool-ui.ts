import { toast } from "@socialfly/ui/components/toast";

/** Dark, roomy form-control styling shared by the interactive free tools. */
export const toolControl =
	"w-full min-w-0 rounded-2xl border border-white/10 bg-black/50 px-5 py-3.5 text-base text-white placeholder:text-white/30 transition-colors focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10";

export const toolLabel = "mb-2 block font-bold text-white/60 text-xs uppercase tracking-widest";

export const toolPanel =
	"rounded-[32px] border border-white/10 bg-white/5 p-5 text-left shadow-2xl backdrop-blur-md sm:p-8";

export const toolButtonPrimary =
	"inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const toolButtonSecondary =
	"inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-sm text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

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
