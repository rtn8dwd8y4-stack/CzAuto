import { getPool } from './db';
import { sendEmail } from './emailService';

const CHECK_INTERVAL = parseInt(process.env.TIMEOUT_CHECK_INTERVAL || '3600000');
const PENDING_HOURS = parseInt(process.env.PENDING_TIMEOUT_HOURS || '24');
const SUPPORT_TEAM_EMAIL = process.env.SUPPORT_EMAIL || '';
const notifiedIds = new Set<number>();

async function checkOnce(): Promise<void> {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT id, submit_id, service_type, company_name, created_at
       FROM applications
       WHERE verify_status IN ('pending', 'unclear')
         AND status = 'pending'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY created_at ASC
       LIMIT 20`,
      [PENDING_HOURS]
    );

    for (const row of rows as any[]) {
      if (notifiedIds.has(row.id)) continue;
      notifiedIds.add(row.id);
      try {
        const hours = Math.round((Date.now() - new Date(row.created_at).getTime()) / 3600000);
        await sendEmail({
          to: SUPPORT_TEAM_EMAIL,
          subject: `【系统提醒】申请超时未确认 - ${row.submit_id}`,
          html: `
            <h3>申请超时提醒</h3>
            <p>以下申请已超过 ${PENDING_HOURS} 小时未获服务商确认，请人工跟进：</p>
            <ul>
              <li><b>申请编号：</b>${row.submit_id}</li>
              <li><b>服务类型：</b>${row.service_type}</li>
              <li><b>客户名称：</b>${row.company_name || '-'}</li>
              <li><b>已等待：</b>${hours} 小时</li>
            </ul>
            <p>此邮件由客户服务申请系统自动发送</p>
          `,
        });
        console.log(`[timeout] 已提醒超时申请 ${row.submit_id} (ID ${row.id}, ${hours}h)`);
      } catch (err) {
        console.error(`[timeout] 提醒发送失败 ${row.submit_id}:`, err);
      }
    }
  } catch (err) {
    console.error('[timeout] 超时检查出错:', err);
  }
}

export function startPendingTimeoutChecker(): void {
  console.log(`[timeout] 超时提醒启动，每 ${CHECK_INTERVAL / 3600000}h 检查，阈值 ${PENDING_HOURS}h`);
  void checkOnce();
  setInterval(() => void checkOnce(), CHECK_INTERVAL);
}
