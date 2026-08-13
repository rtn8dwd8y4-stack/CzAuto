import path from 'path';
import fs from 'fs';
import { getPool } from './db';
import { sendEmail, generateServiceProviderEmailHtml, generateSupportTeamEmailHtml } from './emailService';
import { extractDomain, resolveProviderEmail, validateDomain } from './domainService';
import { ApplyFormData, IdentityVerifyData, getServiceConfig } from '../types/apply';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

export interface CreateApplicationParams {
  formData: ApplyFormData;
  verifyData: IdentityVerifyData;
  businessLicenseBase64?: string;
  businessLicenseName?: string;
  identityCardBase64?: string;
  identityCardName?: string;
  applicationFormBase64?: string;
  applicationFormName?: string;
  disclaimerBase64?: string;
  disclaimerName?: string;
  serviceProviderEmail: string;
  supportTeamEmail: string;
}

async function logEmail(params: {
  applicationId: number;
  recipientType: 'service_provider' | 'support_team';
  recipientEmail: string;
  subject: string;
  status: 'sent' | 'failed';
  previewUrl?: string | null;
  messageId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO email_logs (application_id, recipient_type, recipient_email, subject, status, preview_url, message_id, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.applicationId,
      params.recipientType,
      params.recipientEmail,
      params.subject,
      params.status,
      params.previewUrl || null,
      params.messageId || null,
      params.errorMessage || null,
    ]
  );
  console.log(`邮件日志已记录: ${params.recipientType} - ${params.status}`);
}

