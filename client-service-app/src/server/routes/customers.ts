import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { getPool } from '../db';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { search, isActive, page = '1', pageSize = '20' } = req.query;

    let where = 'WHERE 1=1';
    const values: any[] = [];

    if (search) {
      where += ' AND (domain LIKE ? OR company_name LIKE ?)';
      values.push(`%${search}%`, `%${search}%`);
    }
    if (isActive !== undefined && isActive !== '') {
      where += ' AND is_active = ?';
      values.push(parseInt(isActive as string));
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const pageSizeNum = Math.max(1, Math.min(100, parseInt(pageSize as string)));
    const offset = (pageNum - 1) * pageSizeNum;

    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM customers ${where}`, values);
    const total = (countRows as any[])[0].total;

    const [rows] = await pool.query(
      `SELECT id, domain, company_name, contact_person, contact_phone, provider_name, notes, is_active, created_at, updated_at
       FROM customers ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSizeNum, offset]
    );

    res.json({ success: true, total, page: pageNum, pageSize: pageSizeNum, list: rows });
  } catch (error) {
    console.error('查询客户列表失败:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { domain, company_name, contact_person, contact_phone, provider_name, notes, is_active } = req.body;

    if (!domain || !company_name) {
      return res.status(400).json({ success: false, error: '域名和公司名称不能为空' });
    }

    const domainClean = domain.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];

    const pool = await getPool();
    await pool.query(
      `INSERT INTO customers (domain, company_name, contact_person, contact_phone, provider_name, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [domainClean, company_name, contact_person || null, contact_phone || null, provider_name || null, notes || null, is_active ?? 1]
    );

    res.json({ success: true, message: '已添加' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: '该域名已存在' });
    }
    console.error('添加客户失败:', error);
    res.status(500).json({ success: false, error: '添加失败' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }

    const { domain, company_name, contact_person, contact_phone, provider_name, notes, is_active } = req.body;
    const pool = await getPool();

    let domainClean = domain;
    if (domain) {
      domainClean = domain.trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
    }

    await pool.query(
      `UPDATE customers SET
        domain = COALESCE(?, domain),
        company_name = COALESCE(?, company_name),
        contact_person = ?,
        contact_phone = ?,
        provider_name = ?,
        notes = ?,
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [domainClean, company_name, contact_person, contact_phone, provider_name, notes, is_active, id]
    );

    res.json({ success: true, message: '已更新' });
  } catch (error) {
    console.error('更新客户失败:', error);
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: '无效的ID' });
    }

    const pool = await getPool();
    await pool.query('UPDATE customers SET is_active = 0 WHERE id = ?', [id]);

    res.json({ success: true, message: '已停用' });
  } catch (error) {
    console.error('停用客户失败:', error);
    res.status(500).json({ success: false, error: '停用失败' });
  }
});

router.post('/import-xlsx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传文件' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rows.length < 2) {
      return res.status(400).json({ success: false, error: '文件内容为空' });
    }

    // 表头：客户ID(0) 客户名称(1) 客户状态(2) 域名(3) 到期时间(4) 状态(5) 代理商名称(6)
    const parsed: { domain: string; companyName: string; customerId: string; providerName: string }[] = [];
    const seenDomains = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[3]) continue;

      const domain = String(row[3]).trim().toLowerCase();
      if (!domain) continue;

      const customerStatus = row[2] ? String(row[2]).trim() : '';
      if (customerStatus && customerStatus !== '正式客户') continue;

      const companyName = row[1] ? String(row[1]).trim() : domain;
      const customerId = row[0] !== undefined && row[0] !== null ? String(row[0]) : '';
      const providerName = row[6] ? String(row[6]).trim() : '';

      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);

      parsed.push({ domain, companyName, customerId, providerName });
    }

    if (parsed.length === 0) {
      return res.status(400).json({ success: false, error: '没有有效数据' });
    }

    const pool = await getPool();

    // 获取已有域名
    const [existingRows] = await pool.query('SELECT domain FROM customers');
    const existingDomains = new Set((existingRows as any[]).map(r => r.domain));

    let inserted = 0;
    let skipped = 0;

    // 批量插入（每批 500 条）
    const BATCH = 500;
    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH);
      const values: any[] = [];
      const placeholders: string[] = [];

      for (const item of batch) {
        if (existingDomains.has(item.domain)) {
          skipped++;
          continue;
        }
        existingDomains.add(item.domain);
        placeholders.push('(?, ?, ?, ?, ?)');
        values.push(item.domain, item.companyName, item.providerName, `客户ID:${item.customerId}`, 1);
        inserted++;
      }

      if (placeholders.length > 0) {
        await pool.query(
          `INSERT INTO customers (domain, company_name, provider_name, notes, is_active) VALUES ${placeholders.join(',')}`,
          values
        );
      }
    }

    res.json({
      success: true,
      total: parsed.length,
      inserted,
      skipped,
    });
  } catch (error) {
    console.error('导入失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '导入失败' });
  }
});

export default router;