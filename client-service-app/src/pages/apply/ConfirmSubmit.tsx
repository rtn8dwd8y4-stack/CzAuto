import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Divider,
} from '@mui/material';
import WizardStepper from '../../components/apply/WizardStepper';
import { ApplyFormData, IdentityVerifyData, getServiceConfig } from '../../types/apply';

interface ConfirmSubmitProps {
  formData: ApplyFormData;
  verifyData: IdentityVerifyData;
  onSubmit: () => void;
  onPrev: () => void;
}

export default function ConfirmSubmit({ formData, verifyData, onSubmit, onPrev }: ConfirmSubmitProps) {
  const serviceConfig = getServiceConfig(formData.serviceType);
  const showVerify = serviceConfig?.requiresVerify ?? false;

  const maskPhone = (phone: string) => {
    if (!phone || phone.length !== 11) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(7);
  };

  const maskEmail = (email: string) => {
    if (!email) return '-';
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return email;
    const name = email.slice(0, atIndex);
    const domain = email.slice(atIndex);
    return name.slice(0, 3) + '***' + domain;
  };

  const getFieldDisplayValue = (fieldName: string): string => {
    const value = formData[fieldName as keyof ApplyFormData];
    if (value === undefined || value === null || value === '') return '-';
    if (Array.isArray(value)) return value.filter(v => v.trim() !== '').join('、') || '-';
    return String(value);
  };

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, mt: 4 }}>
        <WizardStepper currentStep={3} />

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          确认您的申请信息
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          请仔细核对以下信息，确认无误后提交
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, p: 2.5, border: '1px solid #e2e8f0', mb: 2 }}>
            <Typography variant="body2" sx={{ color: '#3b82f6', fontWeight: 600, mb: 1.5 }}>
              申请信息
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1, fontSize: 14 }}>
              <Typography color="text.secondary">服务类型</Typography>
              <Typography sx={{ fontWeight: 600 }}>{serviceConfig?.name}</Typography>
              
              {serviceConfig?.fields.map((field) => (
                <Box key={field.name} sx={{ display: 'contents' }}>
                  <Typography color="text.secondary">{field.label}</Typography>
                  <Typography>{getFieldDisplayValue(field.name)}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {showVerify && (
            <Box sx={{ bgcolor: '#fffbeb', borderRadius: 2, p: 2.5, border: '1px solid #fde68a', mb: 2 }}>
              <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 600, mb: 1.5 }}>
                身份验证信息
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1, fontSize: 14 }}>
                {verifyData.applicationForm && (
                  <>
                    <Typography color="text.secondary">申请书</Typography>
                    <Typography>{verifyData.applicationForm.name}</Typography>
                  </>
                )}
                <Typography color="text.secondary">免责声明</Typography>
                <Typography>{verifyData.disclaimer?.name || '未上传'}</Typography>
                
                <Typography color="text.secondary">营业执照</Typography>
                <Typography>{verifyData.businessLicense?.name || '未上传'}</Typography>
                
                <Typography color="text.secondary">申请人姓名</Typography>
                <Typography>{verifyData.contactPerson || '-'}</Typography>
                
                <Typography color="text.secondary">申请人邮箱</Typography>
                <Typography>{verifyData.contactEmail ? maskEmail(verifyData.contactEmail) : '-'}</Typography>
              </Box>
            </Box>
          )}

          <Box sx={{ bgcolor: '#ecfdf5', borderRadius: 2, p: 2.5, border: '1px solid #a7f3d0' }}>
            <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600, mb: 1 }}>
              提交后流程
            </Typography>
            <Typography variant="body2" sx={{ color: '#065f46', fontSize: 13, lineHeight: 1.8 }}>
              1. 系统将自动发送验证邮件至服务商，请求确认您的身份<br />
              2. 服务商确认后，系统将通知售后团队处理您的申请<br />
              3. 您将通过邮件收到处理进度通知
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            size="large"
            onClick={onPrev}
            sx={{ px: 4, py: 1.5 }}
          >
            ← 上一步
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={onSubmit}
            sx={{
              px: 4,
              py: 1.5,
              bgcolor: '#10b981',
              '&:hover': { bgcolor: '#059669' },
            }}
          >
            确认提交
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}