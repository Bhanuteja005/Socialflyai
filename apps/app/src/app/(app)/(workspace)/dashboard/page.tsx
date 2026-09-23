import type { Metadata } from "next";
import { DashboardView } from "@/components/app/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
	return <DashboardView />;
}
