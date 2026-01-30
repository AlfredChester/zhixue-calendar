# zhixue-calendar

## Introduction

A CalDAV server based on cloudflare workers to fetch homework on zhixue.com and generate a calendar.

## Usage

1. Clone this repository
2. Make sure you have `npm` and `wrangler` installed and configured
3. Run `npm install` to install dependencies
4.  Run `wrangler deploy` to publish your project
5.  Access `https://www.zhixue.com/middlehomework/web-student/views/#/work-list` and copy your cookie used when fetching `getStudentHomeworkList`  
6.  Run `wrangler secret put ZHIXUE_COOKIE` to store your `zhixue.com` cookie
7.  Your image hosting service is now live! 🎉

## License

This project is licensed under the terms of the GNU General Public License v3.0.
