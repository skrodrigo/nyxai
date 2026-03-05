import { eq, lte, and, asc, desc, inArray } from 'drizzle-orm'
import { db } from '../common/db.js'
import { chat, chatBranch, chatBranchMessage, message, messageVersion } from '../db/schema.js'

type BranchVersionOption = {
	branchId: string
	versionId: string | null
	content: Record<string, unknown> | unknown
}

export const chatBranchRepository = {
	async ensureDefaultBranch(chatId: string) {
		const chatData = await db
			.select({
				id: chat.id,
				activeBranchId: chat.activeBranchId,
			})
			.from(chat)
			.where(eq(chat.id, chatId))
			.limit(1)

		if (chatData.length === 0) return null
		const chatRow = chatData[0]

		if (chatRow.activeBranchId) {
			return db
				.select()
				.from(chatBranch)
				.where(eq(chatBranch.id, chatRow.activeBranchId))
				.limit(1)
				.then((rows) => rows[0] ?? null)
		}

		return db.transaction(async (tx) => {
			const newBranch = await tx
				.insert(chatBranch)
				.values({
					chatId,
					createdAt: new Date(),
				})
				.returning({ id: chatBranch.id })
				.then((rows) => rows[0])

			await tx
				.update(chat)
				.set({ activeBranchId: newBranch.id })
				.where(eq(chat.id, chatId))

			const messages = await tx
				.select({ id: message.id })
				.from(message)
				.where(eq(message.chatId, chatId))
				.orderBy(asc(message.createdAt))

			if (messages.length > 0) {
				await tx.insert(chatBranchMessage).values(
					messages.map((m, idx) => ({
						branchId: newBranch.id,
						messageId: m.id,
						position: idx,
						createdAt: new Date(),
					}))
				)
			}

			return tx
				.select()
				.from(chatBranch)
				.where(eq(chatBranch.id, newBranch.id))
				.limit(1)
				.then((rows) => rows[0])
		})
	},

	async getResolvedMessagesForBranch(branchId: string) {
		const items = await db
			.select({
				id: chatBranchMessage.id,
				position: chatBranchMessage.position,
				messageId: message.id,
				role: message.role,
				messageContent: message.content,
				messageCreatedAt: message.createdAt,
				versionContent: messageVersion.content,
			})
			.from(chatBranchMessage)
			.innerJoin(message, eq(chatBranchMessage.messageId, message.id))
			.leftJoin(messageVersion, eq(chatBranchMessage.messageVersionId, messageVersion.id))
			.where(eq(chatBranchMessage.branchId, branchId))
			.orderBy(asc(chatBranchMessage.position))

		return items.map((it) => ({
			id: it.messageId,
			role: it.role,
			content: (it.versionContent ?? it.messageContent) as Record<string, unknown>,
			createdAt: it.messageCreatedAt,
		}))
	},

	async appendMessageToBranch(branchId: string, messageIdValue: string) {
		return db.transaction(async (tx) => {
			const last = await tx
				.select({ position: chatBranchMessage.position })
				.from(chatBranchMessage)
				.where(eq(chatBranchMessage.branchId, branchId))
				.orderBy(desc(chatBranchMessage.position))
				.limit(1)

			const nextPosition = last.length > 0 ? last[0].position + 1 : 0

			return tx
				.insert(chatBranchMessage)
				.values({
					branchId,
					messageId: messageIdValue,
					position: nextPosition,
					createdAt: new Date(),
				})
				.returning()
				.then((rows) => rows[0])
		})
	},

	async forkBranchFromEdit({
		chatId,
		parentBranchId,
		forkMessageId,
		forkVersionId,
	}: {
		chatId: string
		parentBranchId: string
		forkMessageId: string
		forkVersionId: string
	}) {
		return db.transaction(async (tx) => {
			const forkItem = await tx
				.select({ position: chatBranchMessage.position })
				.from(chatBranchMessage)
				.where(
					and(
						eq(chatBranchMessage.branchId, parentBranchId),
						eq(chatBranchMessage.messageId, forkMessageId)
					)
				)
				.limit(1)

			if (forkItem.length === 0) {
				throw new Error('Fork message not found in branch')
			}

			const prefix = await tx
				.select({
					messageId: chatBranchMessage.messageId,
					position: chatBranchMessage.position,
					messageVersionId: chatBranchMessage.messageVersionId,
				})
				.from(chatBranchMessage)
				.where(
					and(
						eq(chatBranchMessage.branchId, parentBranchId),
						lte(chatBranchMessage.position, forkItem[0].position)
					)
				)
				.orderBy(asc(chatBranchMessage.position))

			const newBranch = await tx
				.insert(chatBranch)
				.values({
					chatId,
					parentBranchId,
					forkMessageId,
					forkVersionId,
					createdAt: new Date(),
				})
				.returning({ id: chatBranch.id })
				.then((rows) => rows[0])

			if (prefix.length > 0) {
				await tx.insert(chatBranchMessage).values(
					prefix.map((p) => ({
						branchId: newBranch.id,
						messageId: p.messageId,
						position: p.position,
						messageVersionId:
							p.messageId === forkMessageId ? forkVersionId : p.messageVersionId,
						createdAt: new Date(),
					}))
				)
			}

			await tx
				.update(chat)
				.set({ activeBranchId: newBranch.id })
				.where(eq(chat.id, chatId))

			return tx
				.select()
				.from(chatBranch)
				.where(eq(chatBranch.id, newBranch.id))
				.limit(1)
				.then((rows) => rows[0])
		})
	},

	async setActiveBranch(chatId: string, branchId: string) {
		return db
			.update(chat)
			.set({ activeBranchId: branchId })
			.where(eq(chat.id, chatId))
			.returning({
				id: chat.id,
				activeBranchId: chat.activeBranchId,
			})
			.then((rows) => rows[0])
	},

	async listVersionBranchesForMessage({
		chatId,
		messageId,
		currentBranchId,
	}: {
		chatId: string
		messageId: string
		currentBranchId: string
	}): Promise<{ parentBranchId: string | null; currentScopeBranchId: string; options: BranchVersionOption[] }> {
		const currentBranch = await db
			.select({
				id: chatBranch.id,
				parentBranchId: chatBranch.parentBranchId,
				forkMessageId: chatBranch.forkMessageId,
			})
			.from(chatBranch)
			.where(and(eq(chatBranch.id, currentBranchId), eq(chatBranch.chatId, chatId)))
			.limit(1)
			.then((rows) => rows[0])

		if (!currentBranch) {
			throw new Error('Branch not found')
		}

		let scopeBranchId = currentBranch.id
		let baseBranchId: string = currentBranch.id

		if (currentBranch.forkMessageId === messageId) {
			baseBranchId = currentBranch.parentBranchId ?? currentBranch.id
		} else {
			let cursorId: string | null = currentBranch.parentBranchId ?? null
			while (cursorId) {
				const b = await db
					.select({
						id: chatBranch.id,
						chatId: chatBranch.chatId,
						parentBranchId: chatBranch.parentBranchId,
						forkMessageId: chatBranch.forkMessageId,
					})
					.from(chatBranch)
					.where(eq(chatBranch.id, cursorId))
					.limit(1)
					.then((rows) => rows[0])

				if (!b || b.chatId !== chatId) break
				if (b.forkMessageId === messageId) {
					scopeBranchId = b.id
					baseBranchId = b.parentBranchId ?? b.id
					break
				}
				cursorId = b.parentBranchId ?? null
			}
		}

		const siblingBranches = await db
			.select({ id: chatBranch.id, forkVersionId: chatBranch.forkVersionId })
			.from(chatBranch)
			.where(
				and(
					eq(chatBranch.chatId, chatId),
					eq(chatBranch.parentBranchId, baseBranchId),
					eq(chatBranch.forkMessageId, messageId)
				)
			)
			.orderBy(asc(chatBranch.createdAt))

		const baseItem = await db
			.select({
				messageVersionId: chatBranchMessage.messageVersionId,
				messageContent: message.content,
				versionContent: messageVersion.content,
			})
			.from(chatBranchMessage)
			.innerJoin(message, eq(chatBranchMessage.messageId, message.id))
			.leftJoin(messageVersion, eq(chatBranchMessage.messageVersionId, messageVersion.id))
			.where(
				and(
					eq(chatBranchMessage.branchId, baseBranchId),
					eq(chatBranchMessage.messageId, messageId)
				)
			)
			.limit(1)
			.then((rows) => rows[0])

		const options: BranchVersionOption[] = []
		if (baseItem) {
			options.push({
				branchId: baseBranchId,
				versionId: baseItem.messageVersionId ?? null,
				content: (baseItem.versionContent ?? baseItem.messageContent) as Record<string, unknown>,
			})
		}

		for (const br of siblingBranches) {
			const item = await db
				.select({
					messageVersionId: chatBranchMessage.messageVersionId,
					messageContent: message.content,
					versionContent: messageVersion.content,
				})
				.from(chatBranchMessage)
				.innerJoin(message, eq(chatBranchMessage.messageId, message.id))
				.leftJoin(messageVersion, eq(chatBranchMessage.messageVersionId, messageVersion.id))
				.where(
					and(
						eq(chatBranchMessage.branchId, br.id),
						eq(chatBranchMessage.messageId, messageId)
					)
				)
				.limit(1)
				.then((rows) => rows[0])

			if (!item) continue
			options.push({
				branchId: br.id,
				versionId: item.messageVersionId ?? br.forkVersionId ?? null,
				content: (item.versionContent ?? item.messageContent) as Record<string, unknown>,
			})
		}

		return {
			parentBranchId: baseBranchId,
			currentScopeBranchId: scopeBranchId,
			options,
		}
	},
}
