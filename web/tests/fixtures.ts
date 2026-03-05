import { test as base, expect } from '@playwright/test'

export type TestFixtures = {
	loginPage: string
}

export const test = base.extend<TestFixtures>({
	loginPage: async ({ baseURL }, use) => {
		await use(`${baseURL}/login`)
	},
})

export { expect }
