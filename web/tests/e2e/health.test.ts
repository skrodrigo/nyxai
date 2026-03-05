import { test, expect } from '@playwright/test'

test.describe('health check', () => {
	test('/ping endpoint returns pong', async ({ request }) => {
		const response = await request.get('/ping')
		expect(response.status()).toBe(200)
		const body = await response.text()
		expect(body).toBe('pong')
	})
})
