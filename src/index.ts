import ical, { ICalCalendarMethod } from 'ical-generator';

interface Env {
	ZHIXUE_COOKIE: string;
	CALENDAR_CACHE: KVNamespace;
}

interface ZhixueHomework {
	hwId: string;
	subjectName: string;
	hwTitle: string;
	createTime: number;
	endTime: number;
	hwType: number;
	homeWorkState: {
		stateName: string;
		stateCode: number;
	};
	homeWorkTypeDTO: {
		typeName: string;
	};
}

interface ZhixueResponse {
	code: number;
	info: string;
	result: {
		list: Array<ZhixueHomework>;
	};
}

// Cache key for storing the ICS content
const CACHE_KEY = 'zhixue-calendar-ics';
// Cache metadata key for last update timestamp
const CACHE_META_KEY = 'zhixue-calendar-meta';

/**
 * Fetch homework list from Zhixue.com API
 */
async function fetchHomeworkFromZhixue(cookie: string): Promise<ZhixueHomework[]> {
	const params = new URLSearchParams({
		subjectCode: '-1',
		completeStatus: '0',
		pageSize: '500',
		pageIndex: '1'
	});

	const apiUrl = `https://www.zhixue.com/middleweb/homework_middle_service/stuapp/getStudentHomeWorkList?${params.toString()}`;

	const zhixueRes = await fetch(apiUrl, {
		method: 'GET',
		headers: {
			'Cookie': cookie,
			'Referer': 'https://www.zhixue.com/middlehomework/web-student/views/',
			'Origin': 'https://www.zhixue.com',
			'appName': 'com.iflytek.zxzy.web.zx.stu'
		}
	});

	if (!zhixueRes.ok) {
		throw new Error(`Failed to fetch from Zhixue: ${zhixueRes.status} ${zhixueRes.statusText}`);
	}

	const data = await zhixueRes.json() as ZhixueResponse;

	if (data.code !== 200) {
		throw new Error(`Zhixue API error: ${data.info || JSON.stringify(data)}`);
	}

	return data.result.list || [];
}

/**
 * Generate VTIMEZONE component for Asia/Shanghai timezone
 * This is necessary for proper Apple Calendar compatibility
 */
function generateShanghaiVTimezone(): string {
	return [
		'BEGIN:VTIMEZONE',
		'TZID:Asia/Shanghai',
		'X-LIC-LOCATION:Asia/Shanghai',
		'BEGIN:STANDARD',
		'TZOFFSETFROM:+0800',
		'TZOFFSETTO:+0800',
		'TZNAME:CST',
		'DTSTART:19700101T000000',
		'END:STANDARD',
		'END:VTIMEZONE'
	].join('\r\n');
}

/**
 * Generate ICS calendar content from homework list
 * Uses RFC 5545 compliant format with proper headers for Apple Calendar
 */
function generateCalendar(homeworkList: ZhixueHomework[]): string {
	const calendar = ical({
		name: '智学网作业日历',
		prodId: { company: 'zhixue-calendar', product: 'homework', language: 'ZH' },
		// METHOD:PUBLISH is required for subscription calendars (Apple Calendar compatibility)
		method: ICalCalendarMethod.PUBLISH
	});

	// Set timezone - this helps with Apple Calendar compatibility
	calendar.timezone({
		name: 'Asia/Shanghai',
		generator: () => generateShanghaiVTimezone()
	});

	for (const hw of homeworkList) {
		const summary = `[${hw.subjectName}] ${hw.hwTitle}`;
		const description = `类型: ${hw.homeWorkTypeDTO?.typeName || '未知'}\n状态: ${hw.homeWorkState?.stateName || '未知'}\nID: ${hw.hwId}`;

		const endDate = new Date(hw.endTime);
		// Create event at 06:45 on the due date
		const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
		startDate.setHours(6, 45, 0, 0);

		calendar.createEvent({
			id: hw.hwId,
			start: startDate,
			end: new Date(startDate.getTime() + 45 * 60 * 1000), // 45 minute event
			summary: summary,
			description: description,
			location: '智学网',
			url: 'https://www.zhixue.com/middlehomework/web-student/views/',
			timezone: 'Asia/Shanghai'
		});
	}

	return calendar.toString();
}

/**
 * Update cached calendar data by fetching from Zhixue.com
 */
async function updateCalendarCache(env: Env): Promise<string> {
	const homeworkList = await fetchHomeworkFromZhixue(env.ZHIXUE_COOKIE);
	const icsContent = generateCalendar(homeworkList);

	// Store in KV with metadata
	await env.CALENDAR_CACHE.put(CACHE_KEY, icsContent);
	await env.CALENDAR_CACHE.put(CACHE_META_KEY, JSON.stringify({
		lastUpdated: new Date().toISOString(),
		homeworkCount: homeworkList.length
	}));

	return icsContent;
}

/**
 * Generate a simple hash for ETag based on content
 */
function generateETag(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return `"${Math.abs(hash).toString(16)}"`;
}

/**
 * Get cached calendar or fetch fresh data if cache is empty
 */
async function getCachedCalendar(env: Env): Promise<string | null> {
	return await env.CALENDAR_CACHE.get(CACHE_KEY);
}

export default {
	/**
	 * Handle HTTP requests - serve the cached ICS file
	 * Uses proper headers for Apple Calendar / macOS compatibility
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		if (!env.ZHIXUE_COOKIE) {
			return new Response('Error: ZHIXUE_COOKIE secret is not set.', { status: 500 });
		}

		try {
			// Try to get cached calendar
			let icsContent = await getCachedCalendar(env);

			// If no cache exists, fetch fresh data
			if (!icsContent) {
				icsContent = await updateCalendarCache(env);
			}

			// Return ICS with proper headers for Apple Calendar compatibility
			// Reference: RFC 5545 and CalDAV specification
			return new Response(icsContent, {
				status: 200,
				headers: {
					// Standard iCalendar MIME type with charset
					'Content-Type': 'text/calendar; charset=utf-8',
					// Cache control headers for calendar subscriptions
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0',
					// Allow cross-origin requests (for web-based calendar apps)
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
					// ETag for conditional requests (based on content hash)
					'ETag': generateETag(icsContent),
					// Vary header for proper caching behavior
					'Vary': 'Accept-Encoding'
				}
			});
		} catch (error) {
			return new Response(`Internal Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
		}
	},

	/**
	 * Scheduled handler - runs twice daily to update the cached calendar
	 * Triggered by cron: "0 22 * * *" and "0 10 * * *" (UTC)
	 * This corresponds to 6:00 AM and 6:00 PM in China (UTC+8)
	 */
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		if (!env.ZHIXUE_COOKIE) {
			console.error('ZHIXUE_COOKIE secret is not set');
			return;
		}

		try {
			await updateCalendarCache(env);
			console.log(`Calendar cache updated at ${new Date().toISOString()}`);
		} catch (error) {
			console.error(`Failed to update calendar cache: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
} satisfies ExportedHandler<Env>;
