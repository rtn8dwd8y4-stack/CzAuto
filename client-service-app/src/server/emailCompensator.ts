import { getPool } from './db';
import { sendEmail } from './emailService';

const COMPENSATE_INTERVAL = parseInt(process.env.COMPENSATE_INTERVAL || '300000');
const MAX_RETRY = 5;

async function compensateOnce(): Promise<void> {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT e.id, e.application_id, e.recipient_type, e.recipient_email, e.subject,
              a.form_data, a.verify_data, a.submit_id, a.service_type
       FROM email_logs e
       JOIN applications a ON a.id = e.application_id
       WHERE e.status = 'failed' AND e.retry_count < ?
         AND a.status IN ('pending', 'processing')
         AND (
           (e.recipient_type = 'support_team')
           OR (e.recipient_type = 'service_provider' AND a.verify_status = 'pending')
         )
       ORDER BY e.id ASC
       LIMIT 10`,
      [MAX_RETRY]
    );

    for (const row of rows as any[]) {
      let html = '';
      const formData = typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data;
      const verifyData = typeof row.verify_data === 'string' ? JSON.parse(row.verify_data) : row.verify_data;
      if (row.recipient_type === 'service_provider') {
        const { generateServiceProviderEmailHtml } = await import('./emailService');
        html = generateServiceProviderEmailHtml(formData, verifyData, row.submit_id);
      } else {
        const { generateSupportTeamEmailHtml } = await import('./emailService');
        html = generateSupportTeamEmailHtml(formData, verifyData, row.submit_id);
      }

      const attachments = await loadAttachments(row);
      try {
        const result = await sendEmail({
          to: row.recipient_email,
          subject: row.subject,
          html,
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        await pool.query(
          `UPDATE email_logs SET status = 'sent', message_id = ?, last_error = NULL WHERE id = ?`,
          [result.messageId, row.id]
        );
        console.log(`[compensate] 重发成功 email_log ${row.id} (${row.recipient_type} -> ${row.recipient_email})`);
      } catch (err) {
        await pool.query(
          `UPDATE email_logs SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
          [err instanceof Error ? err.message : String(err), row.id]
        );
        console.error(`[compensate] 重发失败 email_log ${row.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[compensate] 补偿扫描出错:', err);
  }
}

async function loadAttachments(row: any): Promise<{ filename: string; path: string }[]> {
  const attachments: { filename: string; path: string }[] = [];
  const pathMod = (await import('path')).default;
  const uploadsDir = process.env.UPLOADS_DIR || pathMod.join(process.cwd(), 'uploads');
  const isPersonal = row.customer_type === 'personal';
  const list: Array<[string | null, string | null]> = [
    [row.business_license_path, !isPersonal ? 'business_license' : null],
    [row.identity_card_path, isPersonal ? 'identity_card' : null],
    [row.application_form_path, 'application_form'],
    [row.disclaimer_path, 'disclaimer'],
  ];
  for (const [p, label] of list) {
    if (!p || !label) continue;
    const filename = `${label}_${row.submit_id}${pathMod.extname(p) || '.bin'}`;
    attachments.push({ filename, path: pathMod.isAbsolute(p) ? p : pathMod.join(uploadsDir, p) });
  }
  return attachments;
}

export function startEmailCompensator(): void {
  console.log(`[compensate] 补偿任务启动，每 ${COMPENSATE_INTERVAL / 1000}s 扫描一次，上限 ${MAX_RETRY} 次`);
  void compensateOnce();
  setInterval(() => void compensateOnce(), COMPENSATE_INTERVAL);
}
