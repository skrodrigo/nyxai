import { generateImage, gateway, NoImageGeneratedError } from 'ai'
import { eq } from 'drizzle-orm'
import { db } from '../common/db.js'
import { imageGeneration } from '../db/schema.js'
import { uploadGeneratedImage } from './r2-storage.service.js'

function toGatewayImageModelId(model: string) {
	if (model === 'openai/gpt-5-nano') return 'openai/dall-e-3'
	return model
}

function toPreviewBase64(params: { bytes: Uint8Array; mediaType: string }) {
	const buf = Buffer.from(params.bytes)
	return buf.toString('base64')
}

export async function generateAndStoreImage(params: {
	chatId: string
	messageId?: string | null
	userId: string
	prompt: string
	model: string
	returnBase64Preview?: boolean
}) {
	const created = await db
		.insert(imageGeneration)
		.values({
			chatId: params.chatId,
			messageId: params.messageId ?? null,
			userId: params.userId,
			prompt: params.prompt,
			model: params.model,
			imageUrl: '',
			r2Key: '',
			status: 'processing',
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning({ id: imageGeneration.id })
		.then((rows) => rows[0])

	try {
		const gatewayModelId = toGatewayImageModelId(params.model)

		const result = await generateImage({
			model: gateway.image(gatewayModelId as any),
			prompt: params.prompt,
		})

		const image = result.image
		const mediaType = image.mediaType || 'image/png'
		const bytes = image.uint8Array

		const uploaded = await uploadGeneratedImage({
			userId: params.userId,
			imageGenerationId: created.id,
			bytes,
			mediaType,
		})

		await db
			.update(imageGeneration)
			.set({
				imageUrl: uploaded.imageUrl,
				r2Key: uploaded.key,
				status: 'completed',
				updatedAt: new Date(),
			})
			.where(eq(imageGeneration.id, created.id))

		return {
			id: created.id,
			imageUrl: uploaded.imageUrl,
			mediaType,
			base64Preview: params.returnBase64Preview
				? toPreviewBase64({ bytes, mediaType })
				: undefined,
		}
	} catch (err) {
		const details =
			NoImageGeneratedError.isInstance(err)
				? err.cause instanceof Error
					? err.cause.message
					: 'No image generated'
				: err instanceof Error
					? err.message
					: 'Failed to generate image'

		await db
			.update(imageGeneration)
			.set({
				status: 'failed',
				error: details,
				updatedAt: new Date(),
			})
			.where(eq(imageGeneration.id, created.id))

		throw err
	}
}
