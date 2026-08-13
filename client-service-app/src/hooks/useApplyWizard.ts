import { useState, useCallback } from 'react';
import { ApplyWizardData, ApplyFormData, IdentityVerifyData, getServiceConfig } from '../types/apply';

const initialFormData: ApplyFormData = {
  customerDomain: '',
  serviceType: 'resetPassword',
  companyName: '',
  applicant_name: '',
  applicant_email: '',
  contract_subject: 'ys',
  adminAccount: '',
  applyReason: '',
  additionalInfo: '',
};

const initialVerifyData: IdentityVerifyData = {
  businessLicense: null,
  identityCard: null,
  applicationForm: null,
  disclaimer: null,
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
};

const initialData: ApplyWizardData = {
  step: 1,
  formData: initialFormData,
  verifyData: initialVerifyData,
};

export function useApplyWizard() {
  const [data, setData] = useState<ApplyWizardData>(initialData);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitId, setSubmitId] = useState('');
  const [domainValid, setDomainValid] = useState<boolean | null>(null);

  const setStep = useCallback((step: number) => {
    setData((prev) => ({ ...prev, step }));
  }, []);

  const nextStep = useCallback(() => {
    setData((prev) => ({ ...prev, step: Math.min(prev.step + 1, 3) }));
  }, []);

  const prevStep = useCallback(() => {
    setData((prev) => ({ ...prev, step: Math.max(prev.step - 1, 1) }));
  }, []);

  const updateFormData = useCallback((updates: Partial<ApplyFormData>) => {
    setData((prev) => ({
      ...prev,
      formData: { ...prev.formData, ...updates },
    }));
  }, []);

  const updateVerifyData = useCallback((updates: Partial<IdentityVerifyData>) => {
    setData((prev) => ({
      ...prev,
      verifyData: { ...prev.verifyData, ...updates },
    }));
  }, []);

  const requiresVerify = useCallback((serviceType: string) => {
    const config = getServiceConfig(serviceType as any);
    return config?.requiresVerify ?? true;
  }, []);

  const submit = useCallback(() => {
    const id = `RHF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    setSubmitId(id);
    setIsSubmitted(true);
  }, []);

  const reset = useCallback(() => {
    setData(initialData);
    setIsSubmitted(false);
    setSubmitId('');
    setDomainValid(null);
  }, []);

  return {
    data,
    setStep,
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
  };
}