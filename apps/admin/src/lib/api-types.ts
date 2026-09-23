import type { InferRequestType, InferResponseType } from "hono/client";
import type { adminApi } from "./api-client";

// Response shapes, inferred from the API's route types — never hand-written.
type Admin = typeof adminApi;

export type AdminMe = InferResponseType<Admin["me"]["$get"], 200>;
export type Overview = InferResponseType<Admin["overview"]["$get"], 200>;
export type PostStatus = keyof Overview["posts"]["byStatus"];
export type GenerationStatus = keyof Overview["ai"]["generations"]["byStatus"];

export type OrgPage = InferResponseType<Admin["organizations"]["$get"], 200>;
export type OrgSummary = OrgPage["items"][number];
export type OrgDetail = InferResponseType<Admin["organizations"][":id"]["$get"], 200>;
export type OrgMember = OrgDetail["members"][number];
export type OrgChannel = OrgDetail["channels"][number];
export type ChannelStatus = OrgChannel["status"];
export type UpdateOrgInput = InferRequestType<Admin["organizations"][":id"]["$patch"]>["json"];

export type UserPage = InferResponseType<Admin["users"]["$get"], 200>;
export type AdminUser = UserPage["items"][number];
export type UserStatus = AdminUser["status"];

export type TargetPage = InferResponseType<Admin["publishing"]["targets"]["$get"], 200>;
export type AdminTarget = TargetPage["items"][number];
/** The two states the endpoint lists (the row type itself is the full target status enum). */
export type AdminTargetStatus = NonNullable<
	InferRequestType<Admin["publishing"]["targets"]["$get"]>["query"]["status"]
>;

export type GenerationsQuery = InferRequestType<Admin["ai"]["generations"]["$get"]>["query"];
export type GenerationPage = InferResponseType<Admin["ai"]["generations"]["$get"], 200>;
export type AdminGeneration = GenerationPage["items"][number];
export type GenerationKind = AdminGeneration["kind"];

export type QueueStats = InferResponseType<Admin["queues"]["$get"], 200>["queues"][number];

export type AuditPage = InferResponseType<Admin["audit"]["$get"], 200>;
export type AuditEvent = AuditPage["items"][number];
