import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { MessageCircleIcon, BotIcon } from "lucide-react";
import type { Session } from "@/lib/api";
import { timeAgo } from "@/components/dashboard-data";

export function RecentSessions({
	sessions,
	className,
	...props
}: { sessions: Session[] } & ComponentProps<typeof Card>) {
	const rows = [...sessions]
		.sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
		.slice(0, 6);

	return (
		<Card
			className={cn("gap-0 shadow-none md:col-span-2 dark:ring-0", className)}
			{...props}
		>
			<CardHeader className="border-b">
				<CardTitle>Recent sessions</CardTitle>
				<CardDescription>Latest conversations in this workspace</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				{rows.length === 0 ? (
					<p className="p-4 text-muted-foreground text-sm">
						No sessions yet. Start a chat from the home screen.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Session</TableHead>
								<TableHead className="w-20">Mode</TableHead>
								<TableHead className="w-20 text-right">Msgs</TableHead>
								<TableHead className="w-24 text-right">Active</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((s) => (
								<TableRow key={s.id}>
									<TableCell className="max-w-0">
										<div className="flex items-center gap-2">
											{s.mode === "agent" ? (
												<BotIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
											) : (
												<MessageCircleIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
											)}
											<span className="truncate font-medium text-foreground text-sm">
												{s.name || "Untitled session"}
											</span>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant={s.mode === "agent" ? "secondary" : "outline"}>
											{s.mode}
										</Badge>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{s.message_count ?? "—"}
									</TableCell>
									<TableCell className="text-right text-muted-foreground tabular-nums">
										{timeAgo(s.updated_at || s.created_at)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
