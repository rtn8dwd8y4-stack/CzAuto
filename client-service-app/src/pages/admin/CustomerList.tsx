import { useState, useEffect } from 'react';
import {
  Box, AppBar, Toolbar, Typography, Container, Paper, Button, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Switch, FormControlLabel, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import UploadFileIcon from '@mui/icons-material/UploadFile';

interface Customer {
  id: number;
  domain: string;
  company_name: string;
  contact_person: string | null;
  contact_phone: string | null;
  provider_name: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export default function CustomerList() {
  const [list, setList] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    domain: '',
    company_name: '',
    contact_person: '',
    contact_phone: '',
    provider_name: '',
    notes: '',
    is_active: true,
  });
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; inserted: number; skipped: number } | null>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('pageSize', String(rowsPerPage));
      if (search) params.set('search', search);
      if (isActiveFilter !== '') params.set('isActive', isActiveFilter);

      const res = await fetch(`/api/admin/customers?${params}`);
      const data = await res.json();
      if (data.success) {
        setList(data.list);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('查询失败:', error);
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

  const openAdd = () => {
    setEditing(null);
    setForm({ domain: '', company_name: '', contact_person: '', contact_phone: '', provider_name: '', notes: '', is_active: true });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      domain: c.domain,
      company_name: c.company_name,
      contact_person: c.contact_person || '',
      contact_phone: c.contact_phone || '',
      provider_name: c.provider_name || '',
      notes: c.notes || '',
      is_active: c.is_active === 1,
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.domain.trim() || !form.company_name.trim()) {
      setError('域名和公司名称不能为空');
      return;
    }

    const url = editing ? `/api/admin/customers/${editing.id}` : '/api/admin/customers';
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, is_active: form.is_active ? 1 : 0 }),
    });
    const data = await res.json();
    if (data.success) {
      setDialogOpen(false);
      fetchList();
    } else {
      setError(data.error || '保存失败');
    }
  };

  const handleDeactivate = async (c: Customer) => {
    if (!confirm(`确定停用客户 ${c.company_name} 吗？`)) return;
    const res = await fetch(`/api/admin/customers/${c.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) fetchList();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            客户名单管理
          </Typography>
          <Button color="inherit" onClick={() => window.history.back()}>返回</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              label="搜索域名/公司名"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <TextField
              select
              label="状态"
              size="small"
              value={isActiveFilter}
              onChange={(e) => setIsActiveFilter(e.target.value)}
              sx={{ minWidth: 100 }}
            >
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="1">启用</MenuItem>
              <MenuItem value="0">停用</MenuItem>
            </TextField>
            <Button variant="contained" onClick={handleSearch} disabled={loading}>
              {loading ? '查询中...' : '搜索'}
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => {
                setImportResult(null);
                setImportOpen(true);
              }}
              sx={{ mr: 1 }}
            >
              批量导入
            </Button>
            <Button variant="contained" color="success" startIcon={<AddIcon />} onClick={openAdd}>
              新增客户
            </Button>
          </Stack>
        </Paper>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell>域名</TableCell>
                <TableCell>公司名称</TableCell>
                <TableCell>联系人</TableCell>
                <TableCell>联系电话</TableCell>
                <TableCell>代理商</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>添加时间</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{c.domain}</TableCell>
                  <TableCell>{c.company_name}</TableCell>
                  <TableCell>{c.contact_person || '-'}</TableCell>
                  <TableCell>{c.contact_phone || '-'}</TableCell>
                  <TableCell>{c.provider_name || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={c.is_active === 1 ? '启用' : '停用'}
                      color={c.is_active === 1 ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{new Date(c.created_at).toLocaleString('zh-CN')}</TableCell>
                  <TableCell align="center">
                    <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(c)}>
                      编辑
                    </Button>
                    {c.is_active === 1 && (
                      <Button size="small" color="error" startIcon={<BlockIcon />} onClick={() => handleDeactivate(c)} sx={{ ml: 1 }}>
                        停用
                      </Button>
                    )}
                  </TableCell>
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '编辑客户' : '新增客户'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="域名"
              fullWidth
              required
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="例：baidu.com"
            />
            <TextField
              label="公司名称"
              fullWidth
              required
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
            <TextField
              label="联系人"
              fullWidth
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
            <TextField
              label="联系电话"
              fullWidth
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
            <TextField
              label="代理商"
              fullWidth
              value={form.provider_name}
              onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
              placeholder="如：陈海燕直销代理商"
            />
            <TextField
              label="备注"
              fullWidth
              multiline
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
              }
              label="启用"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSave}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>批量导入客户域名</DialogTitle>
        <DialogContent>
          <input
            type="file"
            accept=".xlsx"
            id="import-xlsx-input"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImporting(true);
              setImportResult(null);
              try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/admin/customers/import-xlsx', {
                  method: 'POST',
                  body: formData,
                });
                const data = await res.json();
                if (data.success) {
                  setImportResult({ total: data.total, inserted: data.inserted, skipped: data.skipped });
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
              <Typography variant="body2">有效数据：{importResult.total} 条</Typography>
              <Typography variant="body2" sx={{ color: '#10b981' }}>新增插入：{importResult.inserted} 条</Typography>
              <Typography variant="body2" sx={{ color: '#f59e0b' }}>跳过（已存在）：{importResult.skipped} 条</Typography>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info">
                支持 .xlsx 文件，表头格式：客户ID、客户名称、客户状态、域名、到期时间、状态、代理商名称。
                仅导入"正式客户"，重复域名跳过。
              </Alert>
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                disabled={importing}
                onClick={() => document.getElementById('import-xlsx-input')?.click()}
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
    </Box>
  );
}