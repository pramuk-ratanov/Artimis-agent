const MONTHS_SHORT = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTHS_LONG = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
] as const;

/**
 * Parse an ISO calendar date ("YYYY-MM-DD") into a local Date.
 * Splits manually so the value is treated as a plain calendar day,
 * not a UTC instant shifted by the local timezone offset.
 */
export function parseIsoCalendarDate(iso: string): Date {
	const [year, month, day] = String(iso).split("-").map(Number);
	return new Date(year || 1970, (month || 1) - 1, day || 1);
}

/** Compact axis label. Over long ranges, label month boundaries only. */
export function formatChartAxisTick(value: string, periodDays = 30): string {
	const date = parseIsoCalendarDate(value);
	if (Number.isNaN(date.getTime())) return value;
	const month = MONTHS_SHORT[date.getMonth()];
	if (periodDays > 62) {
		return date.getDate() === 1 ? month : `${month} ${date.getDate()}`;
	}
	return `${month} ${date.getDate()}`;
}

/** Tooltip date label. "long" spells the month out in full. */
export function formatChartTooltipDate(
	value: string,
	style: "short" | "long" = "short",
): string {
	const date = parseIsoCalendarDate(value);
	if (Number.isNaN(date.getTime())) return value;
	const month = style === "long"
		? MONTHS_LONG[date.getMonth()]
		: MONTHS_SHORT[date.getMonth()];
	return `${month} ${date.getDate()}, ${date.getFullYear()}`;
}
