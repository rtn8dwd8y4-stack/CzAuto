import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'client_service',
};

export function validateRequiredConfig(): string[] {
  const missing: string[] = [];
  const required: Array<[string, string]> = [
    ['SMTP_USER', process.env.SMTP_USER || ''],
    ['SMTP_PASS', process.env.SMTP_PASS || ''],
    ['IMAP_USER', process.env.IMAP_USER || ''],
    ['IMAP_PASS', process.env.IMAP_PASS || ''],
    ['INBOUND_IMAP_USER', process.env.INBOUND_IMAP_USER || ''],
    ['INBOUND_IMAP_PASS', process.env.INBOUND_IMAP_PASS || ''],
    ['SUPPORT_EMAIL', process.env.SUPPORT_EMAIL || ''],
    ['FALLBACK_EMAIL', process.env.FALLBACK_EMAIL || ''],
  ];
  for (const [name, value] of required) {
    if (!value) missing.push(name);
  }
  return missing;
}

let pool: mysql.Pool | null = null;

export async function getPool(): Promise<mysql.Pool> {
  if (pool) return pool;

  pool = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 100,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  console.log('MySQL 连接池已创建');
  return pool;
}

export async function initDatabase(): Promise<void> {
  const tempPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  });

  try {
    await tempPool.query('CREATE DATABASE IF NOT EXISTS client_service CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('📦 数据库 client_service 已就绪');
  } finally {
    await tempPool.end();
  }

  const p = await getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      submit_id VARCHAR(50) UNIQUE NOT NULL COMMENT '申请编号',
      service_type VARCHAR(50) NOT NULL COMMENT '服务类型ID',
      service_name VARCHAR(100) NOT NULL COMMENT '服务类型名称',
      company_name VARCHAR(200) COMMENT '客户名称',
      form_data JSON NOT NULL COMMENT '申请字段',
      verify_data JSON NOT NULL COMMENT '验证信息',
      business_license_path VARCHAR(500) COMMENT '营业执照存储路径',
      business_license_name VARCHAR(200) COMMENT '原始文件名',
      application_form_path VARCHAR(500) COMMENT '申请书存储路径',
      application_form_name VARCHAR(200) COMMENT '申请书原始文件名',
      disclaimer_path VARCHAR(500) COMMENT '免责声明存储路径',
      disclaimer_name VARCHAR(200) COMMENT '免责声明原始文件名',
      status ENUM('pending', 'processing', 'completed', 'rejected') DEFAULT 'pending' COMMENT '处理状态',
      verify_status ENUM('pending', 'confirmed', 'rejected', 'unclear') DEFAULT 'pending' COMMENT '身份验证状态',
      verify_reply_text TEXT COMMENT '服务商回复内容',
      verified_at TIMESTAMP NULL COMMENT '验证时间',
      domain_match VARCHAR(20) NULL COMMENT '域名匹配状态: customer/whitelist/unmatched/missing_agent',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_submit_id (submit_id),
      INDEX idx_service_type (service_type),
      INDEX idx_status (status),
      INDEX idx_verify_status (verify_status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户服务申请记录'
  `);

  const columnsToAdd = [
    { name: 'verify_status', def: "ENUM('pending', 'confirmed', 'rejected', 'unclear') DEFAULT 'pending' COMMENT '身份验证状态'" },
    { name: 'verify_reply_text', def: "TEXT COMMENT '服务商回复内容'" },
    { name: 'verified_at', def: "TIMESTAMP NULL COMMENT '验证时间'" },
    { name: 'application_form_path', def: "VARCHAR(500) COMMENT '申请书存储路径'" },
    { name: 'application_form_name', def: "VARCHAR(200) COMMENT '申请书原始文件名'" },
    { name: 'disclaimer_path', def: "VARCHAR(500) COMMENT '免责声明存储路径'" },
    { name: 'disclaimer_name', def: "VARCHAR(200) COMMENT '免责声明原始文件名'" },
    { name: 'applicant_name', def: "VARCHAR(100) NULL COMMENT '联系人姓名'" },
    { name: 'applicant_email', def: "VARCHAR(200) NULL COMMENT '联系人邮箱'" },
    { name: 'identity_card_path', def: "VARCHAR(500) NULL COMMENT '身份证存储路径'" },
    { name: 'identity_card_name', def: "VARCHAR(200) NULL COMMENT '身份证原始文件名'" },
    { name: 'customer_type', def: "ENUM('enterprise', 'personal') NULL COMMENT '用户类型'" },
    { name: 'receive_email', def: "VARCHAR(200) NULL COMMENT '新密码接收邮箱'" },
    { name: 'rss_confirmed', def: "ENUM('yes', 'no') NULL COMMENT 'RSS报备确认'" },
    { name: 'sub_domains', def: "JSON NULL COMMENT '副域名列表'" },
    { name: 'alias_domains', def: "JSON NULL COMMENT '域别名列表'" },
    { name: 'old_name', def: "VARCHAR(200) NULL COMMENT '原组织名称'" },
    { name: 'new_name', def: "VARCHAR(200) NULL COMMENT '新组织名称'" },
    { name: 'expiry_date', def: "DATE NULL COMMENT '到期日期'" },
    { name: 'extend_date', def: "DATE NULL COMMENT '延期日期'" },
    { name: 'extend_reason', def: "TEXT NULL COMMENT '延期原因'" },
    { name: 'unbind_devices', def: "JSON NULL COMMENT '解绑设备列表'" },
    { name: 'unbind_reason', def: "VARCHAR(100) NULL COMMENT '解绑原因'" },
    { name: 'domain_match', def: "VARCHAR(20) NULL COMMENT '域名匹配状态: customer/whitelist/unmatched/missing_agent'" },
  ];

  for (const col of columnsToAdd) {
    try {
      await p.query(`ALTER TABLE applications ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // 列已存在，忽略
    }
  }

  const indexesToAdd = [
    { name: 'idx_verify_status', column: 'verify_status' },
    { name: 'idx_applicant_name', column: 'applicant_name' },
    { name: 'idx_applicant_email', column: 'applicant_email' },
    { name: 'idx_expiry_date', column: 'expiry_date' },
  ];

  for (const idx of indexesToAdd) {
    try {
      await p.query(`ALTER TABLE applications ADD INDEX ${idx.name} (${idx.column})`);
    } catch (e) {
      // 索引已存在，忽略
    }
  }

  try {
    await p.query(
      `ALTER TABLE applications MODIFY COLUMN verify_status ENUM('pending', 'confirmed', 'rejected', 'unclear') DEFAULT 'pending' COMMENT '身份验证状态'`
    );
  } catch (e) {
    console.error('升级 verify_status ENUM 失败:', e);
  }

  console.log('数据表 applications 已就绪');

  await p.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      application_id INT NOT NULL COMMENT '关联申请ID',
      recipient_type ENUM('service_provider', 'support_team') NOT NULL COMMENT '收件人类型',
      recipient_email VARCHAR(200) NOT NULL COMMENT '收件人邮箱',
      subject VARCHAR(300) NOT NULL COMMENT '邮件主题',
      status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent' COMMENT '发送状态',
      preview_url VARCHAR(500) COMMENT '邮件预览链接',
      message_id VARCHAR(500) COMMENT '邮件Message ID',
      error_message TEXT COMMENT '错误信息',
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      INDEX idx_application_id (application_id),
      INDEX idx_status (status),
      INDEX idx_sent_at (sent_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件发送日志'
  `);

  console.log('数据表 email_logs 已就绪');

  await p.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain VARCHAR(255) UNIQUE NOT NULL COMMENT '客户主域名',
      company_name VARCHAR(200) NOT NULL COMMENT '客户公司名称',
      contact_person VARCHAR(100) COMMENT '客户联系人',
      contact_phone VARCHAR(50) COMMENT '联系电话',
      provider_name VARCHAR(200) COMMENT '代理商/服务商名称',
      notes TEXT COMMENT '备注',
      is_active TINYINT(1) DEFAULT 1 COMMENT '1=启用 0=停用',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_domain (domain),
      INDEX idx_company_name (company_name),
      INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户名单'
  `);

  try {
    await p.query(`ALTER TABLE customers ADD COLUMN provider_name VARCHAR(200) NULL COMMENT '代理商/服务商名称'`);
  } catch (e) {}

  await p.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置'
  `);

  try {
    await p.query(`INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('whitelist_domains', '[]')`);
  } catch (e) {}

  console.log('数据表 customers 已就绪');
  console.log('数据表 system_settings 已就绪');

  await p.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agent_name VARCHAR(200) UNIQUE NOT NULL COMMENT '代理商名称',
      email VARCHAR(200) COMMENT '接口邮箱/直销邮箱',
      rss_account VARCHAR(100) COMMENT 'RSS系统账号',
      rss_verify_phone VARCHAR(50) COMMENT 'RSS二次验证号码',
      department VARCHAR(100) COMMENT '部门',
      channel_manager VARCHAR(100) COMMENT '渠道经理',
      is_oem VARCHAR(10) COMMENT '是否OEM',
      contact_person VARCHAR(100) COMMENT '联系人',
      contact_phone VARCHAR(50) COMMENT '联系人手机号码',
      address TEXT COMMENT '通信地址',
      notes TEXT COMMENT '备注',
      agent_type VARCHAR(20) DEFAULT '渠道' COMMENT '渠道/直销',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_agent_name (agent_name),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='代理商档案'
  `);

  console.log('数据表 agents 已就绪');

  await p.query(`
    CREATE TABLE IF NOT EXISTS inbound_processed (
      message_id VARCHAR(500) PRIMARY KEY,
      submit_id VARCHAR(50) NULL,
      status VARCHAR(20) DEFAULT 'processed',
      attempt_count INT DEFAULT 0 COMMENT '处理尝试次数',
      last_error TEXT NULL COMMENT '最近一次处理错误',
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入站邮件去重记录'
  `);

  try {
    await p.query(`ALTER TABLE inbound_processed ADD COLUMN attempt_count INT DEFAULT 0 COMMENT '处理尝试次数'`);
  } catch (e) {}
  try {
    await p.query(`ALTER TABLE inbound_processed ADD COLUMN last_error TEXT NULL COMMENT '最近一次处理错误'`);
  } catch (e) {}
  try {
    await p.query(`ALTER TABLE inbound_processed ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
  } catch (e) {}

  try {
    await p.query(`ALTER TABLE email_logs ADD COLUMN retry_count INT DEFAULT 0 COMMENT '发送重试次数'`);
  } catch (e) {}
  try {
    await p.query(`ALTER TABLE email_logs ADD COLUMN last_error TEXT NULL COMMENT '最近一次发送错误'`);
  } catch (e) {}

  await p.query(`
    CREATE TABLE IF NOT EXISTS unmatched_replies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id VARCHAR(500) COMMENT '回件Message-ID',
      subject VARCHAR(500) COMMENT '回件主题',
      sender VARCHAR(200) COMMENT '回件发件人',
      reason VARCHAR(50) COMMENT '未匹配原因',
      detail TEXT NULL COMMENT '补充说明',
      replied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '回件时间',
      INDEX idx_replied_at (replied_at),
      INDEX idx_reason (reason)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='未匹配回件记录'
  `);

  console.log('数据表 inbound_processed 已就绪');
  console.log('数据表 unmatched_replies 已就绪');
}

export default { getPool, initDatabase };