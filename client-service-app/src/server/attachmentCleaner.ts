import fs from 'fs';
import path from 'path';
import { getPool } from './db';

const CLEAN_INTERVAL = parseInt(process.env.CLEAN_INTERVAL || '86400000'); // 默认 24h
const CLEAN_EXPIRED_DAYS = parseInt(process.env.CLEAN_EXPIRED_DAYS || '1');
const CLEAN_MAX_PER_RUN = parseInt(process.env.CLEAN_MAX_PER_RUN || '500');
const CLEAN_EXPIRED_ENABLED = (process.env.CLEAN_EXPIRED_ENABLED || 'true') === 'true';
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const SUPPORT_TEAM_EMAIL = process.env.SUPPORT_EMAIL || '';

let running = false;

async function getReferencedFilenames(): Promise<Set<string>> {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT business_license_path, identity_card_path, application_form_path, disclaimer_path
     FROM applications`
  );
  const names = new Set<string>();
  for (const row of rows as any[]) {
    for (const p of [row.business_license_path, row.identity_card_path, row.application_form_path, row.disclaimer_path]) {
      if (p && typeof p === 'string') names.add(path.basename(p));
    }
  }
  return names;
}

async function getExpiredReferenceDates(): Promise<Map<string, number>> {
  const pool = await getPool();
  // 已完成/已驳回的申请，返回其附件文件名 -> 创建时间戳（毫秒）
  const [rows] = await pool.query(
    `SELECT business_license_path, identity_card_path, application_form_path, disclaimer_path, created_at
     FROM applications
     WHERE status IN ('completed', 'rejected')`
  );
  const map = new Map<string, number>();
  for (const row of rows as any[]) {
    const ts = new Date(row.created_at).getTime();
    for (const p of [row.business_license_path, row.identity_card_path, row.application_form_path, row.disclaimer_path]) {
      if (p && typeof p === 'string') map.set(path.basename(p), ts);
    }
  }
  return map;
}

async function cleanOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      console.log('[cleaner] uploads 目录不存在，跳过');
      return;
    }
    const referenced = await getReferencedFilenames();
    const expiredMap = CLEAN_EXPIRED_ENABLED ? await getExpiredReferenceDates() : new Map<string, number>();
    const now = Date.now();
    const expireCutoff = now - CLEAN_EXPIRED_DAYS * 24 * 60 * 60 * 1000;

    const files = fs.readdirSync(UPLOADS_DIR);
    let removed = 0;
    const removedList: string[] = [];

    for (const fname of files) {
      if (removed >= CLEAN_MAX_PER_RUN) break;
      const fullPath = path.join(UPLOADS_DIR, fname);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      let reason: string | null = null;

      // 1) 空文件
      if (stat.size === 0) {
        reason = 'empty_file';
      }
      // 2) 孤儿文件（无任何 DB 引用）
      else if (!referenced.has(fname)) {
        reason = 'orphan';
      }
      // 3) 已完成申请的超期附件
      else if (CLEAN_EXPIRED_ENABLED) {
        const createdTs = expiredMap.get(fname);
        if (createdTs !== undefined && createdTs < expireCutoff) {
          reason = `expired(>${CLEAN_EXPIRED_DAYS}d)`;
        }
      }

      if (reason) {
        try {
          fs.unlinkSync(fullPath);
          removed++;
          removedList.push(`${fname} (${reason})`);
        } catch (err) {
          console.error(`[cleaner] 删除失败 ${fname}:`, err);
        }
      }
    }

    if (removedList.length > 0) {
      console.log(`[cleaner] 本轮清理 ${removedList.length} 个附件:`);
      removedList.slice(0, 20).forEach((f) => console.log(`  - ${f}`));
      if (removedList.length > 20) console.log(`  ... 其余 ${removedList.length - 20} 个略`);
    } else {
      console.log('[cleaner] 本轮无附件需要清理');
    }
  } catch (err) {
    console.error('[cleaner] 清理任务出错:', err);
  } finally {
    running = false;
  }
}

export function startAttachmentCleaner(): void {
  console.log(
    `[cleaner] 附件清理任务启动，每 ${Math.round(CLEAN_INTERVAL / 3600000)}h 一次，` +
    `过期清理${CLEAN_EXPIRED_ENABLED ? `开启(${CLEAN_EXPIRED_DAYS}天)` : '关闭'}，单次上限 ${CLEAN_MAX_PER_RUN}`
  );
  void cleanOnce();
  setInterval(() => void cleanOnce(), CLEAN_INTERVAL);
}

export async function runAttachmentCleanerNow(): Promise<void> {
  await cleanOnce();
}
