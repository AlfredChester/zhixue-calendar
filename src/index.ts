import ical from 'ical-generator';

interface Env {
	ZHIXUE_COOKIE: string;
}

interface ZhixueResponse {
	code: number;
	info: string;
	result: {
		list: Array<{
			hwId: string;
			subjectName: string;
			hwTitle: string;
			createTime: number; // Start time
			endTime: number;    // Due date
			hwType: number;
			homeWorkState: {
				stateName: string;
				stateCode: number;
			};
			homeWorkTypeDTO: {
				typeName: string;
			};
		}>;
	};
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// 1. 检查环境变量
		if (!env.ZHIXUE_COOKIE) {
			return new Response('Error: ZHIXUE_COOKIE secret is not set. Please set it in Cloudflare Dashboard or via wrangler secret put.', { status: 500 });
		}

		// 2. 构造请求参数
		// subjectCode 设为 -1 以获取所有学科
		const params = new URLSearchParams({
			subjectCode: '-1',
			completeStatus: '0',
			pageSize: '500',
			pageIndex: '1'
		});

		const apiUrl = `https://www.zhixue.com/middleweb/homework_middle_service/stuapp/getStudentHomeWorkList?${params.toString()}`;

		console.log(`Fetching Zhixue homework data from: ${apiUrl}`);

		try {
			// 3. 发起请求到智学网
			const zhixueRes = await fetch(apiUrl, {
				method: 'GET',
				headers: {
					'Cookie': env.ZHIXUE_COOKIE,
					'Referer': 'https://www.zhixue.com/middlehomework/web-student/views/',
					'Origin': 'https://www.zhixue.com',
					'appName': 'com.iflytek.zxzy.web.zx.stu' // 必带
				}
			});

			if (!zhixueRes.ok) {
				return new Response(`Error fetching data from Zhixue: ${zhixueRes.status} ${zhixueRes.statusText}`, { status: 502 });
			}

			const data = await zhixueRes.json() as ZhixueResponse;

			if (data.code !== 200) {
				return new Response(`Zhixue API returned error: ${data.info || JSON.stringify(data)}`, { status: 502 });
			}

			// 4. 生成日历
			const calendar = ical({
				name: '智学网作业日历',
				timezone: 'Asia/Shanghai'
			});

			const homeworkList = data.result.list || [];

			for (const hw of homeworkList) {
				// 标题: [科目] 作业标题
				const summary = `[${hw.subjectName}] ${hw.hwTitle}`;

				// 描述: 类型 - 状态
				const description = `类型: ${hw.homeWorkTypeDTO?.typeName || '未知'}\n状态: ${hw.homeWorkState?.stateName || '未知'}\nID: ${hw.hwId}`;

				// 时间处理
				let end = new Date(hw.endTime);

				// 计算日期，创建当天 06:45 到 07:30 之间的事件
				const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
				start.setHours(6, 45, 0, 0);

				calendar.createEvent({
					id: hw.hwId,
					start: start,
					end: new Date(start.getTime() + 45 * 60 * 1000), // 45 分钟事件
					summary: summary,
					description: description,
					location: '智学网',
					url: 'https://www.zhixue.com/middlehomework/web-student/views/'
				});
			}

			// 5. 返回 .ics 格式
			return new Response(calendar.toString(), {
				headers: {
					'Content-Type': 'text/calendar; charset=utf-8',
					'Content-Disposition': 'attachment; filename="zhixue-homework.ics"'
				}
			});

		} catch (error) {
			return new Response(`Internal Exception: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
