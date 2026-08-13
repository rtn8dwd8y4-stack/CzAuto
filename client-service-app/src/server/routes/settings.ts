import { Router } from 'express';
import { getPool } from '../db';

const router = Router();

function normalizeDomains(input: string[]): string[] {
  return input
    .map(d => d.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0])
    .filter(d => d.length > 0);
}

router.get('/whitelist', async (_req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'whitelist_domains'`
    );
    const raw = (rows as any[])[0]?.setting_value || '[]';
    let domains: string[] = [];
    try {
      domains = JSON.parse(raw);
      if (!Array.isArray(domains)) domains = [];
    } catch {
      domains = [];
    }
    res.json({ success: true, domains });
  } catch (error) {
    console.error('查询白名单失败:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.post('/whitelist', async (req, res) => {
  try {
    const { domains } = req.body;
    if (!Array.isArray(domains)) {
      return res.status(400).json({ success: false, error: 'domains 必须是数组' });
    }

    const cleaned = normalizeDomains(domains);
    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, error: '白名单不能为空' });
    }

    const pool = await getPool();
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('whitelist_domains', ?)
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [JSON.stringify(cleaned), JSON.stringify(cleaned)]
    );

    res.json({ success: true, message: '已保存', domains: cleaned });
  } catch (error) {
    console.error('保存白名单失败:', error);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

export default router;