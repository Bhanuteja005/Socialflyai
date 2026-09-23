import { api, call } from "./api-client";
import type { MediaAsset } from "./api-types";
import { ApiError } from "./errors";

/** What the API accepts at all (each platform narrows this further). */
export const ACCEPTED_MIME = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"video/mp4",
	"video/quicktime",
] as const;

export const ACCEPT_ATTR = ACCEPTED_MIME.join(",");

export const isAcceptedFile = (file: File) =>
	(ACCEPTED_MIME as readonly string[]).includes(file.type);

type Dimensions = { width?: number; height?: number; durationMs?: number };

/** Reads width/height (and duration for video) locally, before the API marks the file ready. */
export function measureFile(file: File): Promise<Dimensions> {
	const url = URL.createObjectURL(file);
	const done = (dims: Dimensions) => {
		URL.revokeObjectURL(url);
		return dims;
	};
	return new Promise((resolve) => {
		if (file.type.startsWith("image/")) {
			const img = new Image();
			img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight }));
			img.onerror = () => resolve(done({}));
			img.src = url;
			return;
		}
		const video = document.createElement("video");
		video.preload = "metadata";
		video.muted = true;
		video.onloadedmetadata = () =>
			resolve(
				done({
					width: video.videoWidth || undefined,
					height: video.videoHeight || undefined,
					durationMs: Number.isFinite(video.duration)
						? Math.round(video.duration * 1000)
						: undefined,
				}),
			);
		video.onerror = () => resolve(done({}));
		video.src = url;
	});
}

/** PUT with progress events (fetch can't report upload progress). No credentials: it's a presigned URL. */
function putWithProgress(
	url: string,
	file: File,
	headers: Record<string, string>,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal,
) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress(e.loaded / e.total);
		};
		xhr.onload = () =>
			xhr.status >= 200 && xhr.status < 300
				? resolve()
				: reject(
						new ApiError(xhr.status, "upload_failed", "The file couldn't be uploaded to storage."),
					);
		xhr.onerror = () =>
			reject(new ApiError(0, "network_error", "Upload failed. Check your connection."));
		xhr.onabort = () => reject(new ApiError(0, "upload_aborted", "Upload canceled."));
		signal?.addEventListener("abort", () => xhr.abort());
		xhr.send(file);
	});
}

/** The whole flow: reserve → PUT to storage → measure → complete. */
export async function uploadMedia(
	file: File,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal,
): Promise<MediaAsset> {
	if (!isAcceptedFile(file)) {
		throw new ApiError(
			400,
			"unsupported_type",
			`${file.type || "This file type"} isn't supported. Use JPG, PNG, GIF, WebP, MP4 or MOV.`,
		);
	}
	const [{ asset, upload }, dims] = await Promise.all([
		call(
			api.media.uploads.$post({
				json: { fileName: file.name, mimeType: file.type, sizeBytes: file.size },
			}),
		),
		measureFile(file),
	]);
	await putWithProgress(upload.url, file, upload.headers, onProgress, signal);
	return call(api.media[":id"].complete.$post({ param: { id: asset.id }, json: dims }));
}
