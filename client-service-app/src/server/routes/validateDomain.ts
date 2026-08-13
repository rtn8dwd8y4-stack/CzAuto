import { Router } from 'express';
import { getPool } from '../db';

const router = Router();

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

async function isWhitelisted(domain: string): Promise<boolean> {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'whitelist_domains'`
  );
  const list = (rows as any[])[0]?.setting_value;
  if (!list) return false;
  try {
    const arr = JSON.parse(list);
    return Array.isArray(arr) && arr.includes(domain);
  } catch {
    return false;
  }
}

router.post('/', async (req, res) => {
  const { domain: raw } = req.body;
  if (!raw || typeof raw !== 'string') {
    return res.json({ valid: false, reason: 'empty', message: '请输入域名' });
  }

  const domain = normalizeDomain(raw);

  try {
    const pool = await getPool();

    const [rows] = await pool.query(
      `SELECT id, domain, company_name, contact_person, contact_phone FROM customers WHERE LOWER(domain) = ? AND is_active = 1`,
      [domain]
    );

    if ((rows as any[]).length > 0) {
      const customer = (rows as any[])[0];
      return res.json({
        valid: true,
        reason: 'customer_match',
        customer,
      });
    }

    if (await isWhitelisted(domain)) {
      return res.json({
        valid: true,
        reason: 'whitelist_match',
      });
    }

    return res.json({
      valid: false,
      reason: 'not_in_customer_list',
      message: '该域名不在我们的客户名单中，请联系管理员',
    });
  } catch (error) {
    console.error('校验域名失败:', error);
    res.status(500).json({ valid: false, reason: 'server_error', message: '服务器错误' });
  }
});

export default router;