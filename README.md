# zhixue-calendar

## Introduction

A CalDAV server based on Cloudflare Workers to fetch homework from zhixue.com and generate a calendar. The calendar is updated twice daily (at 6:00 AM and 6:00 PM China time) and cached for better performance.

## Features

- **Automatic Updates**: Fetches homework data twice daily using Cloudflare Workers scheduled triggers
- **Caching**: Uses Cloudflare KV to cache the generated ICS calendar for fast responses
- **Apple Calendar Compatible**: Fully RFC 5545 compliant with proper VTIMEZONE and METHOD headers for macOS/iOS Calendar app compatibility
- **Cross-Platform**: Works with any calendar application that supports ICS/CalDAV subscriptions

## Usage

### Prerequisites

1. Make sure you have `npm` and `wrangler` installed and configured
2. A Cloudflare account with Workers enabled

### Setup Steps

1. Clone this repository:
   ```bash
   git clone https://github.com/AlfredChester/zhixue-calendar.git
   cd zhixue-calendar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a KV namespace for caching:
   ```bash
   wrangler kv namespace create CALENDAR_CACHE
   ```

4. Update `wrangler.jsonc` with your KV namespace ID:
   ```jsonc
   "kv_namespaces": [
       {
           "binding": "CALENDAR_CACHE",
           "id": "YOUR_KV_NAMESPACE_ID"  // Replace with the ID from step 3
       }
   ]
   ```

5. Deploy your worker:
   ```bash
   wrangler deploy
   ```

6. Access `https://www.zhixue.com/middlehomework/web-student/views/#/work-list` and copy your cookie used when fetching `getStudentHomeworkList`

7. Store your cookie as a secret:
   ```bash
   wrangler secret put ZHIXUE_COOKIE
   ```

8. Your zhixue calendar service is now live! 🎉

### Subscribing to the Calendar

#### Apple Calendar (macOS/iOS)
1. Open Calendar app
2. Go to File → New Calendar Subscription (or use ⌥⌘S)
3. Enter your worker URL (replace `<your-subdomain>` with your Cloudflare Workers subdomain):
   ```
   https://zhixue-calendar.<your-subdomain>.workers.dev
   ```
   > **Tip**: Find your subdomain in the Cloudflare Dashboard under Workers & Pages → Overview
4. Click Subscribe and configure refresh interval

#### Google Calendar
1. Go to Settings → Add calendar → From URL
2. Enter your worker URL
3. Click Add calendar

#### Other Calendar Apps
Most calendar applications support subscribing to ICS/iCalendar URLs. Look for "Subscribe to calendar" or "Add calendar from URL" option.

## Architecture

- **Scheduled Triggers**: Two cron jobs run at `0 22 * * *` and `0 10 * * *` (UTC), which correspond to 6:00 AM and 6:00 PM in China (UTC+8)
- **KV Storage**: Calendar data is cached in Cloudflare KV for fast responses
- **HTTP Handler**: Serves the cached ICS file with proper headers for calendar app compatibility

## Technical Notes

### Apple Calendar Compatibility

The following headers and features ensure compatibility with Apple Calendar:
- `Content-Type: text/calendar; charset=utf-8`
- `METHOD:PUBLISH` in the ICS content (required for subscription calendars)
- Proper VTIMEZONE component for Asia/Shanghai timezone
- RFC 5545 compliant event formatting

### API Endpoint

The worker responds to any HTTP GET request with the cached ICS calendar file.

## License

This project is licensed under the terms of the GNU General Public License v3.0.