async function saveBase64File(base64Data: string | undefined, fileName: string | undefined, type: string, submitId: string): Promise<string | null> {
  if (!base64Data || !fileName) return null;

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const ext = fileName.toLowerCase().split('.').pop() || 'bin';
  const safeName = `${type}_${submitId}_${Date.now()}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, safeName);

  const base64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);

  console.log(`${type === 'license' ? '营业执照' : type === 'application' ? '申请书' : '免责声明'} 已保存:`, safeName, '大小:', buffer.length, 'bytes');
  return filePath;
}

export async function createApplication(params: CreateApplicationParams): Promise<{
  id: number;
  submitId: string;
  serviceProviderPreviewUrl: string;
  supportTeamPreviewUrl: string;
}> {
  const {
    formData,
    verifyData,
    businessLicenseBase64,
    businessLicenseName,
    identityCardBase64,
    identityCardName,
    applicationFormBase64,
    applicationFormName,
    disclaimerBase64,
    disclaimerName,
    serviceProviderEmail,
    supportTeamEmail
  } = params;

  const pool = await getPool();
  const serviceConfig = getServiceConfig(formData.serviceType);
  const serviceName = serviceConfig?.name || formData.serviceType;

  const submitId = `RHF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

  const businessLicensePath = await saveBase64File(businessLicenseBase64, businessLicenseName, 'license', submitId);
  const identityCardPath = await saveBase64File(identityCardBase64, identityCardName, 'identity', submitId);
  const applicationFormPath = await saveBase64File(applicationFormBase64, applicationFormName, 'application', submitId);
  const disclaimerPath = await saveBase64File(disclaimerBase64, disclaimerName, 'disclaimer', submitId);

  const [result] = await pool.query(
    `INSERT INTO applications (submit_id, service_type, service_name, company_name, form_data, verify_data,
       business_license_path, business_license_name,
       identity_card_path, identity_card_name,
       application_form_path, application_form_name,
       disclaimer_path, disclaimer_name, status,
       applicant_name, applicant_email,
       customer_type, receive_email, rss_confirmed,
       sub_domains, alias_domains, old_name, new_name,
       expiry_date,
       unbind_devices, unbind_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending',
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      submitId,
      formData.serviceType,
      serviceName,
      formData.companyName || null,
      JSON.stringify(formData),
      JSON.stringify(verifyData),
      businessLicensePath,
      businessLicenseName || null,
      identityCardPath,
      identityCardName || null,
      applicationFormPath,
      applicationFormName || null,
      disclaimerPath,
      disclaimerName || null,
      formData.applicant_name || null,
      formData.applicant_email || null,
      formData.customer_type || null,
      formData.receive_email || null,
      formData.rss_confirmed || null,
      formData.sub_domains ? JSON.stringify(formData.sub_domains) : null,
      formData.alias_domains ? JSON.stringify(formData.alias_domains) : null,
      formData.old_name || null,
      formData.new_name || null,
      formData.expiry_date || null,
      formData.unbind_devices ? JSON.stringify(formData.unbind_devices) : null,
      formData.unbind_reason || null,
    ]
  );

  const insertId = (result as any).insertId;
  console.log('申请已保存到数据库, ID:', insertId, '编号:', submitId);

  // 解析主域名对应的代理商邮箱
  const domain = extractDomain(formData);
  let resolvedProvider: { email: string; agentName: string | null; matched: boolean } | null = null;
  if (domain) {
    resolvedProvider = await resolveProviderEmail(domain);
    console.log('域名解析代理商:', domain, '->', resolvedProvider.email, resolvedProvider.matched ? `(代理商:${resolvedProvider.agentName})` : '(未匹配，走兜底)');
  }

  const actualProviderEmail = resolvedProvider?.email || serviceProviderEmail;
  const providerTag = resolvedProvider?.matched
    ? `[代理商:${resolvedProvider.agentName}]`
    : '[未匹配代理商]';

  const spSubject = `【测试】${providerTag}【客户身份验证请求】${formData.companyName || '客户'} - ${submitId}`;

  let serviceProviderPreviewUrl = '';
  let supportTeamPreviewUrl = '';

  try {
    console.log('发送验证邮件给服务商:', actualProviderEmail);

    const attachments: { filename: string; path: string }[] = [];

    const isPersonal = formData.customer_type === 'personal';

    if (businessLicensePath && !isPersonal) {
      const ext = path.extname(businessLicenseName || '').slice(1) || 'png';
      attachments.push({
        filename: `business_license_${submitId}.${ext}`,
        path: businessLicensePath,
      });
    }
    if (identityCardPath && isPersonal) {
      const ext = path.extname(identityCardName || '').slice(1) || 'png';
      attachments.push({
        filename: `identity_card_${submitId}.${ext}`,
        path: identityCardPath,
      });
    }
    if (applicationFormPath) {
      const ext = path.extname(applicationFormName || '').slice(1) || 'doc';
      attachments.push({
        filename: `application_form_${submitId}.${ext}`,
        path: applicationFormPath,
      });
    }
    if (disclaimerPath) {
      const ext = path.extname(disclaimerName || '').slice(1) || 'doc';
      attachments.push({
        filename: `disclaimer_${submitId}.${ext}`,
        path: disclaimerPath,
      });
    }

    const serviceProviderResult = await sendEmail({
      to: actualProviderEmail,
      subject: spSubject,
      html: generateServiceProviderEmailHtml(formData, verifyData, submitId),
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    serviceProviderPreviewUrl = '';

    await logEmail({
      applicationId: insertId,
      recipientType: 'service_provider',
      recipientEmail: actualProviderEmail,
      subject: spSubject,
      status: 'sent',
      previewUrl: null,
      messageId: serviceProviderResult.messageId,
    });

    console.log('验证邮件已发送，等待服务商回复确认...');
  } catch (error) {
    console.error('服务商邮件发送失败:', error);
    await logEmail({
      applicationId: insertId,
      recipientType: 'service_provider',
      recipientEmail: actualProviderEmail,
      subject: spSubject,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    id: insertId,
    submitId,
    serviceProviderPreviewUrl,
    supportTeamPreviewUrl,
  };
}

export async function getApplications(params: {
  status?: string;
  serviceType?: string;
  companyName?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ total: number; page: number; pageSize: number; list: any[] }> {
  const pool = await getPool();
  const { status, serviceType, companyName, page = 1, pageSize = 20 } = params;

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

  const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM applications a ${where}`, values);
  const total = (countRows as any[])[0].total;

  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT a.id, a.submit_id, a.service_type, a.service_name, a.company_name, a.status, a.verify_status, a.created_at, a.updated_at,
            a.applicant_name, a.applicant_email, a.customer_type, a.expiry_date, a.extend_date, a.rss_confirmed, a.old_name, a.new_name,
            a.domain_match,
       (SELECT COUNT(*) FROM email_logs e WHERE e.application_id = a.id AND e.status = 'sent') as email_sent_count,
       (SELECT COUNT(*) FROM email_logs e WHERE e.application_id = a.id AND e.status = 'failed') as email_failed_count,
       (SELECT COUNT(*) FROM email_logs e WHERE e.application_id = a.id) as email_total_count,
       (SELECT e.recipient_email FROM email_logs e WHERE e.application_id = a.id AND e.recipient_type = 'service_provider' ORDER BY e.id DESC LIMIT 1) as provider_email
     FROM applications a ${where}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset]
  );

  return {
    total,
    page,
    pageSize,
    list: rows as any[],
  };
}

