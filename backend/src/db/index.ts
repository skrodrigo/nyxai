import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { env } from '../common/env.js'
import * as schema from './schema.js'

const connectionString = env.DATABASE_URL

const client = postgres(connectionString, {
	prepare: false,
	max: 10,
})

export const db = drizzle(client, { schema })

export type Database = typeof db
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export { schema }
