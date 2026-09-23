"use client";

import { NativeSelect } from "@socialfly/ui/components/select";
import { type ComponentProps, useMemo } from "react";
import { zoneLabel } from "@/lib/format";
import { allTimeZones } from "@/lib/timezone";

type Props = Omit<ComponentProps<"select">, "onChange" | "value"> & {
	value: string;
	onValueChange: (zone: string) => void;
};

/** Every IANA zone, grouped by region, with its current short offset. */
export function TimezoneSelect({ value, onValueChange, ...props }: Props) {
	const groups = useMemo(() => {
		const now = new Date();
		const byRegion = new Map<string, { zone: string; label: string }[]>();
		const zones = allTimeZones();
		if (value && !zones.includes(value)) zones.unshift(value);
		for (const zone of zones) {
			const region = zone.includes("/") ? (zone.split("/")[0] ?? "Other") : "Other";
			const city = zone.includes("/") ? zone.slice(zone.indexOf("/") + 1) : zone;
			const list = byRegion.get(region) ?? [];
			list.push({
				zone,
				label: `${city.replace(/_/g, " ").replace(/\//g, " / ")} (${zoneLabel(zone, now)})`,
			});
			byRegion.set(region, list);
		}
		return [...byRegion.entries()];
	}, [value]);

	return (
		<NativeSelect value={value} onChange={(e) => onValueChange(e.target.value)} {...props}>
			{groups.map(([region, zones]) => (
				<optgroup key={region} label={region}>
					{zones.map((z) => (
						<option key={z.zone} value={z.zone}>
							{z.label}
						</option>
					))}
				</optgroup>
			))}
		</NativeSelect>
	);
}
