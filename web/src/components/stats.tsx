import { cn } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import type { StatsSummary } from "@/lib/api";
import { pctDelta } from "@/components/dashboard-data";

export function DashboardStats({ stats }: { stats: StatsSummary }) {
	const sessionsDelta = pctDelta(stats.sessionsLast7d, stats.sessionsPrev7d);
	const messagesDelta = pctDelta(stats.messagesLast7d, stats.messagesPrev7d);

	const cards: {
		label: string;
		value: string;
		delta: number | null;
		footnote: string;
		lowerIsBetter: boolean;
	}[] = [
		{
			label: "Sessions",
			value: String(stats.totalSessions),
			delta: sessionsDelta,
			footnote: "new this week",
			lowerIsBetter: false,
		},
		{
			label: "Messages",
			value: String(stats.totalMessages),
			delta: messagesDelta,
			footnote: "vs last week",
			lowerIsBetter: false,
		},
		{
			label: "Memories",
			value: String(stats.totalMemories),
			delta: null,
			footnote: "retained context",
			lowerIsBetter: false,
		},
		{
			label: "Skills",
			value: String(stats.totalSkills),
			delta: null,
			footnote: "reusable playbooks",
			lowerIsBetter: false,
		},
	];

	return (
		<>
			{cards.map((s) => (
				<Card className={cn("shadow-none dark:ring-0")} key={s.label}>
					<CardHeader>
						<CardTitle className="font-normal text-muted-foreground text-xs">
							{s.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<p className="font-semibold text-2xl tabular-nums">{s.value}</p>
						<div className="flex items-center gap-1 text-xs">
							{s.delta !== null ? (
								<>
									<Delta value={s.delta}>
										<DeltaIcon />
										<DeltaValue />
									</Delta>
									<span className="text-muted-foreground">{s.footnote}</span>
								</>
							) : (
								<span className="text-muted-foreground">{s.footnote}</span>
							)}
						</div>
					</CardContent>
				</Card>
			))}
		</>
	);
}
