import nodemailer from 'nodemailer';
import dns from 'dns';
import { ApplyFormData, IdentityVerifyData } from '../types/apply';

dns.setDefaultResultOrder('ipv4first');

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  tls: {
    rejectUnauthorized: false,
  },
};

const FROM_ADDRESS = process.env.SMTP_FROM || '';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: any[];
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(SMTP_CONFIG as any);
    console.log('SMTP 连接已创建: mt.icoremail.net:465 (IPv4 优先)');
  }
  return transporter;
}

export async function sendEmail(options: EmailOptions, retryTimes: number = 3): Promise<{ messageId: string; response: string; success: boolean }> {
  const t = getTransporter();
  const delays = [5000, 30000, 300000];

  for (let attempt = 0; attempt < retryTimes; attempt++) {
    try {
      const info = await t.sendMail({
        from: FROM_ADDRESS,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });

      console.log('邮件已发送, Message ID:', info.messageId);
      console.log('SMTP 响应:', info.response);

      return {
        messageId: info.messageId,
        response: info.response,
        success: true,
      };
    } catch (error) {
      const isLast = attempt === retryTimes - 1;
      console.error(`邮件发送失败(第 ${attempt + 1}/${retryTimes} 次尝试):`, error instanceof Error ? error.message : error);
      if (isLast) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[Math.min(attempt, delays.length - 1)]));
    }
  }
  throw new Error('unreachable');
}

const serviceTypeNames: Record<string, string> = {
  resetPassword: '重置管理员密码',
  selfRetrievePassword: '自助找回密码',
  changeDomain: '更改绑定域名',
  bindMultiDomain: '绑定多域名',
  bindDomainAlias: '绑定域别名',
  unbindDomain: '解绑多域名/域别名',
  changeOrgName: '更改组织名称',
  deleteOrgConfig: '删除组织配置信息',
  extendPeriod: '延期',
  unbind2FA: '解绑二次验证',
  expandCapacity: '扩容量',
  expandQuota: '扩容封数',
};

type FieldDef = { key: keyof ApplyFormData; label: string };

const SERVICE_FIELDS: Record<string, FieldDef[]> = {
  resetPassword: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'adminAccount', label: '需重置邮箱账号' },
    { key: 'receive_email', label: '新密码接收邮箱' },
    { key: 'applyReason', label: '申请原因' },
  ],
  changeDomain: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'oldDomain', label: '旧域名' },
    { key: 'newDomain', label: '新域名' },
    { key: 'applyReason', label: '申请原因' },
  ],
  bindMultiDomain: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'adminAccount', label: '管理员账号' },
    { key: 'sub_domains', label: '副域名' },
    { key: 'applyReason', label: '申请原因' },
  ],
  bindDomainAlias: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'adminAccount', label: '管理员账号' },
    { key: 'alias_domains', label: '域别名' },
    { key: 'applyReason', label: '申请原因' },
  ],
  unbindMultiDomain: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'adminAccount', label: '管理员账号' },
    { key: 'unbindMultiDomain', label: '解绑多域名' },
    { key: 'applyReason', label: '申请原因' },
  ],
  unbindDomainAlias: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'adminAccount', label: '管理员账号' },
    { key: 'unbindDomainAlias', label: '解绑域别名' },
    { key: 'applyReason', label: '申请原因' },
  ],
  changeCompanyName: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'old_name', label: '原公司名称' },
    { key: 'new_name', label: '新公司名称' },
    { key: 'applyReason', label: '申请原因' },
  ],
  deleteOrgConfig: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'applyReason', label: '申请原因' },
  ],
  unbind2FA: [
    { key: 'customerDomain', label: '主域名' },
    { key: 'companyName', label: '客户名称' },
    { key: 'unbindEmail', label: '需解绑邮箱' },
    { key: 'applyReason', label: '申请原因' },
  ],
};

function renderServiceFields(data: ApplyFormData): string {
  const fields = SERVICE_FIELDS[data.serviceType] || [];
  let html = '';
  for (const f of fields) {
    const value = data[f.key];
    if (value === undefined || value === null || value === '') continue;
    const display = Array.isArray(value) ? value.join('、') : String(value);
    html += `<p><strong>${f.label}：</strong>${display}</p>`;
  }
  return html;
}

