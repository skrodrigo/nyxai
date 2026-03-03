import { Hono } from 'hono'
import { generateText } from 'ai'
import { z } from 'zod'
import { Receiver } from '@upstash/qstash'
import { env } from './../common/env.js'
import { prisma } from './../common/prisma.js'

const artifactsRouter = new Hono()

const processArtifactRequestSchema = z.object({
	chatId: z.string().min(1),
	messageId: z.string().min(1),
	userMessage: z.string().min(1),
	title: z.string().min(1).optional(),
})

artifactsRouter.post('/process', async (c) => {
	const signature = c.req.header('upstash-signature')
	const directSource = c.req.header('x-source') === 'nextjs-direct'
	const body = await c.req.text()

	if (!directSource && env.STORAGE_QSTASH_CURRENT_SIGNING_KEY && env.STORAGE_QSTASH_NEXT_SIGNING_KEY) {
		if (!signature) {
			return c.json({ error: 'Missing signature' }, 401)
		}

		const receiver = new Receiver({
			currentSigningKey: env.STORAGE_QSTASH_CURRENT_SIGNING_KEY,
			nextSigningKey: env.STORAGE_QSTASH_NEXT_SIGNING_KEY,
		})

		const isValid = await receiver.verify({
			signature,
			body,
		}).catch(() => false)

		if (!isValid) {
			return c.json({ error: 'Invalid signature' }, 401)
		}
	}

	const parsedRequest = processArtifactRequestSchema.safeParse(
		JSON.parse(body)
	)

	if (!parsedRequest.success) {
		return c.json({ error: 'Invalid request body' }, 400)
	}

	const { chatId, messageId, userMessage, title } = parsedRequest.data

	console.log('[artifact-process] Received request:', { chatId, messageId, userMessageLength: userMessage?.length })

	try {
		console.log('[artifact-process] Generating artifact with AI SDK...')

		const models = [
			'openai/gpt-4.1-nano',
		] as const

		let lastError: unknown = null
		let content: string | null = null

		for (const model of models) {
			try {
				console.log('[artifact-process] Trying model:', model)
				const result = await generateText({
					model,
					prompt: userMessage,
				})
				content = result.text
				console.log('[artifact-process] Generated successfully:', { model })
				break
			} catch (error) {
				lastError = error
				console.error('[artifact-process] Model failed:', {
					model,
					message: (error as any)?.message,
				})
			}
		}

		if (!content) {
			throw lastError || new Error('Failed to generate content')
		}

		const artifactTitle = title || 'Artifact'

		const existingArtifact = await prisma.artifact.findFirst({
			where: { messageId },
		})

		if (existingArtifact) {
			console.log('[artifact-process] Artifact already exists for this messageId, skipping')
			return c.json({ success: true, title: existingArtifact.title, skipped: true })
		}

		await prisma.artifact.create({
			data: {
				chatId,
				messageId,
				title: artifactTitle,
				content: { raw: content },
				status: 'completed',
			},
		})

		console.log('[artifact-process] Saved to database successfully')

		return c.json({ success: true, title: artifactTitle })
	} catch (error: any) {
		console.error('[artifact-process] Error:', {
			message: error?.message,
			stack: error?.stack,
			name: error?.name,
		})

		await prisma.artifact.create({
			data: {
				chatId,
				messageId,
				title: title || 'Artifact',
				content: {
					error: 'Failed to generate artifact',
					details: error?.message,
				},
				status: 'failed',
			},
		})

		return c.json({ error: 'Failed to process artifact', details: error?.message }, 500)
	}
})

artifactsRouter.get('/', async (c) => {
	const chatId = c.req.query('chatId')
	if (!chatId) {
		return c.json({ error: 'chatId is required' }, 400)
	}

	const artifacts = await prisma.artifact.findMany({
		where: { chatId },
		orderBy: { createdAt: 'desc' },
	})

	return c.json(artifacts)
})

export default artifactsRouter
