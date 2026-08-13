import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

const TEMPLATES_DIR = path.join(process.cwd(), 'server', 'templates');

const TEMPLATE_MAP: Record<string, string[]> = {
  resetPassword: ['管理员密码取回申请(广东盈世2021.9版).doc'],
  changeDomain: ['更改域名申请(广东盈世2021.9版).doc'],
  bindMultiDomain: ['绑定多域名管理申请(广东盈世2021.9版).doc'],
  bindDomainAlias: ['绑定域别名管理申请(广东盈世2021.9版).doc'],
  unbindMultiDomain: ['解绑多域名管理申请(广东盈世2021.9版).doc'],
  unbindDomainAlias: ['解绑域别名管理申请(广东盈世2021.9版).doc'],
  changeCompanyName: ['更改组织名称申请(广东盈世2021.9版).doc'],
  deleteOrgConfig: ['删除组织配置申请(广东盈世2021.9版).doc'],
};

const DISCLAIMER_FILE = '免责声明申请(广东盈世2021.9版).doc';

function resolveSubjectFile(fileName: string, subject: string): string {
  if (subject === 'lk') {
    const ext = path.extname(fileName);
    const base = fileName.slice(0, -ext.length);
    const lkFile = `${base}-lk${ext}`;
    const lkPath = path.join(TEMPLATES_DIR, lkFile);
    if (fs.existsSync(lkPath)) {
      return lkFile;
    }
  }
  return fileName;
}

router.get('/disclaimer', (req, res) => {
  const subject = (req.query.subject as string) || 'ys';
  const fileName = resolveSubjectFile(DISCLAIMER_FILE, subject);
  const filePath = path.join(TEMPLATES_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '模板文件不存在' });
  }
  res.download(filePath, fileName);
});

router.get('/:type', (req, res) => {
  const { type } = req.params;
  const subject = (req.query.subject as string) || 'ys';
  const files = TEMPLATE_MAP[type];

  if (!files || files.length === 0) {
    return res.status(404).json({ error: '模板不存在' });
  }

  const requestedFile = req.query.file as string | undefined;
  const fileName = requestedFile && files.includes(requestedFile)
    ? requestedFile
    : files[0];

  const resolvedFile = resolveSubjectFile(fileName, subject);
  const filePath = path.join(TEMPLATES_DIR, resolvedFile);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '模板文件不存在' });
  }

  res.download(filePath, resolvedFile, (err) => {
    if (err) {
      console.error('下载模板失败:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '下载失败' });
      }
    }
  });
});

export default router;