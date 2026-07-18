"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"

export interface DashboardData {
	stats: api.StatsSummary
	sessions: api.Session[]
	tasks: api.Task[]
	agents: api.CustomAgent[]
	notifications: api.Notification[]
}

export type DashboardState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: DashboardData }

/**
 * Single fetch pass for the Artimis dashboard. Every card reads from
 * this one payload so the grid hydrates together instead of popping
 * in card-by-card.
 */
export function useDashboardData(): DashboardState {
	const [state, setState] = useState<DashboardState>({ status: "loading" })

	useEffect(() => {
		let cancelled = false

		async function load() {
			try {
				const [stats, sessions, tasks, agents, notifications] = await Promise.all([
					api.getStats(),
					api.getSessions(),
					api.getTasks(),
					api.getAgents(),
					api.getNotifications(),
				])
				if (!cancelled) {
					setState({
						status: "ready",
						data: { stats, sessions, tasks, agents, notifications },
					})
				}
			} catch {
				if (!cancelled) {
					setState({ status: "error", message: "Could not load dashboard data." })
				}
			}
		}

		load()
		return () => { cancelled = true }
	}, [])

	return state
}

/** Percentage change between two periods. null when the base is 0. */
export function pctDelta(current: number, previous: number): number | null {
	if (previous === 0) return current > 0 ? 100 : null
	return Math.round(((current - previous) / previous) * 1000) / 10
}

/** Relative timestamp: "2h ago", "3d ago". */
export function timeAgo(iso: string): string {
	const then = new Date(iso).getTime()
	if (Number.isNaN(then)) return ""
	const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
	if (seconds < 60) return "just now"
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d ago`
	const months = Math.floor(days / 30)
	return `${months}mo ago`
}
