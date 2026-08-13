import { Box, Stepper, Step, StepLabel, useMediaQuery, useTheme } from '@mui/material';
import { STEP_LABELS } from '../../types/apply';

interface WizardStepperProps {
  currentStep: number;
}

export default function WizardStepper({ currentStep }: WizardStepperProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box sx={{ width: '100%', mb: 4 }}>
      <Stepper activeStep={currentStep - 1} alternativeLabel={!isMobile} orientation={isMobile ? 'vertical' : 'horizontal'}>
        {STEP_LABELS.map((label, index) => (
          <Step key={label} completed={index + 1 < currentStep}>
            <StepLabel
              sx={{
                '& .MuiStepLabel-label': {
                  fontSize: isMobile ? '12px' : '14px',
                },
              }}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}