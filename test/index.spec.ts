import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker, { getLastScheduledTime, isCacheInValidPeriod } from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Mock ICS calendar content for testing
const MOCK_ICS_CONTENT = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR';

// Current deployment version (must match src/index.ts)
const DEPLOYMENT_VERSION = '2026-02-06';

// Mock KV namespace for testing with proper cache structure
function createMockKV(cachedContent: string | null = MOCK_ICS_CONTENT, options: { stale?: boolean, noMeta?: boolean, wrongDeployment?: boolean } = {}) {
	const now = new Date();
	const lastUpdated = options.stale 
		? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
		: now.toISOString();
	
	const kvStore: Record<string, string | null> = {
		'zhixue-calendar-ics': cachedContent,
		'zhixue-calendar-meta': options.noMeta ? null : JSON.stringify({
			lastUpdated,
			homeworkCount: 5
		}),
		'zhixue-calendar-deployment': options.wrongDeployment ? 'old-version' : DEPLOYMENT_VERSION
	};
	
	return {
		get: async (key: string) => kvStore[key] ?? null,
		put: async () => {}
	} as unknown as KVNamespace;
}

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
		const testEnv = { ...env, ZHIXUE_COOKIE: 'test_cookie', CALENDAR_CACHE: createMockKV() };
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
	});

	it('includes CORS headers for cross-origin requests', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		const testEnv = { ...env, ZHIXUE_COOKIE: 'test_cookie', CALENDAR_CACHE: createMockKV() };
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('returns cached ICS content from KV', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		const testEnv = { ...env, ZHIXUE_COOKIE: 'test_cookie', CALENDAR_CACHE: createMockKV() };
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		const content = await response.text();
		expect(content).toContain('BEGIN:VCALENDAR');
		expect(content).toContain('METHOD:PUBLISH');
	});
});

describe('Cache Validation Logic', () => {
	describe('getLastScheduledTime', () => {
		it('returns 22:00 UTC when current time is 23:00 UTC', () => {
			// 23:00 UTC on Feb 6, 2026
			const now = new Date('2026-02-06T23:00:00Z');
			const result = getLastScheduledTime(now);
			expect(result.getUTCHours()).toBe(22);
			expect(result.getUTCDate()).toBe(6);
		});

		it('returns 10:00 UTC when current time is 15:00 UTC', () => {
			// 15:00 UTC on Feb 6, 2026 (between 10:00 and 22:00)
			const now = new Date('2026-02-06T15:00:00Z');
			const result = getLastScheduledTime(now);
			expect(result.getUTCHours()).toBe(10);
			expect(result.getUTCDate()).toBe(6);
		});

		it('returns 22:00 UTC previous day when current time is 08:00 UTC', () => {
			// 08:00 UTC on Feb 6, 2026 (before first scheduled time at 10:00)
			const now = new Date('2026-02-06T08:00:00Z');
			const result = getLastScheduledTime(now);
			expect(result.getUTCHours()).toBe(22);
			expect(result.getUTCDate()).toBe(5); // Previous day
		});
	});

	describe('isCacheInValidPeriod', () => {
		it('returns true when cache was updated after last scheduled time', () => {
			const now = new Date('2026-02-06T15:00:00Z');
			const lastUpdated = new Date('2026-02-06T11:00:00Z'); // After 10:00 UTC
			expect(isCacheInValidPeriod(lastUpdated, now)).toBe(true);
		});

		it('returns false when cache was updated before last scheduled time', () => {
			const now = new Date('2026-02-06T15:00:00Z');
			const lastUpdated = new Date('2026-02-06T09:00:00Z'); // Before 10:00 UTC
			expect(isCacheInValidPeriod(lastUpdated, now)).toBe(false);
		});

		it('returns false when cache was updated a day ago', () => {
			const now = new Date('2026-02-06T15:00:00Z');
			const lastUpdated = new Date('2026-02-05T11:00:00Z'); // Previous day
			expect(isCacheInValidPeriod(lastUpdated, now)).toBe(false);
		});
	});
});
