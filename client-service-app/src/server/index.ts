import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase, validateRequiredConfig } from './db';
import applicationRoutes from './routes/applications';
import templateRoutes from './routes/templates';
import validateDomainRoutes from './routes/validateDomain';
import customerRoutes from './routes/customers';
import settingsRoutes from './routes/settings';
import agentRoutes from './routes/agents';
import healthRoutes from './routes/health';
import { startEmailMonitor } from './emailMonitor';
import { startInboundMonitor } from './inboundMonitor';
import { startEmailCompensator } from './emailCompensator';
import { startPendingTimeoutChecker } from './pendingTimeoutChecker';
import { startAttachmentCleaner } from './attachmentCleaner';

const app = express();
const PORT = parseInt(process.env.PORT || '3002');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ success: false, error: '来源不被允许' });
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '50mb' }));

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use('/api/applications', applicationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/validate-domain', validateDomainRoutes);
app.use('/api/admin/customers', customerRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/admin/agents', agentRoutes);
app.use('/api/admin/health', healthRoutes);

app.get('/api/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.sendFile(filePath);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const ADMIN_DIST = process.env.ADMIN_DIST || path.join(process.cwd(), 'dist-admin');
if (fs.existsSync(ADMIN_DIST)) {
  const adminEntry = fs.existsSync(path.join(ADMIN_DIST, 'index.html')) ? 'index.html' : 'admin.html';
  app.use(express.static(ADMIN_DIST));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.sendFile(path.join(ADMIN_DIST, adminEntry));
  });
  console.log(`[admin] 管理后台已托管: ${ADMIN_DIST}（入口 ${adminEntry}）`);
}

async function start() {
  const missing = validateRequiredConfig();
  if (missing.length > 0) {
    console.error('❌ 缺少必要环境变量配置:', missing.join(', '));
    console.error('请配置后再启动（参考 deploy/.env.example）');
    process.exit(1);
  }
  try {
    await initDatabase();
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  }

  const SSL_CERT = process.env.SSL_CERT || '';
  const SSL_KEY = process.env.SSL_KEY || '';
  const SSL_PFX = process.env.SSL_PFX || '';
  const SSL_PASS = process.env.SSL_PASS || '';

  const httpsEnabled = (SSL_CERT && SSL_KEY) || SSL_PFX;
  if (httpsEnabled) {
    const https = await import('https');
    const httpsOptions: any = {};
    if (SSL_PFX) {
      httpsOptions.pfx = fs.readFileSync(SSL_PFX);
      if (SSL_PASS) httpsOptions.passphrase = SSL_PASS;
    } else {
      httpsOptions.cert = fs.readFileSync(SSL_CERT);
      httpsOptions.key = fs.readFileSync(SSL_KEY);
    }
    https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
      console.log(`服务已启动 (HTTPS): https://localhost:${PORT}`);
      startEmailMonitor();
      startInboundMonitor();
      startEmailCompensator();
      startPendingTimeoutChecker();
      startAttachmentCleaner();
    });
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`服务已启动: http://localhost:${PORT}`);
      startEmailMonitor();
      startInboundMonitor();
      startEmailCompensator();
      startPendingTimeoutChecker();
      startAttachmentCleaner();
    });
  }
}

process.on('uncaughtException', (error) => {
  console.error('未捕获异常（进程不会退出）:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

start();

export default app;