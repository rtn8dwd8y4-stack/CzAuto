import { useState, useEffect } from 'react';
import {
  Box, AppBar, Toolbar, Typography, Container, Paper, Button, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Alert,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddIcon from '@mui/icons-material/Add';

interface Agent {
  id: number;
  agent_name: string;
  email: string | null;
  rss_account: string | null;
  department: string | null;
  channel_manager: string | null;
  is_oem: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  agent_type: string;
  created_at: string;
}

export default function AgentList() {
  const [list, setList] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [agentTypeFilter, setAgentTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    agent_name: '',
    email: '',
    rss_account: '',
    department: '',
    channel_manager: '',
    contact_person: '',
    contact_phone: '',
    agent_type: '渠道',
  });
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    if (!addForm.agent_name.trim()) {
      setAddError('代理商名称不能为空');
      return;
    }
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.success) {
        setAddOpen(false);
        setAddForm({ agent_name: '', email: '', rss_account: '', department: '', channel_manager: '', contact_person: '', contact_phone: '', agent_type: '渠道' });
        setAddError('');
        fetchList();
      } else {
        setAddError(data.error || '添加失败');
      }
    } catch (err) {
      setAddError('网络错误');
    }
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('pageSize', String(rowsPerPage));
      if (search) params.set('search', search);
      if (agentTypeFilter) params.set('agentType', agentTypeFilter);

      const res = await fetch(`/api/admin/agents?${params}`);
      const data = await res.json();
      if (data.success) {
        setList(data.list);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('查询失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [page, rowsPerPage]);

  const handleSearch = () => {
    setPage(0);
    fetchList();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            代理商档案管理
          </Typography>
          <Button color="inherit" onClick={() => window.history.back()}>返回</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              label="搜索代理商/邮箱/联系人"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <TextField
              select
              label="类型"
              size="small"
              value={agentTypeFilter}
              onChange={(e) => setAgentTypeFilter(e.target.value)}
              sx={{ minWidth: 100 }}
            >
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="渠道">渠道</MenuItem>
              <MenuItem value="直销">直销</MenuItem>
            </TextField>
            <Button variant="contained" onClick={handleSearch} disabled={loading}>
              {loading ? '查询中...' : '搜索'}
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              color="success"
              startIcon={<UploadFileIcon />}
              onClick={() => {
                setImportResult(null);
                setError('');
                setImportOpen(true);
              }}
            >
              批量导入
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setAddError('');
                setAddOpen(true);
              }}
              sx={{ ml: 1 }}
            >
              新增代理商
            </Button>
          </Stack>
        </Paper>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell>代理商名称</TableCell>
                <TableCell>邮箱</TableCell>
                <TableCell>RSS账号</TableCell>
                <TableCell>部门</TableCell>
                <TableCell>渠道经理</TableCell>
                <TableCell>联系人</TableCell>
                <TableCell>类型</TableCell>
                <TableCell>添加时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{a.agent_name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{a.email || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{a.rss_account || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{a.department || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{a.channel_manager || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{a.contact_person || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={a.agent_type}
                      color={a.agent_type === '直销' ? 'warning' : 'primary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleDateString('zh-CN')}</TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="每页"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} 共 ${count}`}
          />
        </TableContainer>
      </Container>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>批量导入代理商</DialogTitle>
        <DialogContent>
          <input
            type="file"
            accept=".xlsx"
            id="agent-import-input"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImporting(true);
              setImportResult(null);
              try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/admin/agents/import-xlsx', {
                  method: 'POST',
                  body: formData,
                });
                const data = await res.json();
                if (data.success) {
                  setImportResult({ inserted: data.inserted, skipped: data.skipped });
                  fetchList();
                } else {
                  setError(data.error || '导入失败');
                }
              } catch (err) {
                setError('网络错误');
              } finally {
                setImporting(false);
                e.target.value = '';
              }
            }}
          />
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {importResult ? (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <Alert severity="success" sx={{ mb: 1 }}>导入完成</Alert>
              <Typography variant="body2" sx={{ color: '#10b981' }}>新增插入：{importResult.inserted} 条</Typography>
              <Typography variant="body2" sx={{ color: '#f59e0b' }}>跳过（已存在）：{importResult.skipped} 条</Typography>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info">
                支持 .xlsx 文件。读取"2025年代理商更新"（渠道）和"直销代理商"两个 Sheet，重复代理商跳过。
              </Alert>
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                disabled={importing}
                onClick={() => document.getElementById('agent-import-input')?.click()}
              >
                {importing ? '导入中...' : '选择 .xlsx 文件'}
              </Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportOpen(false);
              setImportResult(null);
              setError('');
              fetchList();
            }}
          >
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新增代理商</DialogTitle>
        <DialogContent>
          {addError && <Alert severity="error" sx={{ mb: 2 }}>{addError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="代理商名称"
              fullWidth
              required
              value={addForm.agent_name}
              onChange={(e) => setAddForm({ ...addForm, agent_name: e.target.value })}
            />
            <TextField
              label="邮箱"
              fullWidth
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              placeholder="如 icm00003@agent.coremail.cn"
            />
            <TextField
              label="RSS系统账号"
              fullWidth
              value={addForm.rss_account}
              onChange={(e) => setAddForm({ ...addForm, rss_account: e.target.value })}
            />
            <TextField
              label="部门"
              fullWidth
              value={addForm.department}
              onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
            />
            <TextField
              label="渠道经理"
              fullWidth
              value={addForm.channel_manager}
              onChange={(e) => setAddForm({ ...addForm, channel_manager: e.target.value })}
            />
            <TextField
              label="联系人"
              fullWidth
              value={addForm.contact_person}
              onChange={(e) => setAddForm({ ...addForm, contact_person: e.target.value })}
            />
            <TextField
              label="联系人手机号码"
              fullWidth
              value={addForm.contact_phone}
              onChange={(e) => setAddForm({ ...addForm, contact_phone: e.target.value })}
            />
            <TextField
              select
              label="类型"
              value={addForm.agent_type}
              onChange={(e) => setAddForm({ ...addForm, agent_type: e.target.value })}
            >
              <MenuItem value="渠道">渠道</MenuItem>
              <MenuItem value="直销">直销</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleAdd}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}