import { TextField, Box, Typography, CircularProgress, InputAdornment } from '@mui/material';
import { useDomainValidation } from '../../hooks/useDomainValidation';

interface DomainFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (valid: boolean | null) => void;
  placeholder?: string;
  required?: boolean;
  register?: any;
  error?: any;
}

export default function DomainField({ name, label, value, onChange, onValidationChange, placeholder, required, register, error }: DomainFieldProps) {
  const { validation, debouncedCheck } = useDomainValidation();

  const handleChange = (v: string) => {
    onChange(v);
    onValidationChange?.(null);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        {...(register ? register(name, { required: required ? `${label}不能为空` : false }) : {})}
        name={name}
        label={label}
        fullWidth
        value={value}
        onChange={(e) => {
          handleChange(e.target.value);
          debouncedCheck(e.target.value, onValidationChange);
        }}
        onBlur={() => {
          if (value) debouncedCheck(value, onValidationChange);
        }}
        placeholder={placeholder || '例：baidu.com'}
        error={!!error || validation.status === 'invalid'}
        helperText={error?.message}
        InputProps={{
          endAdornment: validation.status === 'checking' ? (
            <InputAdornment position="end"><CircularProgress size={20} /></InputAdornment>
          ) : validation.status === 'valid' ? (
            <InputAdornment position="end"><Typography sx={{ color: '#10b981', fontWeight: 600 }}>✓</Typography></InputAdornment>
          ) : validation.status === 'invalid' ? (
            <InputAdornment position="end"><Typography sx={{ color: '#ef4444', fontWeight: 600 }}>✗</Typography></InputAdornment>
          ) : null,
        }}
      />
      {!error && validation.status === 'valid' && (
        <Typography variant="body2" sx={{ color: '#10b981', mt: 0.5, ml: 2 }}>
          {validation.message}
        </Typography>
      )}
      {!error && validation.status === 'invalid' && (
        <Typography variant="body2" sx={{ color: '#ef4444', mt: 0.5, ml: 2 }}>
          {validation.message}
        </Typography>
      )}
    </Box>
  );
}