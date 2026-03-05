import { eq, gt, and } from 'drizzle-orm'
import { db } from '../common/db.js'
import { message, messageVersion } from '../db/schema.js'

export const messageRepository = {
	create(chatId: string, role: string, content: unknown, id?: string) {
		return db
			.insert(message)
			.values({
				id,
				chatId,
				role,
				content: content as Record<string, unknown>,
				createdAt: new Date(),
			})
			.returning()
			.then((rows) => rows[0])
	},

	async deleteManyAfter(chatId: string, messageId: string) {
		return db.transaction(async (tx) => {
			const msg = await tx
				.select({ createdAt: message.createdAt })
				.from(message)
				.where(and(eq(message.id, messageId), eq(message.chatId, chatId)))
				.limit(1)

			if (msg.length === 0) return { count: 0 }

			const deleted = await tx
				.delete(message)
				.where(and(eq(message.chatId, chatId), gt(message.createdAt, msg[0].createdAt)))
				.returning({ id: message.id })

			return { count: deleted.length }
		})
	},

	updateContent(messageId: string, content: unknown) {
		return db
			.update(message)
			.set({ content: content as Record<string, unknown> })
			.where(eq(message.id, messageId))
			.returning()
			.then((rows) => rows[0])
	},

	createVersion(messageId: string, content: unknown) {
		return db
			.insert(messageVersion)
			.values({
				messageId,
				content: content as Record<string, unknown>,
				createdAt: new Date(),
			})
			.returning()
			.then((rows) => rows[0])
	},

	findVersions(messageId: string) {
		return db
			.select()
			.from(messageVersion)
			.where(eq(messageVersion.messageId, messageId))
			.orderBy(messageVersion.createdAt)
	},
}