export async function getApplicationById(id: number): Promise<any | null> {
  const pool = await getPool();
  const [rows] = await pool.query('SELECT * FROM applications WHERE id = ?', [id]);

  const list = rows as any[];
  if (list.length === 0) return null;

  const row = list[0];
  return {
    ...row,
    form_data: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data,
    verify_data: typeof row.verify_data === 'string' ? JSON.parse(row.verify_data) : row.verify_data,
  };
}

export async function getEmailLogs(applicationId: number): Promise<any[]> {
  const pool = await getPool();
  const [rows] = await pool.query(
    'SELECT * FROM email_logs WHERE application_id = ? ORDER BY sent_at ASC',
    [applicationId]
  );
  return rows as any[];
}

export async function updateApplicationStatus(id: number, status: string): Promise<boolean> {
  const pool = await getPool();
  const validStatuses = ['pending', 'processing', 'completed', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw new Error(`无效状态: ${status}`);
  }

  const [result] = await pool.query('UPDATE applications SET status = ? WHERE id = ?', [status, id]);
  return (result as any).affectedRows > 0;
}

export async function updateVerifyStatus(id: number, verifyStatus: string): Promise<boolean> {
  const pool = await getPool();
  const validStatuses = ['pending', 'confirmed', 'rejected', 'unclear'];
  if (!validStatuses.includes(verifyStatus)) {
    throw new Error(`无效验证状态: ${verifyStatus}`);
  }

  const [result] = await pool.query(
    'UPDATE applications SET verify_status = ?, verified_at = NOW() WHERE id = ?',
    [verifyStatus, id]
  );
  return (result as any).affectedRows > 0;
}

