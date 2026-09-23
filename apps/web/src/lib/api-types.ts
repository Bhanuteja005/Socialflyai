import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "./api-client";

// Response shapes, inferred from the API's route types — never hand-written.

export type Organization = InferResponseType<
	typeof api.organizations.$get,
	200
>["organizations"][number];
export type Role = Organization["role"];
export type Member = InferResponseType<
	typeof api.organization.members.$get,
	200
>["members"][number];
export type Invitation = InferResponseType<
	typeof api.organization.invitations.$get,
	200
>["invitations"][number];

export type ProviderInfo = InferResponseType<
	typeof api.channels.providers.$get,
	200
>["providers"][number];
export type Capabilities = ProviderInfo["capabilities"];
export type Channel = InferResponseType<typeof api.channels.$get, 200>["channels"][number];
export type ChannelStatus = Channel["status"];
export type Selection = InferResponseType<
	(typeof api.channels.selections)[":selectionId"]["$get"],
	200
>;

export type MediaPage = InferResponseType<typeof api.media.$get, 200>;
export type MediaAsset = MediaPage["items"][number];

export type Post = InferResponseType<typeof api.posts.$get, 200>["posts"][number];
export type PostDetail = InferResponseType<(typeof api.posts)[":id"]["$get"], 200>;
export type PostTarget = Post["targets"][number];
export type PostEvent = PostDetail["events"][number];
export type PostStatus = Post["status"];
export type TargetStatus = PostTarget["status"];
export type ValidationResult = InferResponseType<typeof api.posts.validate.$post, 200>;

export type CreatePostInput = InferRequestType<typeof api.posts.$post>["json"];
export type PostsQuery = InferRequestType<typeof api.posts.$get>["query"];
