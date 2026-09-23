"use client";

import { useCallback, useState } from "react";
import { errorMessage, isApiError } from "@/lib/errors";

type FormErrors = { fields: Record<string, string>; form: string | null };

/**
 * Splits an API error into inline field errors (422 `details.fields`) and one
 * form-level message for everything else.
 */
export function useFormErrors() {
	const [errors, setErrors] = useState<FormErrors>({ fields: {}, form: null });

	const fromError = useCallback((error: unknown, fieldMap: Record<string, string> = {}) => {
		if (
			isApiError(error) &&
			error.code === "validation_failed" &&
			Object.keys(error.fields).length
		) {
			const fields: Record<string, string> = {};
			for (const [key, message] of Object.entries(error.fields))
				fields[fieldMap[key] ?? key] = message;
			setErrors({ fields, form: null });
			return;
		}
		setErrors({ fields: {}, form: errorMessage(error) });
	}, []);

	const setField = useCallback(
		(field: string, message: string | null) =>
			setErrors((prev) => {
				const fields = { ...prev.fields };
				if (message) fields[field] = message;
				else delete fields[field];
				return { ...prev, fields };
			}),
		[],
	);

	const reset = useCallback(() => setErrors({ fields: {}, form: null }), []);

	return { fields: errors.fields, form: errors.form, fromError, setField, reset, setErrors };
}
