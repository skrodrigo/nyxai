import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AppVariables } from './routes.js'
import { authMiddleware } from './../middlewares/auth.middleware.js'
import { db } from '../common/db.js'
import { stripe } from './../common/stripe.js'
import { eq, and, inArray, isNotNull, or } from 'drizzle-orm'
import { users, subscription } from '../db/schema.js'

const accountRouter = new OpenAPIHono<{ Variables: AppVariables }>()
accountRouter.use('*', authMiddleware)

const profileSchema = z.object({
	name: z.string().min(1).max(80).optional(),
	occupation: z.string().min(1).max(80).nullable().optional(),
	aiInstructions: z.string().min(1).max(4000).nullable().optional(),
	bio: z.string().min(1).max(1000).nullable().optional(),
})

const localeSchema = z.object({
	locale: z.enum(['en', 'fr', 'es', 'pt']),
})

const getProfileRoute = createRoute({
	method: 'get',
	path: '/profile',
	tags: ['Account'],
	responses: {
		200: {
			description: 'Profile',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						data: profileSchema.extend({ name: z.string().min(1) }),
					}),
				},
			},
		},
		404: { description: 'Not found' },
	},
})

const patchProfileRoute = createRoute({
	method: 'patch',
	path: '/profile',
	tags: ['Account'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: profileSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: 'Updated',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						data: profileSchema.extend({ name: z.string().min(1) }),
					}),
				},
			},
		},
		404: { description: 'Not found' },
	},
})

const deleteRoute = createRoute({
	method: 'delete',
	path: '/',
	tags: ['Account'],
	responses: {
		200: {
			description: 'Deleted',
			content: {
				'application/json': {
					schema: z.object({ success: z.boolean() }),
				},
			},
		},
	},
})

const getLocaleRoute = createRoute({
	method: 'get',
	path: '/locale',
	tags: ['Account'],
	responses: {
		200: {
			description: 'Locale',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						data: localeSchema,
					}),
				},
			},
		},
		404: {
			description: 'Not found',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						error: z.string(),
						statusCode: z.number(),
					}),
				},
			},
		},
	},
})

const patchLocaleRoute = createRoute({
	method: 'patch',
	path: '/locale',
	tags: ['Account'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: localeSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: 'Updated',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						data: localeSchema,
					}),
				},
			},
		},
	},
})

accountRouter.openapi(getProfileRoute, async (c) => {
	const authUser = c.get('user')
	const userId = authUser!.id

	const userData = await db
		.select({
			name: users.name,
			occupation: users.occupation,
			aiInstructions: users.aiInstructions,
			bio: users.bio,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1)

	if (userData.length === 0) return c.json({ success: false, error: 'Not found', statusCode: 404 }, 404)

	return c.json({ success: true, data: userData[0] }, 200)
})

accountRouter.openapi(patchProfileRoute, async (c) => {
	const authUser = c.get('user')
	const userId = authUser!.id
	const payload = c.req.valid('json')

	const updateData: Record<string, unknown> = {}
	if (typeof payload.name === 'string') updateData.name = payload.name.trim()
	if (typeof payload.occupation === 'string') updateData.occupation = payload.occupation.trim()
	if (payload.occupation === null) updateData.occupation = null
	if (typeof payload.aiInstructions === 'string') updateData.aiInstructions = payload.aiInstructions.trim()
	if (payload.aiInstructions === null) updateData.aiInstructions = null
	if (typeof payload.bio === 'string') updateData.bio = payload.bio.trim()
	if (payload.bio === null) updateData.bio = null

	const updated = await db
		.update(users)
		.set(updateData)
		.where(eq(users.id, userId))
		.returning({
			name: users.name,
			occupation: users.occupation,
			aiInstructions: users.aiInstructions,
			bio: users.bio,
		})
		.then((rows) => rows[0])

	return c.json({ success: true, data: updated }, 200)
})

accountRouter.openapi(deleteRoute, async (c) => {
	const authUser = c.get('user')
	const userId = authUser!.id

	const userData = await db
		.select({ id: users.id, stripeCustomerId: users.stripeCustomerId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1)

	const stripeCustomerId = userData[0]?.stripeCustomerId ?? null

	const subscriptionData = await db
		.select({ stripeSubscriptionId: subscription.stripeSubscriptionId })
		.from(subscription)
		.where(
			and(
				eq(subscription.referenceId, userId),
				isNotNull(subscription.stripeSubscriptionId),
				inArray(subscription.status, ['active', 'trialing', 'past_due', 'incomplete'])
			)
		)
		.limit(1)

	const stripeSubscriptionId = subscriptionData[0]?.stripeSubscriptionId ?? null
	if (stripeSubscriptionId) {
		try {
			await stripe.subscriptions.cancel(stripeSubscriptionId)
		} catch {
		}
	}

	if (stripeCustomerId) {
		try {
			await stripe.customers.del(stripeCustomerId)
		} catch {
		}
	}

	await db
		.delete(subscription)
		.where(
			or(
				eq(subscription.referenceId, userId),
				stripeCustomerId ? eq(subscription.stripeCustomerId, stripeCustomerId) : undefined
			)
		)

	await db.delete(users).where(eq(users.id, userId))

	return c.json({ success: true }, 200)
})

accountRouter.openapi(getLocaleRoute, async (c) => {
	const authUser = c.get('user')
	const userId = authUser!.id

	const userData = await db
		.select({ locale: users.locale })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1)

	if (userData.length === 0) return c.json({ success: false, error: 'Not found', statusCode: 404 }, 404)

	return c.json({ success: true, data: { locale: userData[0].locale as 'en' | 'fr' | 'es' | 'pt' } }, 200)
})

accountRouter.openapi(patchLocaleRoute, async (c) => {
	const authUser = c.get('user')
	const userId = authUser!.id
	const payload = c.req.valid('json')

	const updated = await db
		.update(users)
		.set({ locale: payload.locale })
		.where(eq(users.id, userId))
		.returning({ locale: users.locale })
		.then((rows) => rows[0])

	return c.json({ success: true, data: { locale: updated.locale as 'en' | 'fr' | 'es' | 'pt' } }, 200)
})

export default accountRouter
