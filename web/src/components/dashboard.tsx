"use client";

import { MessageVolumeChart } from "@/components/message-volume-chart";
import { FocusAreasChart } from "@/components/focus-areas-chart";
import { CritiqueScoreChart } from "@/components/critique-score-chart";
import { TasksStatusChart } from "@/components/tasks-status-chart";
import { CustomAgentsCard } from "@/components/custom-agents-card";
import { RecentSessions } from "@/components/recent-sessions";
import { ActivityFeed } from "@/components/activity-feed";
import { DashboardStats } from "@/components/stats";
import { useDashboardData } from "@/components/dashboard-data";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{[...Array(4)].map((_, i) => (
				<Skeleton className="h-28 rounded-xl" key={`stat-${i}`} />
			))}
			<Skeleton className="h-72 rounded-xl md:col-span-2 lg:col-span-3" />
			<Skeleton className="h-72 rounded-xl" />
			<Skeleton className="h-64 rounded-xl md:col-span-2" />
			<Skeleton className="h-64 rounded-xl md:col-span-2" />
			<Skeleton className="h-64 rounded-xl" />
			<Skeleton className="h-64 rounded-xl md:col-span-2" />
			<Skeleton className="h-64 rounded-xl" />
		</div>
	);
}

export function Dashboard() {
	const state = useDashboardData();

	if (state.status === "loading") {
		return <DashboardSkeleton />;
	}

	if (state.status === "error") {
		return (
			<div className="rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
				{state.message} Is the Artimis backend running?
			</div>
		);
	}

	const { stats, sessions, agents, notifications } = state.data;

	return (
		<div className="t-reveal grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<DashboardStats stats={stats} />
			<MessageVolumeChart messagesPerDay={stats.messagesPerDay} />
			<FocusAreasChart focusAreas={stats.focusAreas} />
			<CritiqueScoreChart critiqueTrend={stats.critiqueTrend} />
			<TasksStatusChart tasksByStatus={stats.tasksByStatus} />
			<CustomAgentsCard agents={agents} />
			<RecentSessions sessions={sessions} />
			<ActivityFeed notifications={notifications} />
		</div>
	);
}
