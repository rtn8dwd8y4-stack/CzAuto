import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import { getPool } from './db';
import { parseSubmitBody, extractSubmitIdFromSubject, SubmitPayload } from './emailProtocol';
import { createApplicationFromEmail, EmailAttachmentInput } from './applicationService';
import { ServiceType } from '../types/apply';

async function streamToBuffer(input: any): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  const chunks: Buffer[] = [];
  for await (const chunk of input as Readable) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const INBOUND_IMAP_CONFIG = {
  host: process.env.INBOUND_IMAP_HOST || '',
  port: parseInt(process.env.INBOUND_IMAP_PORT || '993'),
  secure: true,
  auth: {
    user: process.env.INBOUND_IMAP_USER || '',
    pass: process.env.INBOUND_IMAP_PASS || '',
  },
  logger: false as const,
  tls: { rejectUnauthorized: false },
};

const POLL_INTERVAL = parseInt(process.env.INBOUND_POLL_INTERVAL || '30000');
let monitoring = false;
const processedMessageIds = new Set<string>();
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
let lastSuccessAt: Date | null = null;

const ALLOWED_SENDERS = (process.env.INBOUND_ALLOWED_SENDERS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const VALID_SERVICE_TYPES: ServiceType[] = [
  'resetPassword',
  'changeDomain',
  'bindMultiDomain',
  'bindDomainAlias',
  'unbindMultiDomain',
  'unbindDomainAlias',
  'changeCompanyName',
  'deleteOrgConfig',
  'unbind2FA',
];

const MAX_ATTACHMENTS = 5;

function extractSenderAddress(envelopeFrom: any): string | null {
  if (!envelopeFrom) return null;
  const list = Array.isArray(envelopeFrom) ? envelopeFrom : [envelopeFrom];
  for (const f of list) {
    if (f && typeof f.address === 'string' && f.address) return f.address.toLowerCase().trim();
  }
  return null;
}

function isAllowedSender(sender: string | null): boolean {
  if (ALLOWED_SENDERS.length === 0) return true;
  return !!sender && ALLOWED_SENDERS.includes(sender);
}

function validatePayload(payload: SubmitPayload): string | null {
  if (!/^RHF-\d{8}-\d{4}$/.test(payload.submitId)) return 'submitId 格式不合法';
  if (!VALID_SERVICE_TYPES.includes(payload.serviceType as ServiceType)) return '服务类型不合法';
  if (!payload.formData?.customerDomain) return '缺少主域名';
  return null;
}

export function getInboundStatus(): { name: string; lastSuccessAt: Date | null } {
  return { name: '入站监控', lastSuccessAt };
}

const MAX_ATTEMPT = 3;

async function isProcessed(messageId: string): Promise<boolean> {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT status, attempt_count FROM inbound_processed WHERE message_id = ?`,
      [messageId]
    );
    const list = rows as any[];
    if (list.length === 0) return false;
    const row = list[0];
    // 成功处理过，或失败次数已达上限 → 跳过；否则（processing 且可重试）→ 重新处理
    return row.status === 'processed' || (row.attempt_count || 0) >= MAX_ATTEMPT;
  } catch (err) {
    console.error('[inbound] 查询去重记录失败:', err);
    return false;
  }
}

async function markProcessing(messageId: string): Promise<boolean> {
  try {
    const pool = await getPool();
    const [result] = await pool.query(
      'INSERT IGNORE INTO inbound_processed (message_id, status) VALUES (?, "processing")',
      [messageId]
    );
    return (result as any).affectedRows > 0;
  } catch (err) {
    console.error('[inbound] 写入去重记录失败:', err);
    return false;
  }
}

async function markProcessingFailed(messageId: string, errorMsg: string): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(
      `UPDATE inbound_processed
       SET attempt_count = attempt_count + 1, last_error = ?
       WHERE message_id = ?`,
      [errorMsg.slice(0, 2000), messageId]
    );
  } catch (err) {
    console.error('[inbound] 记录处理失败状态出错:', err);
  }
}

async function markProcessed(messageId: string, submitId: string | null): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(
      'UPDATE inbound_processed SET status = "processed", submit_id = ? WHERE message_id = ?',
      [submitId, messageId]
    );
  } catch (err) {
    console.error('[inbound] 更新去重记录失败:', err);
  }
}

export interface ParsedAttachment {
  type: EmailAttachmentInput['type'];
  filename: string;
  buffer: Buffer;
}

const TYPE_BY_FILENAME_HINT: Array<{ type: EmailAttachmentInput['type']; hints: RegExp[] }> = [
  { type: 'applicationForm', hints: [/申请书/i, /application/i] },
  { type: 'disclaimer', hints: [/免责声明/i, /disclaimer/i] },
  { type: 'businessLicense', hints: [/营业执照/i, /license/i] },
  { type: 'identityCard', hints: [/身份证/i, /identity/i] },
];

function guessTypeByFilename(filename: string): EmailAttachmentInput['type'] | null {
  for (const item of TYPE_BY_FILENAME_HINT) {
    if (item.hints.some((r) => r.test(filename))) return item.type;
  }
  return null;
}

export async function processInboundEmail(raw: {
  subject: string;
  body: string;
  messageId: string;
  sender: string | null;
  attachments: ParsedAttachment[];
  payloadHint?: { attachmentNames?: Record<string, string | undefined> };
}): Promise<boolean> {
  const payload = parseSubmitBody(raw.body);
  if (!payload) {
    console.log(`[inbound] 无法解析的标准邮件，跳过: ${raw.messageId}（主题: ${raw.subject}）`);
    return true;
  }
  const subjectId = extractSubmitIdFromSubject(raw.subject);
  const finalSubmitId = subjectId || payload.submitId;

  const payloadError = validatePayload(payload);
  if (payloadError) {
    console.log(`[inbound] 格式校验不通过（${payloadError}），跳过: ${raw.messageId}`);
    return true;
  }
  if (!finalSubmitId) {
    console.log(`[inbound] 主题与正文均缺少 RHF 编号，跳过: ${raw.messageId}`);
    return true;
  }
  if (raw.attachments.length > MAX_ATTACHMENTS) {
    console.log(`[inbound] 附件数超限（${raw.attachments.length} > ${MAX_ATTACHMENTS}），跳过: ${raw.messageId}`);
    return true;
  }
  console.log(`[inbound] 收到申请 ${finalSubmitId}（${payload.serviceType}）`);

  const mapped: Record<string, ParsedAttachment | undefined> = {};
  const namesFromPayload = payload.attachmentNames || {};
  for (const att of raw.attachments) {
    let matchedType: EmailAttachmentInput['type'] | null = null;
    for (const [type, name] of Object.entries(namesFromPayload)) {
      if (name && name === att.filename && (type === 'applicationForm' || type === 'disclaimer' || type === 'businessLicense' || type === 'identityCard')) {
        matchedType = type;
        break;
      }
    }
    if (!matchedType) matchedType = guessTypeByFilename(att.filename);
    if (matchedType && !mapped[matchedType]) mapped[matchedType] = att;
  }

  const attachments: EmailAttachmentInput[] = (Object.entries(mapped) as [EmailAttachmentInput['type'], ParsedAttachment | undefined][])
    .filter(([, v]) => !!v)
    .map(([type, v]) => ({ type, filename: v!.filename, buffer: v!.buffer }));

  try {
    const result = await createApplicationFromEmail({
      submitId: finalSubmitId,
      formData: payload.formData,
      verifyData: payload.verifyData,
      attachments,
    });
    console.log(`[inbound] 申请 ${result.submitId} 处理完成，DB ID: ${result.id}`);
    await markProcessed(raw.messageId, result.submitId);
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[inbound] 处理申请 ${finalSubmitId} 失败:`, errorMsg);
    await markProcessingFailed(raw.messageId, errorMsg);
    await maybeAlertFailed(raw.messageId, raw.subject, errorMsg);
    return false;
  }
}

