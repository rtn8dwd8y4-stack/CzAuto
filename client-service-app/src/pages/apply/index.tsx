import { useState } from 'react';
import { Box, AppBar, Toolbar, Typography, CircularProgress, Backdrop, Snackbar, Alert } from '@mui/material';
import ApplyForm from './ApplyForm';
import IdentityVerify from './IdentityVerify';
import ConfirmSubmit from './ConfirmSubmit';
import Success from './Success';
import { useApplyWizard } from '../../hooks/useApplyWizard';
import { getServiceConfig } from '../../types/apply';

const SUPPORT_TEAM_EMAIL = 'support@coremail.cn';
const RELAY_BASE = (import.meta.env.VITE_RELAY_URL as string | undefined) || '/api';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

export default function ApplyPage() {
  const {
    data,
    nextStep,
    prevStep,
    updateFormData,
    updateVerifyData,
    requiresVerify,
    submit,
    reset,
    isSubmitted,
    submitId,
    domainValid,
    setDomainValid,
  } = useApplyWizard();

  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailPreviewUrls, setEmailPreviewUrls] = useState<{ serviceProvider: string; supportTeam: string } | null>(null);

  const { step, formData, verifyData } = data;
  const showVerify = requiresVerify(formData.serviceType);

  const handleSubmit = async () => {
    setIsSendingEmail(true);
    
    try {
      let businessLicenseBase64: string | undefined;
      let businessLicenseName: string | undefined;
      let identityCardBase64: string | undefined;
      let identityCardName: string | undefined;
      let applicationFormBase64: string | undefined;
      let applicationFormName: string | undefined;
      let disclaimerBase64: string | undefined;
      let disclaimerName: string | undefined;
      
      if (verifyData.businessLicense) {
        businessLicenseBase64 = await fileToBase64(verifyData.businessLicense);
        businessLicenseName = verifyData.businessLicense.name;
        console.log('营业执照文件:', businessLicenseName, '大小:', businessLicenseBase64.length, 'chars');
      }
      if (verifyData.identityCard) {
        identityCardBase64 = await fileToBase64(verifyData.identityCard);
        identityCardName = verifyData.identityCard.name;
        console.log('身份证文件:', identityCardName);
      }
      if (verifyData.applicationForm) {
        applicationFormBase64 = await fileToBase64(verifyData.applicationForm);
        applicationFormName = verifyData.applicationForm.name;
        console.log('申请书文件:', applicationFormName);
      }
      if (verifyData.disclaimer) {
        disclaimerBase64 = await fileToBase64(verifyData.disclaimer);
        disclaimerName = verifyData.disclaimer.name;
        console.log('免责声明文件:', disclaimerName);
      }
      
      const files: Record<string, { name: string; data: string }> = {};
      const fileMap: Record<string, { base64: string | undefined; name: string | undefined }> = {
        applicationForm: { base64: applicationFormBase64, name: applicationFormName },
        disclaimer: { base64: disclaimerBase64, name: disclaimerName },
        businessLicense: { base64: businessLicenseBase64, name: businessLicenseName },
        identityCard: { base64: identityCardBase64, name: identityCardName },
      };
      for (const [type, f] of Object.entries(fileMap)) {
        if (f?.base64 && f.name) files[type] = { name: f.name, data: f.base64.replace(/^data:.*;base64,/, '') };
      }

      const response = await fetch(`${RELAY_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: formData,
          verifyData: verifyData,
          files,
        }),
      });

      const result = await response.json();

      console.log('relay返回结果:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.message || '提交失败');
      }
      console.log('邮件发送成功! 申请编号:', result.submitId);
      setSubmitError(null);
      submit();
    } catch (error) {
      console.error('发送邮件失败:', error);
      setSubmitError(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (isSubmitted) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
        <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              客户服务申请系统
            </Typography>
          </Toolbar>
        </AppBar>
        <Success 
          submitId={submitId} 
          onReset={reset} 
        />
      </Box>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <ApplyForm
            formData={formData}
            onUpdate={updateFormData}
            onNext={nextStep}
            onPrev={prevStep}
            currentStep={1}
            domainValid={domainValid}
            onDomainValidChange={setDomainValid}
          />
        );
      case 2:
        if (!showVerify) {
          nextStep();
          return null;
        }
        return (
          <IdentityVerify
            verifyData={verifyData}
            serviceConfig={getServiceConfig(formData.serviceType)}
            customerType={formData.customer_type}
            onUpdate={updateVerifyData}
            onNext={nextStep}
            onPrev={prevStep}
          />
        );
      case 3:
        return (
          <ConfirmSubmit
            formData={formData}
            verifyData={verifyData}
            onSubmit={handleSubmit}
            onPrev={prevStep}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            客户服务申请系统
          </Typography>
        </Toolbar>
      </AppBar>
      {renderStep()}
      
      <Backdrop open={isSendingEmail} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography sx={{ mt: 2 }}>正在发送验证邮件...</Typography>
        </Box>
      </Backdrop>

      <Snackbar
        open={!!submitError}
        autoHideDuration={6000}
        onClose={() => setSubmitError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      </Snackbar>
    </Box>
  );
}