"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { LabelList, Pie, PieChart } from "recharts";
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
	ChartLegend,
	ChartLegendContent,
} from "@/components/ui/chart";
import type { StatsSummary } from "@/lib/api";

const SLICE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

/** Short legend labels — long taxonomy names overflow the card. */
const SHORT_LABELS: Record<string, string> = {
	"AI/Prompting": "AI",
	"Business/Marketing": "Business",
	"Coding/Development": "Coding",
	"Design/UI": "Design",
	"Infrastructure": "Infra",
};

export function FocusAreasChart({
	focusAreas,
	className,
	...props
}: { focusAreas: StatsSummary["focusAreas"] } & ComponentProps<typeof Card>) {
	// Top 4 topics + an "Other" bucket so the donut and legend stay readable.
	const sorted = [...focusAreas].sort((a, b) => b.percentage - a.percentage);
	const head = sorted.slice(0, 4);
	const tailPct = sorted.slice(4).reduce((a, f) => a + f.percentage, 0);
	const slices = tailPct > 0
		? [...head, { topic: "Other", sessions: 0, messages: 0, percentage: tailPct }]
		: head;

	const chartData = slices.map((area, i) => ({
		area: SHORT_LABELS[area.topic] ?? area.topic,
		share: area.percentage,
		fill: SLICE_COLORS[i % SLICE_COLORS.length],
	}));

	const chartConfig = {
		share: { label: "Share" },
		...Object.fromEntries(
			slices.map((area, i) => [
				SHORT_LABELS[area.topic] ?? area.topic,
				{ label: SHORT_LABELS[area.topic] ?? area.topic, color: SLICE_COLORS[i % SLICE_COLORS.length] },
			])
		),
	} satisfies ChartConfig;

	return (
		<Card
			className={cn("flex flex-col shadow-none dark:ring-0", className)}
			{...props}
		>
			<CardHeader className="items-center space-y-1 pb-0 sm:items-start">
				<CardTitle>Focus areas</CardTitle>
				<CardDescription>
					What your conversations are about, by message share
				</CardDescription>
			</CardHeader>
			<CardContent className="my-auto">
				<ChartContainer
					className="mx-auto aspect-square max-h-72 w-full"
					config={chartConfig}
				>
					<PieChart accessibilityLayer>
						<Pie
							cornerRadius={8}
							data={chartData}
							dataKey="share"
							innerRadius={36}
							nameKey="area"
							outerRadius="88%"
							stroke="var(--card)"
							strokeWidth={4}
						>
							<LabelList
								className="fill-background font-medium"
								dataKey="share"
								fill="currentColor"
								fontWeight={500}
								formatter={(label) => {
									const n = Number(label);
									return Number.isFinite(n) ? `${n}%` : String(label ?? "");
								}}
								position="inside"
								stroke="none"
							/>
						</Pie>
						<ChartLegend content={<ChartLegendContent nameKey="area" />} />
					</PieChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
