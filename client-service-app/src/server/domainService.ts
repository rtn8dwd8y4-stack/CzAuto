import { getPool } from './db';

const FALLBACK_PROVIDER_EMAIL = process.env.FALLBACK_EMAIL || '';

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

export function extractDomain(formData: any): string | null {
  if (formData.customerDomain) {
    return normalizeDomain(formData.customerDomain);
  }
  return null;
}

export async function resolveProviderEmail(domain: string): Promise<{
  email: string;
  agentName: string | null;
  matched: boolean;
}> {
  const pool = await getPool();

  const [customerRows] = await pool.query(
    `SELECT provider_name FROM customers WHERE LOWER(domain) = ? AND is_active = 1`,
    [normalizeDomain(domain)]
  );

  const providerName = (customerRows as any[])[0]?.provider_name;
  if (!providerName) {
    return { email: FALLBACK_PROVIDER_EMAIL, agentName: null, matched: false };
  }

  const [agentRows] = await pool.query(
    `SELECT email FROM agents WHERE agent_name = ?`,
    [providerName]
  );

  const agentEmail = (agentRows as any[])[0]?.email;
  if (agentEmail) {
    return { email: agentEmail, agentName: providerName, matched: true };
  }

  return { email: FALLBACK_PROVIDER_EMAIL, agentName: providerName, matched: false };
}

export async function validateDomain(rawDomain: string): Promise<{
  valid: boolean;
  reason: string;
  message?: string;
  customer?: any;
}> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    return { valid: false, reason: 'empty', message: '请输入域名' };
  }

  const pool = await getPool();

  const [rows] = await pool.query(
    `SELECT id, domain, company_name, contact_person, contact_phone FROM customers WHERE LOWER(domain) = ? AND is_active = 1`,
    [domain]
  );

  if ((rows as any[]).length > 0) {
    return {
      valid: true,
      reason: 'customer_match',
      customer: (rows as any[])[0],
    };
  }

  const [settings] = await pool.query(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'whitelist_domains'`
  );
  const raw = (settings as any[])[0]?.setting_value;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.includes(domain)) {
        return { valid: true, reason: 'whitelist_match' };
      }
    } catch {}
  }

  return {
    valid: false,
    reason: 'not_in_customer_list',
    message: '该域名不在我们的客户名单中，请联系管理员',
  };
}