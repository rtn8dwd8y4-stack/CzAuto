import { useState, useCallback, useRef } from 'react';

export interface DomainValidation {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  message: string;
  customer?: { id: number; domain: string; company_name: string };
  reason?: string;
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

function isValidDomainFormat(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

export function useDomainValidation() {
  const [validation, setValidation] = useState<DomainValidation>({ status: 'idle', message: '' });
  const debounceRef = useRef<any>(null);

  const checkDomain = useCallback(async (raw: string, callback?: (valid: boolean | null) => void) => {
    const domain = normalizeDomain(raw);

    if (!domain) {
      setValidation({ status: 'idle', message: '' });
      callback?.(null);
      return;
    }

    if (!isValidDomainFormat(domain)) {
      setValidation({ status: 'invalid', message: '域名格式不正确，请填写如 example.com' });
      callback?.(false);
      return;
    }

    setValidation({ status: 'valid', message: '域名格式正确，提交后系统将自动校验域名归属' });
    callback?.(true);
  }, []);

  const debouncedCheck = useCallback((raw: string, callback?: (valid: boolean | null) => void) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkDomain(raw, callback), 500);
  }, [checkDomain]);

  const checkNow = useCallback((raw: string, callback?: (valid: boolean | null) => void) => {
    checkDomain(raw, callback);
  }, [checkDomain]);

  const reset = useCallback(() => {
    setValidation({ status: 'idle', message: '' });
  }, []);

  return { validation, debouncedCheck, checkNow, reset };
}