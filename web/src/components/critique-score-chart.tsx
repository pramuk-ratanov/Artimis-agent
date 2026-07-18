"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";
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
import type { StatsSummary } from "@/lib/api";

const chartConfig = {
	avg_score: {
		label: "Avg score",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

/** Half of bar width (8) so ends read as fully rounded caps. */
const BAR_RADIUS = 5;

function ColumnHoverCursor(props: React.ComponentProps<typeof Rectangle>) {
	return (
		<Rectangle
			fill="var(--muted)"
			fillOpacity={0.5}
			radius={BAR_RADIUS * 2}
			stroke="none"
			{...props}
		/>
	);
}

export function CritiqueScoreChart({
	critiqueTrend,
	className,
	...props
}: { critiqueTrend: StatsSummary["critiqueTrend"] } & ComponentProps<typeof Card>) {
	const chartData = critiqueTrend.map((r) => ({
		day: r.day.slice(5), // "MM-DD" keeps the axis tight
		avg_score: r.avg_score,
		count: r.count,
	}));

	return (
		<Card
			className={cn("shadow-none md:col-span-2 dark:ring-0", className)}
			{...props}
		>
			<CardHeader>
				<CardTitle>Critique score</CardTitle>
				<CardDescription>
					Daily average self-critique score. Bars only appear on days with reviews.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{chartData.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No critique history yet. Run a Pressure Test to start the trend.
					</p>
				) : (
					<ChartContainer className="aspect-video w-full" config={chartConfig}>
						<BarChart accessibilityLayer data={chartData}>
							<XAxis
								axisLine={false}
								dataKey="day"
								interval="preserveStartEnd"
								minTickGap={16}
								tickLine={false}
								tickMargin={10}
							/>
							<YAxis
								axisLine={false}
								domain={[0, 10]}
								tick={{ className: "tabular-nums" }}
								tickLine={false}
								tickMargin={8}
								width={24}
							/>
							<ChartTooltip
								content={<ChartTooltipContent hideLabel />}
								cursor={<ColumnHoverCursor />}
							/>
							<Bar
								barSize={8}
								dataKey="avg_score"
								fill="var(--color-avg_score)"
								overflow="visible"
								radius={[BAR_RADIUS, BAR_RADIUS, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
