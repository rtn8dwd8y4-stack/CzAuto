import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { getPool } from './db';
import { sendEmail, generateSupportTeamEmailHtml, generateRejectedEmailHtml } from './emailService';
import { ApplyFormData, IdentityVerifyData } from '../types/apply';

const IMAP_CONFIG = {
  host: process.env.IMAP_HOST || '',
  port: parseInt(process.env.IMAP_PORT || '993'),
  secure: true,
  auth: {
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
  },
  logger: false as const,
  tls: {
    rejectUnauthorized: false,
  },
};

const POLL_INTERVAL = 30000;
const SUPPORT_TEAM_EMAIL = process.env.SUPPORT_EMAIL || '';

const CONFIRM_PATTERNS: RegExp[] = [
  /(身份|信息|资料)?(已|予以|经)?确认/,
  /核实(无|没有)?误/,
  /(验证|身份|核实)通过/,
  /通过/,
  /同意(该|此|本)?(申请|请求)/,
  /是(我们|我方)?(的|名下)?客户/,
  /情况属实/,
];
const REJECT_PATTERNS: RegExp[] = [
  /不(能|予|可)?(确认|通过|同意)/,
  /无法(确认|核实|验证|通过)/,
  /身份(不符|不匹配|有误|错误)/,
  /查无(此|该)?(人|客户|记录)/,
  /非(我们|我方)?(的|名下)?客户/,
  /信息(有误|不符|不匹配)/,
  /资料(不完整|有误|不符)/,
];
const STRONG_REJECT_PATTERNS: RegExp[] = [
  /拒绝(通过|确认|同意|此(申请|请求))?/,
];
const NEGATIONS = ['不', '未', '无', '非', '没', '无法', '不能', '暂不'];
const NEGATION_SUFFIX = /(不了|不上|不成|不掉|不动|不起|不开|不下来)/;
const TEMPLATE_NOISE = [
  '请确认',
  '请核实以上信息是否与您记录的客户信息一致',
  '回复邮件确认客户身份',
  '核实通过后',
  '如有问题请联系系统管理员',
  '此邮件由客户服务申请系统自动发送',
];