export function generateServiceProviderEmailHtml(
  data: ApplyFormData,
  verifyData: IdentityVerifyData,
  submitId: string
): string {
  const serviceTypeName = serviceTypeNames[data.serviceType] || data.serviceType;

  const fieldsHtml = renderServiceFields(data);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background:#fef3c7;border:2px dashed #f59e0b;padding:12px 16px;border-radius:6px;margin-bottom:16px;text-align:center;font-size:14px;color:#92400e;">
        <strong>【测试邮件 / Test Email】</strong><br>本邮件为系统测试阶段自动发送，请勿按正式需求处理。如有疑问请联系管理员。
      </div>
      <h2 style="color: #1e3a5f;">客户身份验证请求</h2>
      <p>您好，服务商：</p>
      <p>收到一项客户身份验证请求，请核实以下信息：</p>

      ${data.applicant_name || data.applicant_email ? `
      <div style="background: #eef2ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
        <h3 style="margin-top: 0;">申请人信息</h3>
        <p><strong>联系人姓名：</strong>${data.applicant_name || '-'}</p>
        <p><strong>联系人邮箱：</strong>${data.applicant_email || '-'}</p>
      </div>` : ''}

      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">申请信息</h3>
        <p><strong>申请编号：</strong>${submitId}</p>
        <p><strong>服务类型：</strong>${serviceTypeName}</p>
        ${fieldsHtml}
        ${data.rss_confirmed ? `<p><strong>RSS 报备确认：</strong>${data.rss_confirmed}</p>` : ''}
        ${data.expiry_date ? `<p><strong>到期日期：</strong>${data.expiry_date}</p>` : ''}
        ${data.customer_type ? `<p><strong>用户类型：</strong>${data.customer_type === 'enterprise' ? '企业用户' : '个人用户'}</p>` : ''}
        ${data.unbind_devices && data.unbind_devices.length > 0 ? `<p><strong>解绑设备：</strong>${data.unbind_devices.join('、')}</p>` : ''}
        ${data.unbind_reason ? `<p><strong>解绑原因：</strong>${data.unbind_reason}</p>` : ''}
      </div>

      <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin-top: 0;">客户留存联系方式</h3>
        <p><strong>联系人：</strong>${verifyData.contactPerson || '-'}</p>
        <p><strong>联系电话：</strong>${verifyData.contactPhone || '-'}</p>
        <p><strong>联系邮箱：</strong>${verifyData.contactEmail || '-'}</p>
      </div>

      <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <h3 style="margin-top: 0;">请确认</h3>
        <p>请核实以上信息是否与您记录的客户信息一致。</p>
        <p>核实通过后，请回复邮件确认客户身份。</p>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 12px;">营业执照已作为附件发送，请查收</p>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="color: #94a3b8; font-size: 12px;">
        此邮件由客户服务申请系统自动发送<br>
        如有问题请联系系统管理员
      </p>
    </div>
  `;
}

export function generateSupportTeamEmailHtml(
  data: ApplyFormData,
  verifyData: IdentityVerifyData,
  submitId: string
): string {
  const serviceTypeName = serviceTypeNames[data.serviceType] || data.serviceType;

  const fieldsHtml = renderServiceFields(data);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e3a5f;">客户身份验证已通过</h2>
      <p>您好，售后团队：</p>
      <p>以下客户的申请已通过服务商身份验证：</p>

      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">申请信息</h3>
        <p><strong>申请编号：</strong>${submitId}</p>
        <p><strong>服务类型：</strong>${serviceTypeName}</p>
        ${fieldsHtml}
        ${data.customer_type ? `<p><strong>用户类型：</strong>${data.customer_type === 'enterprise' ? '企业用户' : '个人用户'}</p>` : ''}
      </div>

      <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin-top: 0;">客户留存联系方式</h3>
        <p><strong>联系人：</strong>${verifyData.contactPerson || '-'}</p>
        <p><strong>联系电话：</strong>${verifyData.contactPhone || '-'}</p>
        <p><strong>联系邮箱：</strong>${verifyData.contactEmail || '-'}</p>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="color: #94a3b8; font-size: 12px;">
        此邮件由客户服务申请系统自动发送<br>
        如有问题请联系系统管理员
      </p>
    </div>
  `;
}

export function generateRejectedEmailHtml(
  data: ApplyFormData,
  verifyData: IdentityVerifyData,
  submitId: string,
  rejectReason: string
): string {
  const serviceTypeName = serviceTypeNames[data.serviceType] || data.serviceType;

  const fieldsHtml = renderServiceFields(data);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #b91c1c;">客户身份验证未通过</h2>
      <p>您好，售后团队：</p>
      <p>以下客户的申请未通过服务商身份验证：</p>

      <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <h3 style="margin-top: 0;">服务商回复</h3>
        <p style="white-space: pre-wrap;">${(rejectReason || '').replace(/</g, '&lt;')}</p>
      </div>

      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">申请信息</h3>
        <p><strong>申请编号：</strong>${submitId}</p>
        <p><strong>服务类型：</strong>${serviceTypeName}</p>
        ${fieldsHtml}
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="color: #94a3b8; font-size: 12px;">
        此邮件由客户服务申请系统自动发送<br>
        如有问题请联系系统管理员
      </p>
    </div>
  `;
}
