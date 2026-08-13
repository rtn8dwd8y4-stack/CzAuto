import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { getPool } from '../db';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { search, agentType, page = '1', pageSize = '20' } = req.query;

    let where = 'WHERE 1=1';
    const values: any[] = [];

    if (search) {
      where += ' AND (agent_name LIKE ? OR email LIKE ? OR contact_person LIKE ?)';
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (agentType && agentType !== '') {
      where += ' AND agent_type = ?';
      values.push(agentType);
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const pageSizeNum = Math.max(1, Math.min(100, parseInt(pageSize as string)));
    const offset = (pageNum - 1) * pageSizeNum;

    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM agents ${where}`, values);
    const total = (countRows as any[])[0].total;

    const [rows] = await pool.query(
      `SELECT id, agent_name, email, rss_account, rss_verify_phone, department, channel_manager, is_oem,
              contact_person, contact_phone, address, notes, agent_type, created_at
       FROM agents ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSizeNum, offset]
    );

    res.json({ success: true, total, page: pageNum, pageSize: pageSizeNum, list: rows });
  } catch (error) {
    console.error('查询代理商失败:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      agent_name,
      email,
      rss_account,
      rss_verify_phone,
      department,
      channel_manager,
      is_oem,
      contact_person,
      contact_phone,
      address,
      notes,
      agent_type,
    } = req.body;

    if (!agent_name) {
      return res.status(400).json({ success: false, error: '代理商名称不能为空' });
    }

    const pool = await getPool();

    const [exists] = await pool.query('SELECT id FROM agents WHERE agent_name = ?', [agent_name]);
    if ((exists as any[]).length > 0) {
      return res.status(400).json({ success: false, error: '该代理商已存在' });
    }

    await pool.query(
      `INSERT INTO agents (agent_name, email, rss_account, rss_verify_phone, department, channel_manager, is_oem,
        contact_person, contact_phone, address, notes, agent_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent_name,
        email || null,
        rss_account || null,
        rss_verify_phone || null,
        department || null,
        channel_manager || null,
        is_oem || null,
        contact_person || null,
        contact_phone || null,
        address || null,
        notes || null,
        agent_type || '渠道',
      ]
    );

    res.json({ success: true, message: '已添加' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: '该代理商已存在' });
    }
    console.error('添加代理商失败:', error);
    res.status(500).json({ success: false, error: '添加失败' });
  }
});

router.post('/import-xlsx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传文件' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const pool = await getPool();

    let inserted = 0;
    let skipped = 0;

    // Sheet 名映射：检查文件包含哪些 Sheet
    const sheetNames = workbook.SheetNames;

    // 1. 2025年代理商更新（渠道）
    const sheet2025 = workbook.Sheets['2025年代理商更新'];
    if (sheet2025) {
      const rows = XLSX.utils.sheet_to_json(sheet2025, { header: 1 }) as any[][];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[2]) continue; // RSS代理商名称在列3
        const agentName = String(row[2]).trim();
        if (!agentName || agentName === '无') continue;
        const email = row[1] ? String(row[1]).trim() : '';
        const rssAccount = row[3] ? String(row[3]).trim() : '';
        const rssPhone = row[4] ? String(row[4]).trim() : '';
        const department = row[5] ? String(row[5]).trim() : '';
        const channelManager = row[6] ? String(row[6]).trim() : '';
        const isOem = row[7] ? String(row[7]).trim() : '';
        const contactPerson = row[8] ? String(row[8]).trim() : '';
        const contactPhone = row[9] ? String(row[9]).trim() : '';
        const address = row[10] ? String(row[10]).trim() : '';
        const notes = row[12] ? String(row[12]).trim() : '';

        const [exists] = await pool.query('SELECT id FROM agents WHERE agent_name = ?', [agentName]);
        if ((exists as any[]).length > 0) {
          skipped++;
          continue;
        }

        await pool.query(
          `INSERT INTO agents (agent_name, email, rss_account, rss_verify_phone, department, channel_manager, is_oem, contact_person, contact_phone, address, notes, agent_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '渠道')`,
          [agentName, email || null, rssAccount || null, rssPhone || null, department || null, channelManager || null, isOem || null, contactPerson || null, contactPhone || null, address || null, notes || null]
        );
        inserted++;
      }
    }

    // 2. 直销代理商
    const sheetDirect = workbook.Sheets['直销代理商'];
    if (sheetDirect) {
      const rows = XLSX.utils.sheet_to_json(sheetDirect, { header: 1 }) as any[][];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const agentName = String(row[0]).trim();
        if (!agentName) continue;
        const contactPerson = row[1] ? String(row[1]).trim() : '';
        const email = row[2] ? String(row[2]).trim() : '';

        const [exists] = await pool.query('SELECT id FROM agents WHERE agent_name = ?', [agentName]);
        if ((exists as any[]).length > 0) {
          skipped++;
          continue;
        }

        await pool.query(
          `INSERT INTO agents (agent_name, email, contact_person, agent_type)
           VALUES (?, ?, ?, '直销')`,
          [agentName, email || null, contactPerson || null]
        );
        inserted++;
      }
    }

    res.json({ success: true, inserted, skipped });
  } catch (error) {
    console.error('导入代理商失败:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : '导入失败' });
  }
});

export default router;