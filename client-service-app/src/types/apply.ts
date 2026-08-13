export type ServiceType =
  | 'resetPassword'
  | 'changeDomain'
  | 'bindMultiDomain'
  | 'bindDomainAlias'
  | 'unbindMultiDomain'
  | 'unbindDomainAlias'
  | 'changeCompanyName'
  | 'deleteOrgConfig'
  | 'unbind2FA';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface ShowWhenCondition {
  field: 'customer_type';
  value: 'enterprise' | 'personal';
}

export interface FormField {
  name: keyof ApplyFormData;
  label: string;
  placeholder?: string;
  required: boolean;
  type: 'text' | 'textarea' | 'number' | 'file' | 'select' | 'dynamic-list';
  options?: FormFieldOption[];
  showWhen?: ShowWhenCondition;
  dynamicLabel?: boolean;
}

export interface ServiceConfig {
  id: ServiceType;
  name: string;
  description: string;
  icon: string;
  requiresVerify: boolean;
  requiresDomainCheck?: boolean;
  fields: FormField[];
  requiresApplicationForm?: boolean;
  templateFile?: string;
  templateFiles?: { label: string; file: string }[];
}

export interface ApplyFormData {
  customerDomain: string;
  serviceType: ServiceType;
  companyName: string;
  applicant_name: string;
  applicant_email: string;
  contract_subject: 'ys' | 'lk';
  customer_type?: 'enterprise' | 'personal';
  receive_email?: string;
  rss_confirmed?: 'yes' | 'no';
  adminAccount: string;
  applyReason: string;
  additionalInfo: string;
  oldDomain?: string;
  newDomain?: string;
  sub_domains?: string[];
  alias_domains?: string[];
  unbindDomain?: string;
  unbindMultiDomain?: string[];
  unbindDomainAlias?: string[];
  old_name?: string;
  new_name?: string;
  newOrgName?: string;
  companyName_change?: {
    old_name: string;
    new_name: string;
  };
  expiry_date?: string;
  unbind_devices?: string[];
  unbind_reason?: string;
  unbindEmail?: string;
}

export interface IdentityVerifyData {
  businessLicense: File | null;
  identityCard: File | null;
  applicationForm: File | null;
  disclaimer: File | null;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
}

export interface ApplyWizardData {
  step: number;
  formData: ApplyFormData;
  verifyData: IdentityVerifyData;
}

export const SERVICE_TYPES: ServiceConfig[] = [
  {
    id: 'resetPassword',
    name: '重置管理员密码',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: 'resetPassword.doc',
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '个人名义购买的用户请填写真实姓名', required: true, type: 'text' },
      { name: 'adminAccount', label: '需重置邮箱账号', placeholder: '如果不填写则默认重置admin邮箱', required: false, type: 'text' },
      { name: 'receive_email', label: '新密码接收邮箱', placeholder: '重置后的密码将发送至此邮箱', required: true, type: 'text' },
    ],
  },
  {
    id: 'changeDomain',
    name: '更改域名',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: 'changeDomain.doc',
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入公司名称', required: true, type: 'text' },
      { name: 'oldDomain', label: '原域名', placeholder: '当前使用的域名', required: true, type: 'text' },
      { name: 'newDomain', label: '新域名', placeholder: '请填写需更换为的新域名', required: true, type: 'text' },
    ],
  },
  {
    id: 'bindMultiDomain',
    name: '绑定多域名',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: 'bindMultiDomain.doc',
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入公司名称', required: true, type: 'text' },
      { name: 'adminAccount', label: '主域名', placeholder: '当前使用的主域名', required: true, type: 'text' },
      { name: 'sub_domains', label: '新增副域名', placeholder: '请填写需新增的副域名', required: true, type: 'dynamic-list' },
    ],
  },
  {
    id: 'bindDomainAlias',
    name: '绑定域别名',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: 'bindDomainAlias.doc',
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入公司名称', required: true, type: 'text' },
      { name: 'adminAccount', label: '主域名', placeholder: '当前使用的主域名', required: true, type: 'text' },
      { name: 'alias_domains', label: '新增域别名', placeholder: '请填写需新增的域别名', required: true, type: 'dynamic-list' },
    ],
  },
  {
    id: 'unbindMultiDomain',
    name: '解绑多域名',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: '解绑多域名管理申请(广东盈世2021.9版).doc',
    templateFiles: [
      { label: '解绑多域名申请书', file: '解绑多域名管理申请(广东盈世2021.9版).doc' },
      { label: '解绑多域名申请书（论客）', file: '解绑多域名管理申请(论客科技2021.9版).doc' },
    ],
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入公司名称', required: true, type: 'text' },
      { name: 'adminAccount', label: '主域名', placeholder: '当前使用的主域名', required: true, type: 'text' },
      { name: 'unbindMultiDomain', label: '需解绑域名', placeholder: '请输入需解绑的域名', required: true, type: 'dynamic-list' },
    ],
  },
  {
    id: 'unbindDomainAlias',
    name: '解绑域别名',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: '解绑域别名管理申请(广东盈世2021.9版).doc',
    templateFiles: [
      { label: '解绑域别名申请书', file: '解绑域别名管理申请(广东盈世2021.9版).doc' },
      { label: '解绑域别名申请书（论客）', file: '解绑域别名管理申请(论客科技2021.9版).doc' },
    ],
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入公司名称', required: true, type: 'text' },
      { name: 'adminAccount', label: '主域名', placeholder: '当前使用的主域名', required: true, type: 'text' },
      { name: 'unbindDomainAlias', label: '需解绑域别名', placeholder: '请输入需解绑的域别名', required: true, type: 'dynamic-list' },
    ],
  },
  {
    id: 'changeCompanyName',
    name: '更改公司名称',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: '更改组织名称申请(广东盈世2021.9版).doc',
    templateFiles: [
      { label: '更改公司名称申请书', file: '更改组织名称申请(广东盈世2021.9版).doc' },
      { label: '更改公司名称申请书（论客）', file: '更改组织名称申请(论客科技2021.9版).doc' },
    ],
    fields: [
      { name: 'old_name', label: '原公司名称', placeholder: '请输入原公司名称', required: true, type: 'text' },
      { name: 'new_name', label: '新公司名称', placeholder: '请输入新公司名称', required: true, type: 'text' },
    ],
  },
  {
    id: 'deleteOrgConfig',
    name: '删除组织配置信息',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: true,
    templateFile: '删除组织配置申请(广东盈世2021.9版).doc',
    templateFiles: [
      { label: '删除组织配置申请书', file: '删除组织配置申请(广东盈世2021.9版).doc' },
      { label: '删除组织配置申请书（论客）', file: '删除组织配置申请(论客科技2021.9版).doc' },
    ],
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入客户名称', required: true, type: 'text' },
    ],
  },
  {
    id: 'unbind2FA',
    name: '解绑二次验证',
    description: '需要二次验证身份',
    icon: '',
    requiresVerify: true,
    requiresDomainCheck: true,
    requiresApplicationForm: false,
    fields: [
      { name: 'companyName', label: '公司名称', placeholder: '请输入客户名称', required: true, type: 'text' },
      { name: 'unbindEmail', label: '需解绑邮箱账号', placeholder: '需要解绑二次验证的邮箱完整地址', required: true, type: 'text' },
    ],
  },
];

export const STEP_LABELS = ['填写信息', '身份验证', '确认提交'];

export function getServiceConfig(serviceType: ServiceType): ServiceConfig | undefined {
  return SERVICE_TYPES.find(s => s.id === serviceType);
}