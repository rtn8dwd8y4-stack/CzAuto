import { useState, useEffect } from 'react';
import {
  Box, AppBar, Toolbar, Typography, Container, Paper, Button, TextField, Stack, Alert, Chip,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';

export default function WhitelistSettings() {
  const [domains, setDomains] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchList = async () => {
    try {
      const res = await fetch('/api/admin/settings/whitelist');
      const data = await res.json();
      if (data.success) {
        setDomains(data.domains);
        setText(data.domains.join('\n'));
      }
    } catch (error) {
      console.error('查询失败:', error);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleSave = async () => {
    setMessage('');
    setLoading(true);

    const list = text.split(/[\n,]/).map(d => d.trim()).filter(d => d.length > 0);
    if (list.length === 0) {
      setMessage('白名单不能为空');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/settings/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: list }),
      });
      const data = await res.json();
      if (data.success) {
        setDomains(data.domains);
        setMessage('已保存');
        setTimeout(() => setMessage(''), 2000);
      } else {
        setMessage(data.error || '保存失败');
      }
    } catch (error) {
      setMessage('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            白名单管理
          </Typography>
          <Button color="inherit" onClick={() => window.history.back()}>返回</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 3, mb: 4 }}>
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            域名白名单
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            白名单中的域名会绕过客户名单校验。每个域名占一行。这些域名通常用于内部测试。
          </Typography>

          {message && (
            <Alert severity={message === '已保存' ? 'success' : 'error'} sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}

          <TextField
            label="白名单域名列表"
            multiline
            rows={10}
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="yourcompany.com&#10;test.com&#10;internal.local"
            helperText="每行一个域名，输入后会去除前后空格"
            sx={{ mb: 2 }}
          />

          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </Button>
            {domains.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                当前已配置 {domains.length} 个域名
              </Typography>
            )}
          </Stack>

          {domains.length > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                当前白名单：
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                {domains.map((d) => (
                  <Chip key={d} label={d} size="small" color="primary" variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
}