export async function resendEmailLog(logId: number): Promise<{ success: boolean; message: string }> {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT e.*, a.form_data, a.verify_data, a.submit_id, a.service_type,
            a.status AS app_status, a.verify_status AS app_verify_status
     FROM email_logs e JOIN applications a ON a.id = e.application_id
     WHERE e.id = ?`,
    [logId]
  );
  const list = rows as any[];
  if (list.length === 0) return { success: false, message: '邮件日志不存在' };
  const log = list[0];
  if (log.status === 'sent') return { success: false, message: '该邮件已发送成功，无需重发' };

  if (!['pending', 'processing'].includes(log.app_status)) {
    return { success: false, message: '该申请流程已结束（非待处理/处理中），不允许重发' };
  }
  if (log.recipient_type === 'service_provider' && log.app_verify_status !== 'pending') {
    return { success: false, message: '该申请身份验证已确认/拒绝，无需重发验证请求' };
  }

  const formData = typeof log.form_data === 'string' ? JSON.parse(log.form_data) : log.form_data;
  const verifyData = typeof log.verify_data === 'string' ? JSON.parse(log.verify_data) : log.verify_data;

  let html: string;
  if (log.recipient_type === 'service_provider') {
    html = generateServiceProviderEmailHtml(formData, verifyData, log.submit_id);
  } else {
    html = generateSupportTeamEmailHtml(formData, verifyData, log.submit_id);
  }

  const attachments: { filename: string; path: string }[] = [];
  const isPersonal = formData.customer_type === 'personal';
  const attachmentCandidates: Array<[string | null, string | null]> = [
    [log.business_license_path, !isPersonal ? 'business_license' : null],
    [log.identity_card_path, isPersonal ? 'identity_card' : null],
    [log.application_form_path, 'application_form'],
    [log.disclaimer_path, 'disclaimer'],
  ];
  for (const [p, label] of attachmentCandidates) {
    if (!p || !label) continue;
    const abs = path.isAbsolute(p) ? p : path.join(UPLOADS_DIR, p);
    if (fs.existsSync(abs)) {
      attachments.push({ filename: `${label}_${log.submit_id}${path.extname(p) || '.bin'}`, path: abs });
    }
  }

  try {
    const result = await sendEmail({
      to: log.recipient_email,
      subject: log.subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    await pool.query(
      `UPDATE email_logs SET status = 'sent', message_id = ?, error_message = NULL, retry_count = 0, sent_at = NOW() WHERE id = ?`,
      [result.messageId, logId]
    );
    console.log(`[resend] 手动重发成功 email_log ${logId}`);
    return { success: true, message: '重发成功' };
  } catch (error) {
    await pool.query(
      `UPDATE email_logs SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
      [error instanceof Error ? error.message : String(error), logId]
    );
    console.error('[resend] 手动重发失败:', error);
    return { success: false, message: '重发失败: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

export interface EmailAttachmentInput {
  type: 'businessLicense' | 'identityCard' | 'applicationForm' | 'disclaimer';
  filename: string;
  buffer: Buffer;
}

export interface CreateApplicationFromEmailParams {
  submitId: string;
  formData: ApplyFormData;
  verifyData: IdentityVerifyData;
  attachments: EmailAttachmentInput[];
}

async function saveBufferFile(buffer: Buffer, fileName: string, type: string, submitId: string): Promise<{ path: string; name: string } | null> {
  if (!buffer || !fileName) return null;
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = fileName.toLowerCase().split('.').pop() || 'bin';
  const safeName = `${type}_${submitId}_${Date.now()}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(filePath, buffer);
  console.log(`${type === 'license' ? '营业执照' : type === 'application' ? '申请书' : type === 'identity' ? '身份证' : '免责声明'} 已保存:`, safeName, '大小:', buffer.length, 'bytes');
  return { path: filePath, name: fileName };
}

async function classifyDomain(domain: string | null): Promise<string | null> {
  if (!domain) return null;
  try {
    const check = await validateDomain(domain);
    if (!check.valid) return 'unmatched';
    return check.reason === 'whitelist_match' ? 'whitelist' : 'customer';
  } catch (err) {
    console.error('[inbound] 域名校验异常:', err);
    return null;
  }
}

export async function createApplicationFromEmail(params: CreateApplicationFromEmailParams): Promise<{ id: number; submitId: string }> {
  const { submitId: inputSubmitId, formData, verifyData, attachments } = params;
  const pool = await getPool();
  const serviceConfig = getServiceConfig(formData.serviceType);
  const serviceName = serviceConfig?.name || formData.serviceType;

  let submitId = inputSubmitId;
  let businessLicense = null, identityCard = null, applicationForm = null, disclaimerFile = null;
  for (const att of attachments) {
    const saved = await saveBufferFile(att.buffer, att.filename, att.type === 'businessLicense' ? 'license' : att.type === 'identityCard' ? 'identity' : att.type === 'applicationForm' ? 'application' : 'disclaimer', submitId);
    if (!saved) continue;
    if (att.type === 'businessLicense') businessLicense = saved;
    else if (att.type === 'identityCard') identityCard = saved;
    else if (att.type === 'applicationForm') applicationForm = saved;
    else if (att.type === 'disclaimer') disclaimerFile = saved;
  }

  let insertId = 0;
  let success = false;
  const domain = extractDomain(formData);
  const domainMatch = await classifyDomain(domain);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [result] = await pool.query(
        `INSERT INTO applications (submit_id, service_type, service_name, company_name, form_data, verify_data,
           business_license_path, business_license_name,
           identity_card_path, identity_card_name,
           application_form_path, application_form_name,
           disclaimer_path, disclaimer_name, status,
           applicant_name, applicant_email,
           customer_type, receive_email, rss_confirmed,
           sub_domains, alias_domains, old_name, new_name,
           expiry_date,
           unbind_devices, unbind_reason, domain_match)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          submitId,
          formData.serviceType,
          serviceName,
          formData.companyName || null,
          JSON.stringify(formData),
          JSON.stringify(verifyData),
          businessLicense?.path || null,
          businessLicense?.name || null,
          identityCard?.path || null,
          identityCard?.name || null,
          applicationForm?.path || null,
          applicationForm?.name || null,
          disclaimerFile?.path || null,
          disclaimerFile?.name || null,
          'pending',
          formData.applicant_name || null,
          formData.applicant_email || null,
          formData.customer_type || null,
          formData.receive_email || null,
          formData.rss_confirmed || null,
          formData.sub_domains ? JSON.stringify(formData.sub_domains) : null,
          formData.alias_domains ? JSON.stringify(formData.alias_domains) : null,
          formData.old_name || null,
          formData.new_name || null,
          formData.expiry_date || null,
          formData.unbind_devices ? JSON.stringify(formData.unbind_devices) : null,
          formData.unbind_reason || null,
          domainMatch,
        ]
      );
      insertId = (result as any).insertId;
      success = true;
      break;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' && attempt === 0) {
        const newId = `RHF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        console.warn(`[inbound] submitId 冲突 ${submitId} → 重新生成 ${newId}`);
        submitId = newId;
        businessLicense = identityCard = applicationForm = disclaimerFile = null;
        for (const att of attachments) {
          const saved = await saveBufferFile(att.buffer, att.filename, att.type === 'businessLicense' ? 'license' : att.type === 'identityCard' ? 'identity' : att.type === 'applicationForm' ? 'application' : 'disclaimer', submitId);
          if (!saved) continue;
          if (att.type === 'businessLicense') businessLicense = saved;
          else if (att.type === 'identityCard') identityCard = saved;
          else if (att.type === 'applicationForm') applicationForm = saved;
          else if (att.type === 'disclaimer') disclaimerFile = saved;
        }
        continue;
      }
      throw err;
    }
  }
  if (!success) throw new Error('insert failed');
  console.log('[inbound] 申请已入库, ID:', insertId, '编号:', submitId, '域名匹配:', domainMatch);

  const fallback = process.env.FALLBACK_EMAIL || '';
  let actualProviderEmail = fallback;
  let providerTag = '[域名未匹配]';

  if (domainMatch === 'customer') {
    let resolvedProvider: { email: string; agentName: string | null; matched: boolean } | null = null;
    if (domain) {
      resolvedProvider = await resolveProviderEmail(domain);
      console.log('[inbound] 域名解析:', domain, '->', resolvedProvider.email, resolvedProvider.matched ? `(代理商:${resolvedProvider.agentName})` : '(客户库匹配但代理商邮箱缺失)');
    }
    if (resolvedProvider?.matched) {
      actualProviderEmail = resolvedProvider.email;
      providerTag = `[代理商:${resolvedProvider.agentName}]`;
    } else {
      providerTag = `[代理商邮箱缺失:${resolvedProvider?.agentName || '未知'}]`;
    }
  } else if (domainMatch === 'whitelist') {
    providerTag = '[白名单域名]';
  }
  const spSubject = `【测试】${providerTag}【客户身份验证请求】${formData.companyName || '客户'} - ${submitId}`;

  try {
    const attachmentsOut: { filename: string; path: string }[] = [];
    const isPersonal = formData.customer_type === 'personal';
    if (businessLicense && !isPersonal) attachmentsOut.push({ filename: `business_license_${submitId}.${path.extname(businessLicense.name).slice(1) || 'png'}`, path: businessLicense.path });
    if (identityCard && isPersonal) attachmentsOut.push({ filename: `identity_card_${submitId}.${path.extname(identityCard.name).slice(1) || 'png'}`, path: identityCard.path });
    if (applicationForm) attachmentsOut.push({ filename: `application_form_${submitId}.${path.extname(applicationForm.name).slice(1) || 'doc'}`, path: applicationForm.path });
    if (disclaimerFile) attachmentsOut.push({ filename: `disclaimer_${submitId}.${path.extname(disclaimerFile.name).slice(1) || 'doc'}`, path: disclaimerFile.path });

    console.log('[inbound] 发送验证邮件给服务商:', actualProviderEmail);
    const serviceProviderResult = await sendEmail({
      to: actualProviderEmail,
      subject: spSubject,
      html: generateServiceProviderEmailHtml(formData, verifyData, submitId),
      attachments: attachmentsOut.length > 0 ? attachmentsOut : undefined,
    });
    await logEmail({
      applicationId: insertId,
      recipientType: 'service_provider',
      recipientEmail: actualProviderEmail,
      subject: spSubject,
      status: 'sent',
      previewUrl: null,
      messageId: serviceProviderResult.messageId,
    });
  } catch (error) {
    console.error('[inbound] 服务商邮件发送失败:', error);
    await logEmail({
      applicationId: insertId,
      recipientType: 'service_provider',
      recipientEmail: actualProviderEmail,
      subject: spSubject,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return { id: insertId, submitId };
}