async function maybeAlertFailed(messageId: string, subject: string, errorMsg: string): Promise<void> {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      'SELECT attempt_count FROM inbound_processed WHERE message_id = ?',
      [messageId]
    );
    const count = (rows as any[])[0]?.attempt_count || 0;
    if (count >= MAX_ATTEMPT) {
      console.error(`[inbound] 邮件 ${messageId} 连续失败 ${count} 次，发送告警`);
      const { sendEmail } = await import('./emailService');
      await sendEmail({
        to: process.env.SUPPORT_EMAIL || '',
        subject: `【系统告警】入站邮件处理连续失败 - ${messageId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h3 style="color: #b91c1c;">入站邮件处理失败告警</h3>
            <p>以下邮件连续失败 ${count} 次，请人工处理（邮件仍在中转邮箱收件箱）：</p>
            <ul>
              <li><b>Message-ID：</b>${messageId}</li>
              <li><b>主题：</b>${subject || '-'}</li>
              <li><b>错误：</b>${errorMsg.slice(0, 500)}</li>
            </ul>
            <p style="color:#64748b;">可在管理后台或中转邮箱中查看原始邮件。</p>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('[inbound] 发送失败告警出错:', err);
  }
}

async function pollInbox(): Promise<void> {
  if (!INBOUND_IMAP_CONFIG.auth.user || !INBOUND_IMAP_CONFIG.auth.pass) {
    console.log('[inbound] 未配置 INBOUND_IMAP_USER/PASS，跳过拉取');
    return;
  }
  const client = new ImapFlow(INBOUND_IMAP_CONFIG);
  try {
    await client.connect();
    lastSuccessAt = new Date();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      let matchedCount = 0;
      let processedCount = 0;
      let blockedSenderCount = 0;
      for await (const msg of client.fetch({ since }, { envelope: true, uid: true, source: true })) {
        const subject = msg.envelope?.subject || '';
        if (!subject.includes('【客户服务申请】')) continue;
        matchedCount++;

        const sender = extractSenderAddress(msg.envelope?.from);
        if (!isAllowedSender(sender)) {
          blockedSenderCount++;
          continue;
        }

        const messageId = msg.envelope?.messageId || `uid-${msg.uid}`;
        if (processedMessageIds.has(messageId)) continue;
        if (await isProcessed(messageId)) {
          processedMessageIds.add(messageId);
          continue;
        }
        if (!(await markProcessing(messageId))) continue;
        processedMessageIds.add(messageId);
        console.log(`[inbound] 处理 ${messageId} 主题: ${subject} 发件人: ${sender}`);
        try {
          const sourceBuffer = await streamToBuffer(msg.source);
          const parsed = await simpleParser(sourceBuffer);
          const attachments: ParsedAttachment[] = (parsed.attachments || []).map((a) => ({
            type: 'businessLicense' as const,
            filename: a.filename || 'unnamed',
            buffer: a.content,
          }));
          const ok = await processInboundEmail({
            subject: parsed.subject || '',
            body: parsed.text || parsed.html || '',
            messageId,
            sender,
            attachments,
          });
          if (ok) {
            processedCount++;
          } else {
            // 处理失败：从内存 Set 移除，下轮重新尝试（DB 中 attempt_count 已累加）
            processedMessageIds.delete(messageId);
          }
        } catch (err) {
          console.error(`[inbound] 处理邮件 ${messageId} 出错:`, err);
          processedMessageIds.delete(messageId);
        }
      }
      console.log(
        `[inbound] 扫描完成: 匹配 ${matchedCount} 封, 新处理 ${processedCount} 封, 白名单拦截 ${blockedSenderCount} 封`
      );
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('[inbound] 拉取失败:', err);
  }
}

export function startInboundMonitor(): void {
  if (monitoring) return;
  monitoring = true;
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const senderInfo = ALLOWED_SENDERS.length > 0
    ? `白名单 ${ALLOWED_SENDERS.length} 个发件人: ${ALLOWED_SENDERS.join(', ')}`
    : '未配置发件人白名单（所有发件人放行）';
  console.log(`[inbound] 入站监控启动，账号 ${INBOUND_IMAP_CONFIG.auth.user || '(未配置)'}，轮询 ${POLL_INTERVAL}ms，${senderInfo}`);
  void pollInbox();
  setInterval(() => void pollInbox(), POLL_INTERVAL);
}