import express from 'express';
import nodemailer from 'nodemailer';
import { buildSubmitSubject, encodeSubmitBody, generateSubmitId, SubmitPayload } from '../src/server/emailProtocol';
import { ApplyFormData, IdentityVerifyData } from '../src/types/apply';

const app = express();
app.use(express.json({ limit: '60mb' }));

const ALLOWED_ORIGINS = (process.env.RELAY_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } else {
    return res.status(403).json({ success: false, message: '来源不被允许' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = parseInt(process.env.RELAY_MAX_PER_MIN || '5');
const ipHits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({ success: false, message: `请求过于频繁，每分钟最多 ${MAX_REQUESTS} 次` });
    return;
  }
  next();
}

const RELAY_SMTP_HOST = process.env.RELAY_SMTP_HOST || '';
const RELAY_SMTP_PORT = parseInt(process.env.RELAY_SMTP_PORT || '465');
const RELAY_SMTP_USER = process.env.RELAY_SMTP_USER || '';
const RELAY_SMTP_PASS = process.env.RELAY_SMTP_PASS || '';
const RELAY_TO = process.env.RELAY_TO || '';

const TRANSPORTER = nodemailer.createTransport({
  host: RELAY_SMTP_HOST,
  port: RELAY_SMTP_PORT,
  secure: true,
  auth: {
    user: RELAY_SMTP_USER,
    pass: RELAY_SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

app.post('/api/submit', rateLimit, async (req, res) => {
  try {
    const { formData, verifyData, files } = req.body as {
      formData: ApplyFormData;
      verifyData: IdentityVerifyData;
      files: Record<string, { name: string; data: string } | undefined>;
    };
    if (!formData?.serviceType || !formData?.customerDomain) {
      return res.status(400).json({ success: false, message: '缺少必填字段' });
    }
    const submitId = generateSubmitId();
    const attachmentNames: Record<string, string> = {};
    const attachments: any[] = [];
    for (const [type, file] of Object.entries(files || {})) {
      if (!file?.data) continue;
      attachmentNames[type] = file.name;
      attachments.push({ filename: file.name, content: Buffer.from(file.data, 'base64') });
    }
    const payload: SubmitPayload = {
      submitId,
      serviceType: formData.serviceType,
      formData,
      verifyData,
      attachmentNames,
      submittedAt: new Date().toISOString(),
    };
    await TRANSPORTER.sendMail({
      from: process.env.RELAY_SMTP_FROM || `"客户服务申请系统" <${RELAY_SMTP_USER}>`,
      to: RELAY_TO,
      subject: buildSubmitSubject(payload),
      text: encodeSubmitBody(payload),
      attachments,
    });
    console.log(`[relay] 已发送申请 ${submitId} → ${RELAY_TO}`);
    res.json({ success: true, submitId });
  } catch (err) {
    console.error('[relay] 发送失败:', err);
    res.status(500).json({ success: false, message: '邮件发送失败' });
  }
});

app.post('/api/validate-domain', (req, res) => {
  const raw: string = req.body?.domain || '';
  const clean = raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].trim();
  const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(clean);
  res.json({ valid, reason: valid ? 'format_ok' : 'invalid_format' });
});

const PORT = parseInt(process.env.RELAY_PORT || '3003');

if (!RELAY_SMTP_HOST || !RELAY_SMTP_USER || !RELAY_SMTP_PASS || !RELAY_TO) {
  console.error('❌ 缺少 relay 必要环境变量: RELAY_SMTP_HOST/RELAY_SMTP_USER/RELAY_SMTP_PASS/RELAY_TO');
  process.exit(1);
}

app.listen(PORT, '0.0.0.0', () => console.log(`relay 服务已启动: :${PORT}`));
