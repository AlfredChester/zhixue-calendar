import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Zhixue Calendar Worker', () => {
	it('returns error when ZHIXUE_COOKIE is not set (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		// Use env without ZHIXUE_COOKIE to test error handling
		const testEnv = { ...env, ZHIXUE_COOKIE: '' };
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(500);
		expect(await response.text()).toContain('ZHIXUE_COOKIE');
	});

	it('returns proper Content-Type header for calendar', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		// Mock environment with cookie and KV
		const mockKV = {
			get: async () => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR',
			put: async () => {}
		};
		const testEnv = { ...env, ZHIXUE_COOKIE: 'test_cookie', CALENDAR_CACHE: mockKV as unknown as KVNamespace };
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
	});

	it('includes CORS headers for cross-origin requests', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		const mockKV = {
			get: async () => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR',
			put: async () => {}
		};
		const testEnv = { ...env, ZHIXUE_COOKIE: 'test_cookie', CALENDAR_CACHE: mockKV as unknown as KVNamespace };
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});
});
