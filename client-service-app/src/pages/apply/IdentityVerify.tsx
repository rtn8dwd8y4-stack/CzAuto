import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Box,
  Button,
  Alert,
  Link,
  Tabs,
  Tab,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import WizardStepper from '../../components/apply/WizardStepper';
import { IdentityVerifyData, ServiceConfig } from '../../types/apply';
import { TEMPLATE_FILES, DISCLAIMER_FILES, templateUrl } from '../../types/templateFiles';

interface IdentityVerifyProps {
  verifyData: IdentityVerifyData;
  serviceConfig?: ServiceConfig;
  customerType?: 'enterprise' | 'personal';
  onUpdate: (data: Partial<IdentityVerifyData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

function FileUploadBox({
  label,
  required,
  file,
  onChange,
  accept,
  hint,
}: {
  label: string;
  required?: boolean;
  file: File | null | undefined;
  onChange: (file: File | null) => void;
  accept: string;
  hint?: string;
}) {
  const inputId = `file-${label.replace(/\s/g, '-')}`;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </Typography>
      <Box
        sx={{
          border: '2px dashed #cbd5e1',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: '#f8fafc',
          transition: 'all 0.2s',
          '&:hover': {
            borderColor: '#3b82f6',
            bgcolor: '#eff6ff',
          },
        }}
        onClick={() => document.getElementById(inputId)?.click()}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
        <CloudUploadIcon sx={{ fontSize: 36, color: '#94a3b8', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          点击或拖拽上传
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
        {file && (
          <Typography variant="body2" sx={{ mt: 1, color: '#10b981', fontWeight: 600 }}>
            ✓ 已选择: {file.name}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function TemplateDownload({
  label,
  url,
}: {
  label: string;
  url: string;
}) {
  return (
    <Box
      sx={{
        bgcolor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 2,
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Typography variant="body2" sx={{ color: '#1e40af', fontWeight: 500 }}>
        {label}
      </Typography>
      <Link
        href={url}
        target="_blank"
        rel="noopener"
        download
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        <DownloadIcon fontSize="small" /> 下载模板
      </Link>
    </Box>
  );
}

export default function IdentityVerify({
  verifyData,
  serviceConfig,
  customerType,
  onUpdate,
  onNext,
  onPrev,
}: IdentityVerifyProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<IdentityVerifyData>({
    defaultValues: verifyData,
    mode: 'onBlur',
  });

  useEffect(() => {
    const subscription = watch((value) => {
      const { businessLicense, identityCard, applicationForm, disclaimer, ...textFields } = value as any;
      onUpdate(textFields as Partial<IdentityVerifyData>);
    });
    return () => subscription.unsubscribe();
  }, [watch, onUpdate]);

  const requiresApplicationForm = serviceConfig?.requiresApplicationForm ?? false;
  const serviceId = serviceConfig?.id;

  const onSubmit = () => {
    onNext();
  };

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, mt: 4 }}>
        <WizardStepper currentStep={3} />

        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            该服务涉及管理员账号安全，需要验证身份
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            请上传相关材料并提供当初与服务商沟通时留下的联系方式，我们将联系服务商进行身份核实。
          </Typography>
        </Alert>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          身份验证
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          请提供以下材料以验证您的管理员身份
        </Typography>

        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ maxWidth: 560 }}>
          {requiresApplicationForm && (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
                下载模板
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                请先选择您的签约主体（广东盈世 / 论客），再下载对应的模版填写
              </Typography>
              <Box sx={{ bgcolor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 1, p: 1.5, mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#92400e', fontSize: 12 }}>
                  温馨提示：下载模版后，签名和日期需手写，加盖公章务必清晰，否则可能导致申请被退回。
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ fontWeight: 600, mt: 1, mb: 0.5 }}>广东盈世</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {serviceId && (
                  <TemplateDownload
                    label={`${serviceConfig.name}申请书（盈世）`}
                    url={templateUrl(TEMPLATE_FILES[serviceId].ys)}
                  />
                )}
                <TemplateDownload
                  label="免责声明模板（盈世）"
                  url={templateUrl(DISCLAIMER_FILES.ys)}
                />
              </Box>

              <Typography variant="body2" sx={{ fontWeight: 600, mt: 1, mb: 0.5 }}>论客</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {serviceId && (
                  <TemplateDownload
                    label={`${serviceConfig.name}申请书（论客）`}
                    url={templateUrl(TEMPLATE_FILES[serviceId].lk)}
                  />
                )}
                <TemplateDownload
                  label="免责声明模板（论客）"
                  url={templateUrl(DISCLAIMER_FILES.lk)}
                />
              </Box>
            </>
          )}

          {requiresApplicationForm && (
            <FileUploadBox
              label="申请书"
              required
              file={verifyData.applicationForm}
              onChange={(file) => onUpdate({ applicationForm: file })}
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,application/pdf"
              hint="支持 Word (.doc/.docx)、图片 (.png/.jpg)、PDF"
            />
          )}

          <FileUploadBox
            label="免责声明"
            required
            file={verifyData.disclaimer}
            onChange={(file) => onUpdate({ disclaimer: file })}
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,application/pdf"
            hint="支持 Word (.doc/.docx)、图片 (.png/.jpg)、PDF"
          />

          <FileUploadBox
            label="营业执照或身份证"
            file={verifyData.businessLicense}
            onChange={(file) => onUpdate({ businessLicense: file })}
            accept="image/jpeg,image/png,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hint="支持 图片 (.png/.jpg)、PDF、Word (.doc/.docx)"
          />

          <TextField
            {...register('contactPerson', { required: '请输入您的真实姓名' })}
            label="申请人姓名"
            fullWidth
            error={!!errors.contactPerson}
            helperText={errors.contactPerson?.message}
            margin="normal"
            placeholder="为方便联系，请填写您的真实姓名"
          />

          <TextField
            {...register('contactEmail', { required: '请输入您的联系邮箱' })}
            label="申请人邮箱"
            fullWidth
            error={!!errors.contactEmail}
            helperText={errors.contactEmail?.message}
            margin="normal"
            placeholder="为方便联系，请填写您的联系邮箱"
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
            <Button
              variant="outlined"
              size="large"
              onClick={onPrev}
              sx={{ px: 4, py: 1.5 }}
            >
              ← 上一步
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                bgcolor: '#3b82f6',
                '&:hover': { bgcolor: '#2563eb' },
              }}
            >
              下一步 →
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}