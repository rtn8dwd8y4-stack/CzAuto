import { useEffect, useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from '@mui/material';
import WizardStepper from '../../components/apply/WizardStepper';
import DomainField from '../../components/apply/DomainField';
import DynamicListField from '../../components/apply/DynamicListField';
import { ApplyFormData, SERVICE_TYPES, getServiceConfig } from '../../types/apply';

interface ApplyFormProps {
  formData: ApplyFormData;
  onUpdate: (data: Partial<ApplyFormData>) => void;
  onNext: () => void;
  onPrev: () => void;
  currentStep: number;
  domainValid: boolean | null;
  onDomainValidChange: (valid: boolean | null) => void;
}

export default function ApplyForm({ formData, onUpdate, onNext, onPrev, currentStep, domainValid: domainValidProp, onDomainValidChange }: ApplyFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ApplyFormData>({
    defaultValues: formData,
    mode: 'onBlur',
  });

  const selectedService = watch('serviceType');
  const serviceConfig = getServiceConfig(selectedService);
  const requiresVerify = serviceConfig?.requiresVerify ?? false;
  const requiresDomainCheck = serviceConfig?.requiresDomainCheck ?? false;
  const [domainValid, setDomainValidLocal] = useState<boolean | null>(domainValidProp);
  const prevServiceRef = useRef(selectedService);

  useEffect(() => {
    if (prevServiceRef.current !== selectedService) {
      prevServiceRef.current = selectedService;
      setDomainValidLocal(null);
      onDomainValidChange(null);
    }
  }, [selectedService]);

  const setDomainValid = (v: boolean | null) => {
    setDomainValidLocal(v);
    onDomainValidChange(v);
  };

  useEffect(() => {
    const subscription = watch((value) => {
      onUpdate(value as Partial<ApplyFormData>);
    });
    return () => subscription.unsubscribe();
  }, [watch, onUpdate]);

  const onSubmit = () => {
    if (requiresDomainCheck && domainValid !== true) {
      alert('请先输入有效的客户域名并通过校验');
      return;
    }
    if (requiresVerify) {
      onNext();
    } else {
      onNext();
      onNext();
    }
  };

  const renderField = (field: any) => {
    const fieldError = errors[field.name as keyof ApplyFormData];

    if (field.type === 'dynamic-list') {
      const currentValues = (watch(field.name as any) as string[]) || [];
      return (
        <DynamicListField
          key={field.name}
          label={field.label}
          values={Array.isArray(currentValues) ? currentValues : (currentValues ? [currentValues] : [])}
          onChange={(vals) => setValue(field.name, vals as any, { shouldValidate: true })}
          placeholder={field.placeholder}
          required={field.required}
          addLabel={`添加${field.label}`}
        />
      );
    }

    if (field.type === 'textarea') {
      return (
        <TextField
          key={field.name}
          {...register(field.name, { required: field.required ? '此项为必填' : false })}
          label={field.label}
          fullWidth
          multiline
          rows={3}
          error={!!fieldError}
          helperText={fieldError?.message as string}
          margin="normal"
          placeholder={field.placeholder}
        />
      );
    }

    if (field.type === 'number') {
      return (
        <TextField
          key={field.name}
          {...register(field.name, {
            required: field.required ? '此项为必填' : false,
            valueAsNumber: true,
          })}
          label={field.label}
          type="number"
          fullWidth
          error={!!fieldError}
          helperText={fieldError?.message as string}
          margin="normal"
          placeholder={field.placeholder}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <Controller
          key={field.name}
          name={field.name}
          control={control}
          rules={{ required: field.required ? '此项为必填' : false }}
          render={({ field: f }) => (
            <TextField
              {...f}
              select
              label={field.label}
              fullWidth
              error={!!fieldError}
              helperText={fieldError?.message as string}
              margin="normal"
            >
              {(field.options || []).map((opt: { value: string; label: string }) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      );
    }

    return (
      <TextField
        key={field.name}
        {...register(field.name, { required: field.required ? '此项为必填' : false })}
        label={field.label}
        fullWidth
        error={!!fieldError}
        helperText={fieldError?.message as string}
        margin="normal"
        placeholder={field.placeholder}
      />
    );
  };

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, mt: 4 }}>
        <WizardStepper currentStep={currentStep} />

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          填写申请信息
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          请填写以下信息以便我们处理您的申请
        </Typography>

        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ maxWidth: 560 }}>
          <Controller
            name="serviceType"
            control={control}
            rules={{ required: '请选择服务类型' }}
            render={({ field }) => (
              <FormControl fullWidth error={!!errors.serviceType} margin="normal">
                <InputLabel>服务类型</InputLabel>
                <Select {...field} label="服务类型">
                  {SERVICE_TYPES.map((service) => (
                    <MenuItem key={service.id} value={service.id}>
                      {service.name}
                    </MenuItem>
                  ))}
                </Select>
                {errors.serviceType && <FormHelperText>{errors.serviceType.message}</FormHelperText>}
              </FormControl>
            )}
          />

          {selectedService && serviceConfig && (
            <>
              {requiresDomainCheck && (
                <DomainField
                  name="customerDomain"
                  label="主域名"
                  value={(watch('customerDomain') as string) || ''}
                  onChange={(v) => {
                    setValue('customerDomain', v, { shouldValidate: true });
                    setDomainValid(null);
                  }}
                  onValidationChange={(v) => setDomainValid(v)}
                  placeholder="例：baidu.com"
                  required
                  register={register}
                  error={errors.customerDomain}
                />
              )}

              <Box sx={{ mt: 2, p: 2, bgcolor: '#fffbeb', borderRadius: 1, border: '1px solid #fde68a', mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  {requiresVerify ? '该服务涉及管理员账号安全，需要验证身份' : '该服务无需身份验证'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#78350f', mt: 0.5, fontSize: '13px' }}>
                  {requiresVerify ? '选择此服务后，将需要上传营业执照并提供联系方式进行身份验证' : '提交申请后可直接等待处理'}
                </Typography>
              </Box>

              {serviceConfig.fields && serviceConfig.fields
                .filter((field: any) => {
                  if (!field.showWhen) return true;
                  const watched = watch(field.showWhen.field);
                  return watched === field.showWhen.value;
                })
                .map((field: any) => renderField(field))}
            </>
          )}

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
              disabled={!selectedService || (requiresDomainCheck && domainValid !== true)}
              title={requiresDomainCheck && domainValid !== true ? '请先通过客户域名校验' : ''}
              sx={{
                px: 4,
                py: 1.5,
                bgcolor: '#3b82f6',
                '&:hover': { bgcolor: '#2563eb' },
                '&.Mui-disabled': { bgcolor: '#e2e8f0' },
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