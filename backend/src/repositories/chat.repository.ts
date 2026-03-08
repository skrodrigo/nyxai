import { eq, and, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm'
import { db } from '../common/db.js'
import { chat, message } from '../db/schema.js'
import { chatBranchRepository } from './chat-branch.repository.js'

export const chatRepository = {
	create(userId: string, title: string, model?: string) {
		return db
			.insert(chat)
			.values({
				userId,
				title,
				model,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning()
			.then((rows) => rows[0])
	},

	createWithId(id: string, userId: string, title: string, model?: string) {
		return db
			.insert(chat)
			.values({
				id,
				userId,
				title,
				model,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning()
			.then((rows) => rows[0])
	},

	rename(chatId: string, title: string) {
		return db
			.update(chat)
			.set({ title, updatedAt: new Date() })
			.where(eq(chat.id, chatId))
			.returning()
			.then((rows) => rows[0])
	},

	async findByIdForUser(chatId: string, userId: string, branchId?: string) {
		const chatData = await db
			.select({
				id: chat.id,
				title: chat.title,
				pinnedAt: chat.pinnedAt,
				sharePath: chat.sharePath,
				isPublic: chat.isPublic,
				updatedAt: chat.updatedAt,
				model: chat.model,
				activeBranchId: chat.activeBranchId,
			})
			.from(chat)
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.limit(1)

		if (chatData.length === 0) return null
		const chatRow = chatData[0]

		const ensured = await chatBranchRepository.ensureDefaultBranch(chatId)
		const effectiveBranchId = branchId ?? chatRow.activeBranchId ?? ensured?.id ?? null
		if (!effectiveBranchId) {
			return { ...chatRow, activeBranchId: null, messages: [] }
		}

		const messages = await chatBranchRepository.getResolvedMessagesForBranch(effectiveBranchId)
		return { ...chatRow, activeBranchId: effectiveBranchId, messages }
	},

	findMetaForUser(chatId: string, userId: string) {
		return db
			.select({ id: chat.id })
			.from(chat)
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.limit(1)
			.then((rows) => rows[0] ?? null)
	},

	findManyForUser(userId: string) {
		return db
			.select({
				id: chat.id,
				title: chat.title,
				pinnedAt: chat.pinnedAt,
				updatedAt: chat.updatedAt,
			})
			.from(chat)
			.where(and(eq(chat.userId, userId), isNull(chat.archivedAt)))
			.orderBy(desc(sql`case when ${chat.pinnedAt} is null then 1 else 0 end`), desc(chat.pinnedAt), desc(chat.updatedAt))
	},

	findArchivedForUser(userId: string) {
		return db
			.select({
				id: chat.id,
				title: chat.title,
				pinnedAt: chat.pinnedAt,
				updatedAt: chat.updatedAt,
				archivedAt: chat.archivedAt,
			})
			.from(chat)
			.where(and(eq(chat.userId, userId), isNotNull(chat.archivedAt)))
			.orderBy(desc(sql`case when ${chat.pinnedAt} is null then 1 else 0 end`), desc(chat.pinnedAt), desc(chat.updatedAt))
	},

	pinForUser(chatId: string, userId: string) {
		return db
			.update(chat)
			.set({ pinnedAt: new Date() })
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.returning()
			.then((rows) => ({ count: rows.length }))
	},

	unpinForUser(chatId: string, userId: string) {
		return db
			.update(chat)
			.set({ pinnedAt: null })
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.returning()
			.then((rows) => ({ count: rows.length }))
	},

	renameForUser(chatId: string, userId: string, title: string) {
		return db
			.update(chat)
			.set({ title })
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.returning()
			.then((rows) => ({ count: rows.length }))
	},

	archiveForUser(chatId: string, userId: string) {
		return db
			.update(chat)
			.set({ archivedAt: new Date() })
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId), isNull(chat.archivedAt)))
			.returning()
			.then((rows) => ({ count: rows.length }))
	},

	unarchiveForUser(chatId: string, userId: string) {
		return db
			.update(chat)
			.set({ archivedAt: null })
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId), isNotNull(chat.archivedAt)))
			.returning()
			.then((rows) => ({ count: rows.length }))
	},

	deleteForUser(chatId: string, userId: string) {
		return db
			.delete(chat)
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.returning()
			.then((rows) => ({ count: rows.length }))
	},

	markPublic(chatId: string, userId: string, sharePath: string) {
		return db
			.update(chat)
			.set({ isPublic: true, sharePath })
			.where(eq(chat.id, chatId))
			.returning()
			.then((rows) => rows[0])
	},

	findShareInfoForUser(chatId: string, userId: string) {
		return db
			.select({ id: chat.id, sharePath: chat.sharePath })
			.from(chat)
			.where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
			.limit(1)
			.then((rows) => rows[0] ?? null)
	},

	async findPublicBySharePath(sharePath: string) {
		const chatData = await db
			.select({
				id: chat.id,
				title: chat.title,
				sharePath: chat.sharePath,
				isPublic: chat.isPublic,
				updatedAt: chat.updatedAt,
				model: chat.model,
			})
			.from(chat)
			.where(and(eq(chat.sharePath, sharePath), eq(chat.isPublic, true)))
			.limit(1)

		if (chatData.length === 0) return null
		const chatRow = chatData[0]

		const messages = await db
			.select({
				id: message.id,
				role: message.role,
				content: message.content,
				createdAt: message.createdAt,
			})
			.from(message)
			.where(eq(message.chatId, chatRow.id))
			.orderBy(asc(message.createdAt))

		return { ...chatRow, messages }
	},

	updateModel(chatId: string, modelValue: string) {
		return db
			.update(chat)
			.set({ model: modelValue })
			.where(eq(chat.id, chatId))
			.returning()
			.then((rows) => rows[0])
	},
}
