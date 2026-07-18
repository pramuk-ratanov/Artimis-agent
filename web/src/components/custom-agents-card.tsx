"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import {
	Avatar,
	AvatarFallback,
} from "@/components/ui/avatar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { StatusIndicator } from "@/components/indicator";
import type { CustomAgent } from "@/lib/api";

function getInitials(name: string) {
	return name
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase())
		.join("")
		.slice(0, 2);
}

export function CustomAgentsCard({
	agents,
	className,
	...props
}: { agents: CustomAgent[] } & ComponentProps<typeof Card>) {
	return (
		<Card className={cn("shadow-none dark:ring-0", className)} {...props}>
			<CardHeader className="border-b">
				<CardTitle>Custom agents</CardTitle>
				<CardDescription>
					Purpose-built agents configured for this workspace
				</CardDescription>
			</CardHeader>
			<CardContent className="p-0">
				{agents.length === 0 ? (
					<p className="p-4 text-muted-foreground text-sm">
						No custom agents yet. Create one from Settings.
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border">
						{agents.map((a) => (
							<li
								className="flex items-center gap-2 p-3 first:pt-0 last:pb-0 sm:gap-3"
								key={a.id}
							>
								<Avatar className="size-8">
									<AvatarFallback>{getInitials(a.name)}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1 pr-1">
									<p className="truncate font-medium text-foreground text-sm leading-snug">
										{a.name}
									</p>
									<p className="flex items-center gap-2 text-[10px] leading-snug">
										<span className="flex shrink-0 items-center gap-1">
											<StatusIndicator
												color={a.active ? "emerald" : "amber"}
												pulse={a.active}
											/>
											{a.active ? "Active" : "Inactive"}
										</span>
										<span className="inline-flex size-1 rounded-full bg-foreground/80" />
										<span className="truncate font-mono">{a.model}</span>
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
