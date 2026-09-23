"use client";

import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `ms` (search boxes: one request per pause). */
export function useDebounced<T>(value: T, ms = 300): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}
