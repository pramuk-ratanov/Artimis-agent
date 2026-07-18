import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	BellIcon,
	CheckCircle2Icon,
	CircleAlertIcon,
	InfoIcon,
} from "lucide-react";
import type { Notification } from "@/lib/api";
import { timeAgo } from "@/components/dashboard-data";

function iconFor(type: string) {
	const t = type.toLowerCase();
	if (t.includes("complete") || t.includes("done") || t.includes("success")) {
		return <CheckCircle2Icon />;
	}
	if (t.includes("fail") || t.includes("error") || t.includes("warn")) {
		return <CircleAlertIcon />;
	}
	if (t.includes("info")) {
		return <InfoIcon />;
	}
	return <BellIcon />;
}

export function ActivityFeed({
	notifications,
	className,
	...props
}: { notifications: Notification[] } & ComponentProps<typeof Card>) {
	const items = notifications.slice(0, 6);

	return (
		<Card className={cn("gap-0 shadow-none dark:ring-0", className)} {...props}>
			<CardHeader className="border-b">
				<CardTitle>Workspace activity</CardTitle>
				<CardDescription>Signals from tasks and agents.</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				{items.length === 0 ? (
					<p className="p-4 text-muted-foreground text-sm">
						Nothing yet. Activity from tasks and agents will land here.
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border">
						{items.map((item, i) => (
							<li className="flex min-h-18 items-center gap-3 px-3 py-2" key={`${item.timestamp}-${i}`}>
								<span
									aria-hidden="true"
									className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4 text-muted-foreground"
								>
									{iconFor(item.type)}
								</span>
								<div className="min-w-0 flex-1 space-y-1">
									<p className="line-clamp-2 text-pretty text-foreground text-xs leading-snug">
										{item.title || item.message}
									</p>
									<p className="text-muted-foreground text-xs tabular-nums">
										{timeAgo(item.timestamp)}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
