'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { artifactService, type Artifact } from '@/data/artifacts'

interface UseArtifactsOptions {
	chatId?: string
	enabled?: boolean
}

interface UseArtifactsReturn {
	artifacts: Artifact[]
	isLoading: boolean
	selectedArtifact: Artifact | null
	setSelectedArtifact: (artifact: Artifact | null) => void
	isPanelOpen: boolean
	openPanel: (artifact: Artifact) => void
	closePanel: () => void
	processingCount: number
}

export function useArtifacts({ chatId, enabled = true }: UseArtifactsOptions): UseArtifactsReturn {
	const [artifacts, setArtifacts] = useState<Artifact[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
	const [isPanelOpen, setIsPanelOpen] = useState(false)
	const intervalRef = useRef<NodeJS.Timeout | null>(null)
	const artifactsRef = useRef<Artifact[]>([])
	const emptyPollCountRef = useRef(0)
	const firstEmptyAtRef = useRef<number | null>(null)
	const enabledRef = useRef(enabled)

	const processingCount = artifacts.filter(a => a.status === 'processing').length
	const hasProcessing = processingCount > 0

	const fetchArtifacts = useCallback(async () => {
		if (!chatId) return
		setIsLoading(true)
		try {
			const data = await artifactService.getArtifactsByChatId(chatId)
			const next = Array.isArray(data) ? data : []
			setArtifacts(next)
			artifactsRef.current = next
			if (next.length === 0) {
				emptyPollCountRef.current += 1
				if (firstEmptyAtRef.current === null) {
					firstEmptyAtRef.current = Date.now()
				}
			} else {
				emptyPollCountRef.current = 0
				firstEmptyAtRef.current = null
			}
		} catch (error) {
			console.error('Failed to fetch artifacts:', error)
		} finally {
			setIsLoading(false)
		}
	}, [chatId])

	const startPolling = useCallback(() => {
		if (intervalRef.current) return
		emptyPollCountRef.current = 0
		firstEmptyAtRef.current = null
		intervalRef.current = setInterval(() => {
			fetchArtifacts()
		}, 3000)
	}, [fetchArtifacts])

	const stopPolling = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current)
			intervalRef.current = null
		}
	}, [])

	useEffect(() => {
		enabledRef.current = enabled
		if (!enabled || !chatId) return

		emptyPollCountRef.current = 0
		firstEmptyAtRef.current = null
		fetchArtifacts()
		startPolling()

		return () => stopPolling()
	}, [chatId, enabled, fetchArtifacts, startPolling, stopPolling])

	useEffect(() => {
		if (!intervalRef.current) return

		if (artifacts.length > 0 && !hasProcessing) {
			stopPolling()
		}
	}, [artifacts.length, hasProcessing, stopPolling])

	useEffect(() => {
		if (!intervalRef.current) return
		if (hasProcessing) return
		if (firstEmptyAtRef.current === null) return
		if (Date.now() - firstEmptyAtRef.current < 60_000) return
		stopPolling()
	}, [artifacts.length, hasProcessing, stopPolling])

	useEffect(() => {
		if (typeof document === 'undefined') return
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') {
				stopPolling()
				return
			}
			if (!enabledRef.current) return
			if (!chatId) return
			fetchArtifacts()
			startPolling()
		}
		document.addEventListener('visibilitychange', onVisibility)
		return () => document.removeEventListener('visibilitychange', onVisibility)
	}, [chatId, fetchArtifacts, startPolling, stopPolling])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const handler = () => {
			if (!enabledRef.current) return
			if (!chatId) return
			fetchArtifacts()
			startPolling()
		}
		window.addEventListener('artifacts:refresh', handler)
		return () => window.removeEventListener('artifacts:refresh', handler)
	}, [chatId, fetchArtifacts, startPolling])

	const openPanel = useCallback((artifact: Artifact) => {
		setSelectedArtifact(artifact)
		setIsPanelOpen(true)
	}, [])

	const closePanel = useCallback(() => {
		setIsPanelOpen(false)
		setTimeout(() => setSelectedArtifact(null), 300)
	}, [])

	return {
		artifacts,
		isLoading,
		selectedArtifact,
		setSelectedArtifact,
		isPanelOpen,
		openPanel,
		closePanel,
		processingCount,
	}
}
