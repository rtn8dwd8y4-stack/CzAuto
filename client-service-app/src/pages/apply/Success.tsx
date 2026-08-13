import { Container, Paper, Typography, Box, Button } from '@mui/material';

interface SuccessProps {
  submitId: string;
  onReset: () => void;
}

export default function Success({ submitId, onReset }: SuccessProps) {
  return (
    <Container maxWidth="sm">
      <Paper
        sx={{
          p: { xs: 4, md: 6 },
          borderRadius: 2,
          mt: 4,
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, mb: 1, color: '#065f46' }}
        >
          申请已提交成功
        </Typography>
        
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          您的申请编号为 <strong style={{ color: '#1e293b' }}>{submitId}</strong>
        </Typography>

        <Box
          sx={{
            bgcolor: '#f8fafc',
            borderRadius: 2,
            p: 2.5,
            textAlign: 'left',
            border: '1px solid #e2e8f0',
            mb: 3,
          }}
        >
          <Typography variant="body2" sx={{ color: '#475569', lineHeight: 2 }}>
            <div>验证邮件已发送至服务商</div>
            <div>等待服务商确认身份</div>
            <div>确认后售后团队将收到通知</div>
            <div>处理结果将通过邮件通知您</div>
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          onClick={onReset}
          sx={{
            px: 4,
            py: 1.5,
            bgcolor: '#3b82f6',
            '&:hover': { bgcolor: '#2563eb' },
          }}
        >
          提交新申请
        </Button>
      </Paper>
    </Container>
  );
}