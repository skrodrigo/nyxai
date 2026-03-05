import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AppVariables } from './routes.js'
import { authMiddleware } from './../middlewares/auth.middleware.js'
import { eq, desc, isNull, and } from 'drizzle-orm'
import { db } from '../common/db.js'
import { chat, imageGeneration } from '../db/schema.js'
import { chatBranchRepository } from './../repositories/chat-branch.repository.js'
import { messageRepository } from './../repositories/message.repository.js'
import { generateAndStoreImage } from './../services/image-generation.service.js'

const imagesRouter = new OpenAPIHono<{ Variables: AppVariables }>()
imagesRouter.use('*', authMiddleware)

const generateRoute = createRoute({
	method: 'post',
	path: '/generate',
	tags: ['Images'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: z.object({
						chatId: z.string().min(1).optional(),
						messageId: z.string().min(1).optional(),
						prompt: z.string().min(1),
						model: z.string().min(1),
						returnBase64Preview: z.boolean().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			description: 'Generated',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						data: z.object({
							chatId: z.string(),
							id: z.string(),
							imageUrl: z.string(),
							mediaType: z.string(),
							base64Preview: z.string().optional(),
						}),
					}),
				},
			},
		},
		400: { description: 'Invalid request' },
		401: { description: 'Unauthorized' },
		500: { description: 'Failed to generate image' },
	},
})

imagesRouter.openapi(generateRoute, async (c) => {
	const user = c.get('user')
	const body = c.req.valid('json')

	let chatId = body.chatId
	if (!chatId) {
		const created = await db
			.insert(chat)
			.values({
				userId: user!.id,
				title: body.prompt.slice(0, 80),
				model: body.model,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning({ id: chat.id })
			.then((rows) => rows[0])
		chatId = created.id
	}

	const data = await generateAndStoreImage({
		chatId,
		messageId: body.messageId ?? null,
		userId: user!.id,
		prompt: body.prompt,
		model: body.model,
		returnBase64Preview: body.returnBase64Preview ?? false,
	})

	const ensured = await chatBranchRepository.ensureDefaultBranch(chatId)
	const chatData = await db
		.select({ activeBranchId: chat.activeBranchId })
		.from(chat)
		.where(eq(chat.id, chatId))
		.limit(1)
	const effectiveBranchId = chatData[0]?.activeBranchId ?? ensured?.id ?? null
	if (!effectiveBranchId) {
		return c.json({ success: true, data: { chatId, ...data } }, 200)
	}

	const userMessage = await messageRepository.create(chatId, 'user', {
		type: 'text',
		text: body.prompt,
	})
	await chatBranchRepository.appendMessageToBranch(effectiveBranchId, userMessage.id)

	const assistantMessage = await messageRepository.create(chatId, 'assistant', {
		type: 'file',
		mediaType: data.mediaType,
		url: data.imageUrl,
	})
	await chatBranchRepository.appendMessageToBranch(effectiveBranchId, assistantMessage.id)

	return c.json({ success: true, data: { chatId, ...data } }, 200)
})

const listRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Images'],
	request: {
		query: z.object({
			chatId: z.string().min(1).optional(),
		}),
	},
	responses: {
		200: {
			description: 'List',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						data: z.array(z.any()),
					}),
				},
			},
		},
		401: { description: 'Unauthorized' },
	},
})

imagesRouter.openapi(listRoute, async (c) => {
	const user = c.get('user')
	const { chatId } = c.req.valid('query')

	const data = await db
		.select()
		.from(imageGeneration)
		.where(
			chatId
				? and(eq(imageGeneration.userId, user!.id), eq(imageGeneration.chatId, chatId))
				: eq(imageGeneration.userId, user!.id)
		)
		.orderBy(desc(imageGeneration.createdAt))

	return c.json({ success: true, data }, 200)
})

export default imagesRouter
