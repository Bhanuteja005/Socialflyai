import type { Metadata } from "next";
import { OrganizationsView } from "@/components/views/organizations-view";

export const metadata: Metadata = { title: "Organizations" };

export default function Page() {
	return <OrganizationsView />;
}
