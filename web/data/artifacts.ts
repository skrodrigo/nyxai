export interface Artifact {
	id: string
	chatId: string
	messageId: string
	title: string
	content: any
	status: string
	createdAt: string
	updatedAt: string
}

export interface CreateArtifactJobRequest {
	chatId: string
	messageId: string
	userMessage: string
	title?: string
}

class ArtifactService {
	async queueArtifactProcessing(request: CreateArtifactJobRequest): Promise<void> {
		const res = await fetch('/api/artifacts/queue', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		})

		if (!res.ok) {
			const payload = await res.json().catch(() => null)
			const message = payload?.error || `Failed to queue artifact (${res.status})`
			throw new Error(message)
		}
	}

	async getArtifactsByChatId(chatId: string): Promise<Artifact[]> {
		const res = await fetch(`/api/artifacts?chatId=${chatId}`)
		if (!res.ok) {
			const payload = await res.json().catch(() => null)
			const message = payload?.error || `Failed to fetch artifacts (${res.status})`
			throw new Error(message)
		}
		return res.json()
	}
}

export const artifactService = new ArtifactService()
