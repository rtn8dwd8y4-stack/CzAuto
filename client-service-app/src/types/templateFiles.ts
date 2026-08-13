import { ServiceType } from './apply';

export interface TemplateFiles {
  ys: string;
  lk: string;
}

const YS_SUFFIX = '(广东盈世2021.9版).doc';
const LK_SUFFIX = '(论客科技2021.9版).doc';

function pair(base: string): TemplateFiles {
  return { ys: `${base}${YS_SUFFIX}`, lk: `${base}${LK_SUFFIX}` };
}

export const TEMPLATE_FILES: Record<ServiceType, TemplateFiles> = {
  resetPassword: pair('管理员密码取回申请'),
  changeDomain: pair('更改域名申请'),
  bindMultiDomain: pair('绑定多域名管理申请'),
  bindDomainAlias: pair('绑定域别名管理申请'),
  unbindMultiDomain: pair('解绑多域名管理申请'),
  unbindDomainAlias: pair('解绑域别名管理申请'),
  changeCompanyName: pair('更改组织名称申请'),
  deleteOrgConfig: pair('删除组织配置申请'),
  unbind2FA: pair('管理员密码取回申请'),
};

export const DISCLAIMER_FILES: TemplateFiles = pair('免责声明申请');

export function templateUrl(fileName: string): string {
  return `/templates/${encodeURIComponent(fileName)}`;
}
