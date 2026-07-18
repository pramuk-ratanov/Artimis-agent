"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	formatChartAxisTick,
	formatChartTooltipDate,
} from "@/components/formater";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import type { StatsSummary } from "@/lib/api";

type PeriodDays = 7 | 30 | 90;

type VolumeRow = {
	date: string;
	messages: number;
};

const chartConfig = {
	messages: {
		label: "Messages",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

function isoDay(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MessageVolumeChart({
	messagesPerDay,
	className,
	...props
}: { messagesPerDay: StatsSummary["messagesPerDay"] } & ComponentProps<typeof Card>) {
	const chartUid = useId().replace(/:/g, "");
	const idAreaGradient = `message-volume-area-grad-${chartUid}`;

	const [periodDays, setPeriodDays] = useState<PeriodDays>(30);

	// SQL only returns days that have messages. Fill the gaps with zeroes
	// so the area chart reads as an honest timeline, not just the busy days.
	const fullSeries = useMemo<VolumeRow[]>(() => {
		const byDay = new Map(messagesPerDay.map((r) => [r.day, r.count]));
		const rows: VolumeRow[] = [];
		const today = new Date();
		for (let i = 89; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const key = isoDay(d);
			rows.push({ date: key, messages: byDay.get(key) ?? 0 });
		}
		return rows;
	}, [messagesPerDay]);

	const chartRows = useMemo(() => fullSeries.slice(-periodDays), [fullSeries, periodDays]);

	// Delta: second half of the visible window vs first half.
	const growthPctNum = useMemo(() => {
		if (chartRows.length < 2) return 0;
		const mid = Math.floor(chartRows.length / 2);
		const first = chartRows.slice(0, mid).reduce((a, r) => a + r.messages, 0);
		const second = chartRows.slice(mid).reduce((a, r) => a + r.messages, 0);
		if (first === 0) return second > 0 ? 100 : 0;
		return ((second - first) / first) * 100;
	}, [chartRows]);

	let xAxisMinTickGap: number | undefined;
	if (periodDays <= 7) {
		xAxisMinTickGap = undefined;
	} else if (periodDays >= 90) {
		xAxisMinTickGap = 40;
	} else {
		xAxisMinTickGap = 36;
	}

	return (
		<Card
			className={cn(
				"shadow-none md:col-span-2 lg:col-span-3 dark:ring-0",
				className
			)}
			{...props}
		>
			<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<CardTitle>Message volume</CardTitle>
						<Delta value={growthPctNum} variant="badge">
							<DeltaIcon variant="trend" />
							<DeltaValue />
						</Delta>
					</div>
					<CardDescription>
						Messages per day for the selected window.
					</CardDescription>
				</div>
				<Select
					onValueChange={(v) => {
						const n = Number(v);
						setPeriodDays(n as PeriodDays);
					}}
					value={String(periodDays)}
				>
					<SelectTrigger
						aria-label="Message volume time range"
						className="w-full min-w-36 sm:w-fit"
						size="sm"
					>
						<SelectValue placeholder="Range" />
					</SelectTrigger>
					<SelectContent align="end">
						<SelectItem value="7">Last 7 days</SelectItem>
						<SelectItem value="30">Last 30 days</SelectItem>
						<SelectItem value="90">Last 90 days</SelectItem>
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent>
				<ChartContainer className="aspect-22/8 w-full" config={chartConfig}>
					<AreaChart
						accessibilityLayer
						data={chartRows}
						margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
					>
						<defs>
							<linearGradient id={idAreaGradient} x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="0%"
									stopColor="var(--color-messages)"
									stopOpacity={0.45}
								/>
								<stop
									offset="55%"
									stopColor="var(--color-messages)"
									stopOpacity={0.12}
								/>
								<stop
									offset="100%"
									stopColor="var(--color-messages)"
									stopOpacity={0}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid className="stroke-border" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="date"
							interval={periodDays <= 7 ? 0 : "preserveStartEnd"}
							minTickGap={xAxisMinTickGap}
							tickFormatter={(value) =>
								formatChartAxisTick(String(value), periodDays)
							}
							tickLine={false}
							tickMargin={8}
						/>
						<YAxis
							axisLine={false}
							tick={{ className: "tabular-nums" }}
							tickLine={false}
							tickMargin={8}
							width={36}
							allowDecimals={false}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									className="min-w-34"
									indicator="line"
									labelFormatter={(_, payload) => {
										const row = payload?.[0]?.payload as VolumeRow | undefined;
										if (!row?.date) {
											return "";
										}
										return formatChartTooltipDate(row.date, "long");
									}}
								/>
							}
							cursor={false}
						/>
						<Area
							dataKey="messages"
							dot={false}
							fill={`url(#${idAreaGradient})`}
							stroke="var(--color-messages)"
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
