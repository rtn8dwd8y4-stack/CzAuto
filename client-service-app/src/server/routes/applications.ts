import { Router } from 'express';
import { getApplications, getApplicationById, updateApplicationStatus, updateVerifyStatus, getEmailLogs, resendEmailLog } from '../applicationService';
import { getPool } from '../db';
import { buildCsv } from '../utils/csv';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await getApplications({
      status: req.query.status as string | undefined,
      serviceType: req.query.serviceType as string | undefined,
      companyName: req.query.companyName as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ 查询申请列表失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '查询失败' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { status, serviceType, companyName, verifyStatus, domainMatch, startDate, endDate } = req.query;
    const pool = await getPool();

    let where = 'WHERE 1=1';
    const values: any[] = [];
    if (status) {
      where += ' AND a.status = ?';
      values.push(status);
    }
    if (serviceType) {
      where += ' AND a.service_type = ?';
      values.push(serviceType);
    }
    if (companyName) {
      where += ' AND a.company_name LIKE ?';
      values.push(`%${companyName}%`);
    }
    if (verifyStatus) {
      where += ' AND a.verify_status = ?';
      values.push(verifyStatus);
    }
    if (domainMatch) {
      where += ' AND a.domain_match = ?';
      values.push(domainMatch);
    }
    if (startDate) {
      where += ' AND a.created_at >= ?';
      values.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      where += ' AND a.created_at <= ?';
      values.push(`${endDate} 23:59:59`);
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.submit_id, a.service_type, a.service_name, a.company_name, a.status, a.verify_status,
              a.domain_match, a.applicant_name, a.applicant_email, a.created_at, a.updated_at,
        (SELECT e.recipient_email FROM email_logs e WHERE e.application_id = a.id AND e.recipient_type = 'service_provider' ORDER BY e.id DESC LIMIT 1) as provider_email
       FROM applications a ${where}
       ORDER BY a.created_at DESC
       LIMIT 50000`,
      values
    );

    const statusLabels: Record<string, string> = { pending: '待处理', processing: '处理中', completed: '已完成', rejected: '已驳回' };
    const verifyLabels: Record<string, string> = { pending: '待确认', confirmed: '已确认', rejected: '已拒绝', unclear: '待人工' };
    const domainLabels: Record<string, string> = { customer: '客户库匹配', whitelist: '白名单', unmatched: '域名未匹配', missing_agent: '代理商缺邮箱' };

    const csv = buildCsv(
      ['申请编号', '服务类型', '客户名称', '域名匹配', '服务商邮箱', '验证状态', '处理状态', '申请人', '申请邮箱', '提交时间', '更新时间'],
      (rows as any[]).map((r) => [
        r.submit_id,
        r.service_name,
        r.company_name,
        domainLabels[r.domain_match] || r.domain_match || '',
        r.provider_email || '',
        verifyLabels[r.verify_status] || r.verify_status,
        statusLabels[r.status] || r.status,
        r.applicant_name || '',
        r.applicant_email || '',
        r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '',
        r.updated_at ? new Date(r.updated_at).toLocaleString('zh-CN') : '',
      ])
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=applications_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('❌ 导出申请列表失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '导出失败' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }

    const application = await getApplicationById(id);
    if (!application) {
      return res.status(404).json({ success: false, error: '申请不存在' });
    }

    res.json({ success: true, data: application });
  } catch (error) {
    console.error('❌ 查询申请详情失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '查询失败' });
  }
});

router.get('/:id/emails', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }

    const logs = await getEmailLogs(id);
    res.json({ success: true, list: logs });
  } catch (error) {
    console.error('查询邮件日志失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '查询失败' });
  }
});

router.get('/:id/emails/export', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }
    const { recipientType, logStatus } = req.query;

    const pool = await getPool();
    let where = 'WHERE application_id = ?';
    const values: any[] = [id];
    if (recipientType) {
      where += ' AND recipient_type = ?';
      values.push(recipientType);
    }
    if (logStatus) {
      where += ' AND status = ?';
      values.push(logStatus);
    }

    const [rows] = await pool.query(
      `SELECT id, recipient_type, recipient_email, subject, status, error_message, last_error, sent_at
       FROM email_logs ${where} ORDER BY sent_at ASC`,
      values
    );
    const recipientLabels: Record<string, string> = { service_provider: '服务商', support_team: '售后团队' };

    const csv = buildCsv(
      ['收件人类型', '收件邮箱', '邮件主题', '状态', '错误信息', '发送时间'],
      (rows as any[]).map((l) => [
        recipientLabels[l.recipient_type] || l.recipient_type,
        l.recipient_email || '',
        l.subject || '',
        l.status === 'sent' ? '已发送' : l.status === 'failed' ? '失败' : l.status,
        l.error_message || l.last_error || '',
        l.sent_at ? new Date(l.sent_at).toLocaleString('zh-CN') : '',
      ])
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=email_logs_${id}_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('❌ 导出邮件日志失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '导出失败' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: '缺少 status 参数' });
    }

    const success = await updateApplicationStatus(id, status);
    if (!success) {
      return res.status(404).json({ success: false, error: '申请不存在' });
    }

    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('❌ 更新状态失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '更新失败' });
  }
});

router.patch('/:id/verify', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }

    const { verify_status } = req.body;
    if (!verify_status || !['confirmed', 'rejected'].includes(verify_status)) {
      return res.status(400).json({ success: false, error: 'verify_status 必须为 confirmed 或 rejected' });
    }

    const success = await updateVerifyStatus(id, verify_status);
    if (!success) {
      return res.status(404).json({ success: false, error: '申请不存在' });
    }

    res.json({ success: true, message: '验证状态已更新' });
  } catch (error) {
    console.error('❌ 更新验证状态失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '更新失败' });
  }
});

router.post('/:id/emails/:logId/resend', async (req, res) => {
  try {
    const logId = parseInt(req.params.logId);
    if (isNaN(logId)) {
      return res.status(400).json({ success: false, error: '无效的日志ID' });
    }
    const result = await resendEmailLog(logId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('❌ 重发邮件失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '重发失败' });
  }
});

export default router;