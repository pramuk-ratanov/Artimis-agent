"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
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

const STATUS_ORDER = ["in_progress", "pending", "paused", "completed", "cancelled"] as const;

const STATUS_META: Record<string, { label: string; color: string }> = {
	in_progress: { label: "In progress", color: "var(--chart-1)" },
	pending: { label: "Pending", color: "var(--chart-4)" },
	paused: { label: "Paused", color: "var(--chart-2)" },
	completed: { label: "Completed", color: "var(--chart-3)" },
	cancelled: { label: "Cancelled", color: "var(--chart-5)" },
};

export function TasksStatusChart({
	tasksByStatus,
	className,
	...props
}: { tasksByStatus: StatsSummary["tasksByStatus"] } & ComponentProps<typeof Card>) {
	const chartData = STATUS_ORDER
		.filter((s) => (tasksByStatus[s] ?? 0) > 0)
		.map((s) => ({
			status: s,
			label: STATUS_META[s].label,
			count: tasksByStatus[s] ?? 0,
			fill: STATUS_META[s].color,
		}));

	const total = chartData.reduce((a, r) => a + r.count, 0);

	const chartConfig = {
		count: { label: "Tasks" },
		...Object.fromEntries(
			chartData.map((r) => [r.status, { label: r.label, color: r.fill }])
		),
	} satisfies ChartConfig;

	return (
		<Card
			className={cn("shadow-none md:col-span-2 dark:ring-0", className)}
			{...props}
		>
			<CardHeader className="space-y-1">
				<CardTitle>Tasks</CardTitle>
				<CardDescription>
					{total === 0 ? "No tasks yet." : `${total} tasks by current status.`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{chartData.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Submit a task and it will show up here.
					</p>
				) : (
					<ChartContainer className="aspect-video w-full" config={chartConfig}>
						<BarChart
							accessibilityLayer
							data={chartData}
							layout="vertical"
							margin={{ left: 8, right: 32 }}
						>
							<XAxis axisLine={false} tickLine={false} type="number" hide />
							<YAxis
								axisLine={false}
								dataKey="label"
								tickLine={false}
								tickMargin={8}
								type="category"
								width={88}
							/>
							<ChartTooltip
								content={<ChartTooltipContent hideLabel />}
								cursor={false}
							/>
							<Bar barSize={10} dataKey="count" radius={[0, 5, 5, 0]}>
								<LabelList
									className="fill-foreground tabular-nums"
									dataKey="count"
									offset={8}
									position="right"
								/>
							</Bar>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
