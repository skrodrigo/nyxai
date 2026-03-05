import {
	boolean,
	foreignKey,
	index,
	integer,
	json,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// 1. User (tabela base)
export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		name: text('name').notNull(),
		email: text('email').notNull(),
		password: text('password').notNull(),
		emailVerified: boolean('emailVerified').default(false).notNull(),
		image: text('image'),
		occupation: text('occupation'),
		aiInstructions: text('aiInstructions'),
		bio: text('bio'),
		locale: text('locale').default('pt').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
		stripeCustomerId: text('stripeCustomerId'),
	},
	(table) => [unique('users_email_unique').on(table.email)]
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// 2. Email OTP
export const emailOtp = pgTable(
	'email_otp',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		email: text('email').notNull(),
		otpHash: text('otpHash').notNull(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		consumedAt: timestamp('consumedAt', { withTimezone: true }),
		attempts: integer('attempts').default(0).notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('email_otp_email_idx').on(table.email),
		index('email_otp_expires_at_idx').on(table.expiresAt),
	]
)

export type EmailOtp = typeof emailOtp.$inferSelect
export type NewEmailOtp = typeof emailOtp.$inferInsert

// 3. Email Campaign Log
export const emailCampaignLog = pgTable(
	'email_campaign_log',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		campaignKey: text('campaignKey').notNull(),
		sentAt: timestamp('sentAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		unique('email_campaign_log_user_campaign_unique').on(table.userId, table.campaignKey),
		index('email_campaign_log_campaign_idx').on(table.campaignKey),
	]
)

export type EmailCampaignLog = typeof emailCampaignLog.$inferSelect
export type NewEmailCampaignLog = typeof emailCampaignLog.$inferInsert

// 4. Chat - definido em duas etapas para evitar circularidade
export const chat = pgTable(
	'chats',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		title: text('title').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
		pinnedAt: timestamp('pinnedAt', { withTimezone: true }),
		archivedAt: timestamp('archivedAt', { withTimezone: true }),
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		activeBranchId: text('activeBranchId'),
		isPublic: boolean('isPublic').default(false).notNull(),
		sharePath: text('sharePath').unique(),
		model: text('model'),
	},
	(table) => [index('chats_user_id_idx').on(table.userId)]
)

export type Chat = typeof chat.$inferSelect
export type NewChat = typeof chat.$inferInsert

// 5. Message
export const message = pgTable(
	'messages',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		role: text('role').notNull(),
		content: json('content').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		chatId: text('chatId')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
	},
	(table) => [index('messages_chat_id_idx').on(table.chatId)]
)

export type Message = typeof message.$inferSelect
export type NewMessage = typeof message.$inferInsert

// 6. Message Version
export const messageVersion = pgTable(
	'message_versions',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		content: json('content').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		messageId: text('messageId')
			.notNull()
			.references(() => message.id, { onDelete: 'cascade' }),
	},
	(table) => [index('message_versions_message_id_idx').on(table.messageId)]
)

export type MessageVersion = typeof messageVersion.$inferSelect
export type NewMessageVersion = typeof messageVersion.$inferInsert

// 7. Chat Branch - com auto-referência
export const chatBranch = pgTable(
	'chat_branches',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		chatId: text('chatId')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
		parentBranchId: text('parentBranchId'),
		forkMessageId: text('forkMessageId'),
		forkVersionId: text('forkVersionId'),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('chat_branches_chat_id_idx').on(table.chatId),
		index('chat_branches_parent_id_idx').on(table.parentBranchId),
		index('chat_branches_fork_msg_idx').on(table.forkMessageId),
		foreignKey({
			columns: [table.parentBranchId],
			foreignColumns: [table.id],
			name: 'chat_branches_parent_fk',
		}).onDelete('set null'),
	]
)

export type ChatBranch = typeof chatBranch.$inferSelect
export type NewChatBranch = typeof chatBranch.$inferInsert

// 8. Chat Branch Message
export const chatBranchMessage = pgTable(
	'chat_branch_messages',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		branchId: text('branchId')
			.notNull()
			.references(() => chatBranch.id, { onDelete: 'cascade' }),
		messageId: text('messageId')
			.notNull()
			.references(() => message.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		messageVersionId: text('messageVersionId').references(() => messageVersion.id, {
			onDelete: 'set null',
		}),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		unique('chat_branch_messages_branch_pos_unique').on(table.branchId, table.position),
		index('chat_branch_messages_branch_idx').on(table.branchId),
		index('chat_branch_messages_message_idx').on(table.messageId),
		index('chat_branch_messages_version_idx').on(table.messageVersionId),
	]
)

export type ChatBranchMessage = typeof chatBranchMessage.$inferSelect
export type NewChatBranchMessage = typeof chatBranchMessage.$inferInsert

// 9. Subscription
export const subscription = pgTable('subscription', {
	id: text('id').primaryKey().notNull(),
	plan: text('plan').notNull(),
	referenceId: text('referenceId').notNull(),
	stripeCustomerId: text('stripeCustomerId'),
	stripeSubscriptionId: text('stripeSubscriptionId'),
	status: text('status'),
	periodStart: timestamp('periodStart', { withTimezone: true }),
	periodEnd: timestamp('periodEnd', { withTimezone: true }),
	cancelAtPeriodEnd: boolean('cancelAtPeriodEnd'),
	seats: integer('seats'),
})

export type Subscription = typeof subscription.$inferSelect
export type NewSubscription = typeof subscription.$inferInsert

// 10. User Usage
export const userUsage = pgTable(
	'user_usage',
	{
		userId: text('userId')
			.primaryKey()
			.references(() => users.id, { onDelete: 'cascade' }),
		dayCount: integer('dayCount').default(0).notNull(),
		dayWindowStart: timestamp('dayWindowStart', { withTimezone: true }).notNull(),
		weekCount: integer('weekCount').default(0).notNull(),
		weekWindowStart: timestamp('weekWindowStart', { withTimezone: true }).notNull(),
		monthCount: integer('monthCount').default(0).notNull(),
		monthWindowStart: timestamp('monthWindowStart', { withTimezone: true }).notNull(),
	},
	(table) => []
)

export type UserUsage = typeof userUsage.$inferSelect
export type NewUserUsage = typeof userUsage.$inferInsert

// 11. Image Generation
export const imageGeneration = pgTable(
	'image_generations',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		chatId: text('chatId').notNull(),
		messageId: text('messageId'),
		userId: text('userId').notNull(),
		prompt: text('prompt').notNull(),
		model: text('model').notNull(),
		imageUrl: text('imageUrl').notNull(),
		r2Key: text('r2Key').notNull(),
		status: text('status').notNull(),
		error: text('error'),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('image_generations_chat_id_idx').on(table.chatId),
		index('image_generations_user_id_idx').on(table.userId),
		index('image_generations_status_idx').on(table.status),
	]
)

export type ImageGeneration = typeof imageGeneration.$inferSelect
export type NewImageGeneration = typeof imageGeneration.$inferInsert

// 12. Artifact
export const artifact = pgTable(
	'artifacts',
	{
		id: text('id').primaryKey().notNull().default(sql`gen_random_uuid()`),
		chatId: text('chatId')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
		messageId: text('messageId').notNull(),
		title: text('title').notNull(),
		content: json('content').notNull(),
		status: text('status').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('artifacts_chat_id_idx').on(table.chatId),
		index('artifacts_message_id_idx').on(table.messageId),
		index('artifacts_status_idx').on(table.status),
	]
)

export type Artifact = typeof artifact.$inferSelect
export type NewArtifact = typeof artifact.$inferInsert