export function classifyReply(fullText: string): { status: 'confirmed' | 'rejected' | 'unclear'; detail: string } {
  // 1. 剔除引用行（> 开头）与模板噪声
  let ownText = fullText
    .split('\n')
    .filter((l: string) => !l.trim().startsWith('>') && !l.trim().startsWith('&gt;'))
    .join(' ');
  for (const noise of TEMPLATE_NOISE) {
    ownText = ownText.split(noise).join('');
  }
  if (ownText.trim().length < 2) {
    return { status: 'unclear', detail: '无有效内容' };
  }

  // 2. 否定检测：对每个模式命中，检查其前 3 字符窗口内是否有否定词（或后缀"X不了"）
  const NEG_WINDOW = 3;
  function isNegatedAt(pos: number): boolean {
    const before = ownText.slice(Math.max(0, pos - NEG_WINDOW), pos);
    if (NEGATIONS.some((neg) => before.includes(neg))) return true;
    const after = ownText.slice(pos, pos + 6);
    if (NEGATION_SUFFIX.test(after)) return true;
    return false;
  }
  const isSuffixNegated = (pos: number): boolean => {
    const after = ownText.slice(pos, pos + 8);
    return NEGATION_SUFFIX.test(after);
  };

  // 2.1 强拒绝信号：命中"拒绝"且未被否定 → 直接 rejected
  for (const p of STRONG_REJECT_PATTERNS) {
    const re = new RegExp(p.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(ownText)) !== null) {
      if (!isNegatedAt(m.index)) {
        return { status: 'rejected', detail: '强拒绝信号' };
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // 3. 正则模式匹配 + 否定反转
  let confirmHits: number[] = [];
  let rejectHits: number[] = [];
  let invertedCount = 0; // 否定反转产生的命中数（用于"互相抵消"判断）

  // 疑问句检测：命中后 3 字符内出现"吗/？/?" → 不是表态（跳过）
  const isQuestionAfter = (pos: number): boolean => {
    const after = ownText.slice(pos, pos + 4);
    return /[吗？?]/.test(after);
  };

  for (const p of CONFIRM_PATTERNS) {
    const re = new RegExp(p.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(ownText)) !== null) {
      if (isQuestionAfter(m.index)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      if (isNegatedAt(m.index)) {
        rejectHits.push(m.index);
        invertedCount++;
      } else {
        confirmHits.push(m.index);
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // 独立否定反转：否定词邻近的裸核心词（"尚未核实/无法通过/不打算确认"等，不依赖 REJECT 模式）
  for (const core of ['确认', '通过', '同意', '核实', '验证']) {
    const re = new RegExp(core, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(ownText)) !== null) {
      if (isQuestionAfter(m.index)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      if (isNegatedAt(m.index) && !confirmHits.includes(m.index) && !rejectHits.includes(m.index)) {
        rejectHits.push(m.index);
        invertedCount++;
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  for (const p of REJECT_PATTERNS) {
    const re = new RegExp(p.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(ownText)) !== null) {
      if (isQuestionAfter(m.index)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      // REJECT 模式本身即否定句式（"不确认/无法确认"等）→ 记入反转命中
      rejectHits.push(m.index);
      invertedCount++;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // 否定区域内的"拒绝"词 → 反向 = 确认意图（如"不拒绝"）
  const strongRe = new RegExp(STRONG_REJECT_PATTERNS[0].source, 'g');
  let sm: RegExpExecArray | null;
  while ((sm = strongRe.exec(ownText)) !== null) {
    if (isQuestionAfter(sm.index)) {
      if (sm.index === strongRe.lastIndex) strongRe.lastIndex++;
      continue;
    }
    if (isNegatedAt(sm.index)) {
      confirmHits.push(sm.index);
      invertedCount++;
    }
    if (sm.index === strongRe.lastIndex) strongRe.lastIndex++;
  }

  // 4. 冲突仲裁
  if (process.env.DEBUG_CLASSIFY === '1') {
    console.log('[classify] ownText:', ownText);
    console.log('[classify] confirmHits:', JSON.stringify(confirmHits), 'rejectHits:', JSON.stringify(rejectHits), 'inverted:', invertedCount);
  }
  if (confirmHits.length > 0 && rejectHits.length === 0) {
    return { status: 'confirmed', detail: `确认模式×${confirmHits.length}` };
  }
  if (rejectHits.length > 0 && confirmHits.length === 0) {
    return { status: 'rejected', detail: `拒绝模式×${rejectHits.length}` };
  }
  if (confirmHits.length > 0 && rejectHits.length > 0) {
    // 全部命中均来自否定句式（"我不拒绝，但也不确认"）→ 互相抵消 → unclear
    const totalHits = confirmHits.length + rejectHits.length;
    if (invertedCount >= totalHits) {
      return { status: 'unclear', detail: '否定互相抵消' };
    }
    const lastConfirm = Math.max(...confirmHits);
    const lastReject = Math.max(...rejectHits);
    if (lastReject > lastConfirm) {
      return { status: 'rejected', detail: `冲突仲裁: 拒绝在后 (确认${confirmHits.length} 拒绝${rejectHits.length})` };
    }
    if (lastConfirm > lastReject) {
      return { status: 'confirmed', detail: `冲突仲裁: 确认在后 (确认${confirmHits.length} 拒绝${rejectHits.length})` };
    }
    return { status: 'unclear', detail: `冲突且位置重叠 (确认${confirmHits.length} 拒绝${rejectHits.length})` };
  }
  return { status: 'unclear', detail: '无模式命中' };
}

function extractSenderAddress(from: any): string | null {
  if (!from) return null;
  const list = Array.isArray(from)
    ? from
    : Array.isArray(from.value)
      ? from.value
      : [from];
  for (const f of list) {
    if (f && typeof f.address === 'string' && f.address) return f.address.toLowerCase().trim();
  }
  return null;
}

let monitoring = false;
let processedMessageIds = new Set<string>();
let lastSuccessAt: Date | null = null;

export function getMonitorStatus(): { name: string; lastSuccessAt: Date | null } {
  return { name: '400cz回件监控', lastSuccessAt };
}

function buildSupportAttachments(match: any): { attachments: any[]; hasAny: boolean; missingList: string[] } {
  const attachments: any[] = [];
  const missingList: string[] = [];

  const isPersonal = match.customer_type === 'personal';

  const fileConfigs = [
    ...(isPersonal
      ? [{ path: match.identity_card_path, name: match.identity_card_name, type: 'identity_card', label: '身份证', ext: 'png' }]
      : [{ path: match.business_license_path, name: match.business_license_name, type: 'business_license', label: '营业执照', ext: 'png' }]),
    { path: match.application_form_path, name: match.application_form_name, type: 'application_form', label: '申请书', ext: 'doc' },
    { path: match.disclaimer_path, name: match.disclaimer_name, type: 'disclaimer', label: '免责声明', ext: 'doc' },
  ];

  for (const cfg of fileConfigs) {
    if (!cfg.path) continue;
    if (!fs.existsSync(cfg.path)) {
      missingList.push(cfg.label);
      continue;
    }
    const originalName = cfg.name || cfg.label;
    const ext = path.extname(originalName).slice(1) || path.extname(cfg.path).slice(1) || cfg.ext;
    attachments.push({
      filename: `${cfg.type}_${match.submit_id}.${ext}`,
      path: cfg.path,
    });
  }

  return { attachments, hasAny: attachments.length > 0, missingList };
}

function wrapTestBanner(html: string): string {
  const banner = `<div style="background:#fef3c7;border:2px dashed #f59e0b;padding:12px 16px;border-radius:6px;margin-bottom:16px;text-align:center;font-size:14px;color:#92400e;">
    <strong>【测试邮件 / Test Email】</strong><br>本邮件为系统测试阶段自动发送，请勿按正式需求处理。如有疑问请联系管理员。
  </div>`;
  const bodyMatch = html.match(/<div[^>]*style="font-family:[^>]*">/);
  if (bodyMatch) {
    const idx = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
    return html.slice(0, idx) + banner + html.slice(idx);
  }
  return banner + html;
}

function buildSupportHtmlWithFallback(html: string, hasAttachment: boolean, missingList: string[] = []): string {
  const wrapped = wrapTestBanner(html);
  if (hasAttachment) return wrapped;
  const warn = missingList.length > 0
    ? `<p style="color: #ef4444; background:#fef2f2; padding:10px; border-radius:6px;">以下附件已失效，请联系客户重新提供：${missingList.join('、')}</p>`
    : `<p style="color: #ef4444; background:#fef2f2; padding:10px; border-radius:6px;">附件已失效，请联系客户重新提供。</p>`;
  return wrapped.replace(
    '</div>\n      <p style="color: #64748b;',
    '</div>\n      ' + warn + '\n      <p style="color: #64748b;'
  );
}

// 发送售后通知并记录日志（成功记 sent+真实MessageID；失败记 failed+错误信息，不中断流程）
async function sendSupportEmailAndLog(params: {
  applicationId: number;
  subject: string;
  html: string;
  attachments?: any[];
  logNote?: string;
}): Promise<void> {
  try {
    const result = await sendEmail({
      to: SUPPORT_TEAM_EMAIL,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    });
    await poolLogSupportEmail({
      applicationId: params.applicationId,
      subject: params.subject,
      status: 'sent',
      messageId: result.messageId,
      errorMessage: null,
    });
    console.log(`  售后邮件已发送: ${params.subject} Message-ID: ${result.messageId}${params.logNote ? ` (${params.logNote})` : ''}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  售后邮件发送失败: ${params.subject}`, errorMsg);
    await poolLogSupportEmail({
      applicationId: params.applicationId,
      subject: params.subject,
      status: 'failed',
      messageId: null,
      errorMessage: errorMsg,
    });
  }
}

async function poolLogSupportEmail(params: {
  applicationId: number;
  subject: string;
  status: 'sent' | 'failed';
  messageId: string | null;
  errorMessage: string | null;
}): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO email_logs (application_id, recipient_type, recipient_email, subject, status, message_id, error_message)
       VALUES (?, 'support_team', ?, ?, ?, ?, ?)`,
      [
        params.applicationId,
        SUPPORT_TEAM_EMAIL,
        params.subject,
        params.status,
        params.messageId,
        params.errorMessage,
      ]
    );
  } catch (err) {
    console.error('  记录售后邮件日志失败:', err);
  }
}

async function logUnmatchedReply(params: {
  messageId: string;
  subject: string;
  sender: string | null;
  reason: string;
  detail?: string;
}): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO unmatched_replies (message_id, subject, sender, reason, detail, replied_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [params.messageId, params.subject || '', params.sender, params.reason, params.detail || null]
    );
  } catch (err) {
    console.error('[monitor] 记录未匹配回件失败:', err);
  }
}

async function processReplyEmail(message: any): Promise<void> {
  const messageId = message.messageId || '';
  const inReplyTo = message.inReplyTo || '';
  const references = message.references || '';
  const subject = message.subject || '';
  const text = message.text || '';
  const textAsHtml = message.textAsHtml || '';
  const fullText = `${subject} ${text} ${textAsHtml}`;

  console.log(`处理邮件: ${subject}`);
  console.log(`  Message-ID: ${messageId}`);
  console.log(`  In-Reply-To: ${inReplyTo}`);
  console.log(`  References: ${references}`);
  console.log(`  From 字段: ${JSON.stringify(message.from)}`);
  console.log(`  From.value: ${JSON.stringify(message.from?.value)}`);

  if (processedMessageIds.has(messageId)) {
    console.log('  已处理过，跳过');
    return;
  }

  const allReferences = [inReplyTo, ...(Array.isArray(references) ? references : [references])].filter(Boolean);

  console.log(`  完整主题 (解码后): ${subject}`);
  console.log(`  References 数组: ${JSON.stringify(allReferences)}`);

  if (allReferences.length === 0) {
    console.log('  无 In-Reply-To / References，不是回复邮件，跳过');
    return;
  }

  const pool = await getPool();

  let match: any = null;

  for (const ref of allReferences) {
    const refClean = ref.trim().replace(/[<>]/g, '');

    const [rows] = await pool.query(
      `SELECT el.*, a.id as app_id, a.submit_id, a.service_type, a.service_name, a.company_name,
              a.form_data, a.verify_data, a.verify_status,
              a.business_license_path, a.business_license_name,
              a.identity_card_path, a.identity_card_name,
              a.customer_type,
              a.application_form_path, a.application_form_name,
              a.disclaimer_path, a.disclaimer_name
       FROM email_logs el
       JOIN applications a ON el.application_id = a.id
       WHERE el.recipient_type = 'service_provider'
         AND el.message_id LIKE ?
         AND a.verify_status = 'pending'`,
      [`%${refClean}%`]
    );

    const matches = rows as any[];
    if (matches.length > 0) {
      match = matches[0];
      console.log(`  通过 Message-ID 匹配到申请: ${match.submit_id}`);
      break;
    }
  }

  if (!match) {
    const submitIdMatch = subject.match(/RHF-\d{8}-\d{3}/);
    if (submitIdMatch) {
      const submitId = submitIdMatch[0];
      console.log(`  Message-ID 未匹配，尝试通过主题中的申请编号匹配: ${submitId}`);

      const [rows] = await pool.query(
        `SELECT el.*, a.id as app_id, a.submit_id, a.service_type, a.service_name, a.company_name,
                a.form_data, a.verify_data, a.verify_status,
                a.business_license_path, a.business_license_name,
                a.identity_card_path, a.identity_card_name,
                a.customer_type,
                a.application_form_path, a.application_form_name,
                a.disclaimer_path, a.disclaimer_name
         FROM email_logs el
         JOIN applications a ON el.application_id = a.id
         WHERE el.recipient_type = 'service_provider'
           AND el.subject LIKE ?
           AND a.verify_status = 'pending'
         ORDER BY el.sent_at DESC
         LIMIT 1`,
        [`%${submitId}%`]
      );

      const matches = rows as any[];
      if (matches.length > 0) {
        match = matches[0];
        console.log(`  通过申请编号匹配到申请: ${match.submit_id}`);
      }
    }
  }

  if (!match) {
    // 高风险3修复：服务商改主题/新建邮件回复时，从引用原文中找 RHF 编号
    const quotedText = text.split('\n').filter((l: string) => l.trim().startsWith('>')).join(' ');
    const quotedIdMatch = quotedText.match(/RHF-\d{8}-\d{4}/);
    if (quotedIdMatch) {
      const quotedId = quotedIdMatch[0];
      console.log(`  Message-ID/主题均未匹配，尝试引用原文编号: ${quotedId}`);

      const [rows] = await pool.query(
        `SELECT el.*, a.id as app_id, a.submit_id, a.service_type, a.service_name, a.company_name,
                a.form_data, a.verify_data, a.verify_status,
                a.business_license_path, a.business_license_name,
                a.identity_card_path, a.identity_card_name,
                a.customer_type,
                a.application_form_path, a.application_form_name,
                a.disclaimer_path, a.disclaimer_name
         FROM email_logs el
         JOIN applications a ON el.application_id = a.id
         WHERE el.recipient_type = 'service_provider'
           AND el.subject LIKE ?
           AND a.verify_status = 'pending'
         ORDER BY el.sent_at DESC
         LIMIT 1`,
        [`%${quotedId}%`]
      );

      const matches = rows as any[];
      if (matches.length > 0) {
        match = matches[0];
        console.log(`  通过引用原文编号匹配到申请: ${match.submit_id}`);
      }
    }
  }

  if (!match) {
    console.log('  未匹配到任何待验证的申请');
    await logUnmatchedReply({ messageId, subject, sender: extractSenderAddress(message.from), reason: 'no_match' });
    return;
  }

  // 高风险1修复：校验回件发件人 == 当初验证邮件的收件人
  const replySender = extractSenderAddress(message.from);
  const expectedRecipient = (match.recipient_email || '').toLowerCase().trim();
  if (replySender && expectedRecipient && replySender !== expectedRecipient) {
    console.log(`  [安全] 发件人不匹配，忽略: 回件来自 ${replySender}，期望 ${expectedRecipient}`);
    await logUnmatchedReply({ messageId, subject, sender: replySender, reason: 'sender_mismatch', detail: `expected ${expectedRecipient}` });
    return;
  }
  if (!replySender) {
    console.log('  [安全] 无法解析回件发件人，忽略');
    await logUnmatchedReply({ messageId, subject, sender: null, reason: 'no_sender' });
    return;
  }

  const judgment = classifyReply(fullText);
  const verifyStatus = judgment.status;
  console.log(`  回复判定: ${judgment.status}（${judgment.detail}）`);

  const formData = typeof match.form_data === 'string' ? JSON.parse(match.form_data) : match.form_data;
  const verifyData = typeof match.verify_data === 'string' ? JSON.parse(match.verify_data) : match.verify_data;
  const replyText = text.substring(0, 2000);

  await pool.query(
    `UPDATE applications SET verify_status = ?, verify_reply_text = ?, verified_at = NOW() WHERE id = ?`,
    [verifyStatus, replyText, match.app_id]
    );

    console.log(`  验证状态已更新: ${verifyStatus}`);

    if (verifyStatus === 'confirmed') {
      console.log('  发送已验证邮件给售后团队');
      const { attachments, hasAny, missingList } = buildSupportAttachments(match);
      const html = buildSupportHtmlWithFallback(
        generateSupportTeamEmailHtml(formData as ApplyFormData, verifyData as IdentityVerifyData, match.submit_id),
        hasAny,
        missingList
      );
      const subject = `【测试】【客户身份已验证】${match.company_name || '客户'} - ${match.submit_id}`;
      await sendSupportEmailAndLog({
        applicationId: match.app_id,
        subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
        logNote: 'after-confirm',
      });
    } else if (verifyStatus === 'rejected') {
      console.log('  发送未通过邮件给售后团队');
      const { attachments, hasAny, missingList } = buildSupportAttachments(match);
      const html = buildSupportHtmlWithFallback(
        generateRejectedEmailHtml(formData as ApplyFormData, verifyData as IdentityVerifyData, match.submit_id, replyText),
        hasAny,
        missingList
      );
      const subject = `【测试】【客户身份验证未通过】${match.company_name || '客户'} - ${match.submit_id}`;
      await sendSupportEmailAndLog({
        applicationId: match.app_id,
        subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
        logNote: 'after-reject',
      });
    } else {
      console.log('  服务商回复无法识别，发送待人工确认邮件给售后');
      const subject = `【测试】【服务商回复待人工确认】${match.company_name || '客户'} - ${match.submit_id}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#fef3c7;border:2px dashed #f59e0b;padding:12px 16px;border-radius:6px;margin-bottom:16px;text-align:center;font-size:14px;color:#92400e;">
            <strong>【测试邮件 / Test Email】</strong><br>本邮件为系统测试阶段自动发送，请勿按正式需求处理。如有疑问请联系管理员。
          </div>
          <h3 style="color:#92400e;">服务商回复无法自动识别，需要人工确认</h3>
          <p>以下申请的验证回复未能自动判断"确认/拒绝"，请人工核实：</p>
          <ul>
            <li><b>申请编号：</b>${match.submit_id}</li>
            <li><b>服务类型：</b>${match.service_name || match.service_type}</li>
            <li><b>客户名称：</b>${match.company_name || '-'}</li>
            <li><b>服务商回复：</b>${(replyText || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</li>
          </ul>
          <p style="color:#64748b;">请在管理后台将申请状态改为"已确认"或"已拒绝"。</p>
        </div>
      `;
      await sendSupportEmailAndLog({
        applicationId: match.app_id,
        subject,
        html,
        logNote: 'after-unclear',
      });
    }

    processedMessageIds.add(messageId);
}

const LAST_UID_KEY = 'email_monitor_last_uid';

async function getLastUid(): Promise<number | null> {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      [LAST_UID_KEY]
    );
    const list = rows as any[];
    if (list.length === 0) return null;
    const val = parseInt(list[0].setting_value);
    return isNaN(val) ? null : val;
  } catch (err) {
    console.error('读取邮件水位失败:', err);
    return null;
  }
}

async function setLastUid(uid: number): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [LAST_UID_KEY, String(uid)]
    );
  } catch (err) {
    console.error('保存邮件水位失败:', err);
  }
}

async function pollMailbox(): Promise<void> {
  const client = new ImapFlow(IMAP_CONFIG as any);

  try {
    await client.connect();
    console.log('IMAP 连接成功，开始检查邮件...');
    lastSuccessAt = new Date();

    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailboxInfo = await client.mailboxOpen('INBOX');
      console.log(`收件箱共 ${mailboxInfo.exists} 封邮件`);

      if (mailboxInfo.exists === 0) {
        console.log('收件箱为空，无邮件需要处理');
        return;
      }

      const lastUid = await getLastUid();
      let fetchQuery: any;
      if (lastUid) {
        fetchQuery = { uid: `${lastUid + 1}:*` };
      } else {
        const since = new Date();
        since.setDate(since.getDate() - 7);
        fetchQuery = { since };
      }

      const messages = [];
      let maxUid = lastUid || 0;
      for await (const msg of client.fetch(
        fetchQuery,
        { envelope: true, source: true },
        { uid: true }
      )) {
        messages.push(msg);
        if (msg.uid > maxUid) maxUid = msg.uid;
      }

      console.log(`${lastUid ? `UID ${lastUid} 之后` : '最近7天'}共获取到 ${messages.length} 封邮件`);

      for (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source as any);
          await processReplyEmail(parsed);
        } catch (error) {
          console.error('解析邮件失败:', error);
        }
      }

      if (maxUid > (lastUid || 0)) {
        await setLastUid(maxUid);
        console.log(`邮件水位已更新: ${maxUid}`);
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('IMAP 本轮轮询完成');
  } catch (error) {
    console.error('IMAP 连接失败:', error);
  }
}

export function startEmailMonitor(): void {
  if (monitoring) return;
  monitoring = true;

  console.log('邮件监听已启动，每30秒轮询一次...');

  pollMailbox();

  setInterval(async () => {
    await pollMailbox();
  }, POLL_INTERVAL);
}

export default { startEmailMonitor };