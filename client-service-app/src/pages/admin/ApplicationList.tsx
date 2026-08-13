import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Container, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, Button, TextField, MenuItem, Stack, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';

interface ApplicationItem {
  id: number;
  submit_id: string;
  service_type: string;
  service_name: string;
  company_name: string;
  applicant_name: string | null;
  applicant_email: string | null;
  customer_type: string | null;
  provider_email: string | null;
  domain_match: string | null;
  status: string;
  verify_status: string;
  created_at: string;
  updated_at: string;
  email_sent_count: number;
  email_failed_count: number;
  email_total_count: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  rejected: '已驳回',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  pending: 'default',
  processing: 'primary',
  completed: 'success',
  rejected: 'error',
};

const VERIFY_LABELS: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  unclear: '待人工',
};

const VERIFY_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'error',
  unclear: 'primary',
};

const DOMAIN_LABELS: Record<string, string> = {
  customer: '客户库匹配',
  whitelist: '白名单',
  unmatched: '域名未匹配',
  missing_agent: '代理商缺邮箱',
};

const DOMAIN_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  customer: 'success',
  whitelist: 'primary',
  unmatched: 'error',
  missing_agent: 'warning',
};

export default function ApplicationList() {
  const navigate = useNavigate();
  const [list, setList] = useState<ApplicationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filters, setFilters] = useState({ status: '', serviceType: '', companyName: '' });
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    status: '',
    verifyStatus: '',
    domainMatch: '',
    serviceType: '',
    companyName: '',
    startDate: '',
    endDate: '',
  });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (exportFilters.status) params.set('status', exportFilters.status);
    if (exportFilters.verifyStatus) params.set('verifyStatus', exportFilters.verifyStatus);
    if (exportFilters.domainMatch) params.set('domainMatch', exportFilters.domainMatch);
    if (exportFilters.serviceType) params.set('serviceType', exportFilters.serviceType);
    if (exportFilters.companyName) params.set('companyName', exportFilters.companyName);
    if (exportFilters.startDate) params.set('startDate', exportFilters.startDate);
    if (exportFilters.endDate) params.set('endDate', exportFilters.endDate);
    window.open(`/api/applications/export?${params.toString()}`, '_blank');
    setExportOpen(false);
  };

  const fetchList = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('pageSize', String(rowsPerPage));
      if (filters.status) params.set('status', filters.status);
      if (filters.serviceType) params.set('serviceType', filters.serviceType);
      if (filters.companyName) params.set('companyName', filters.companyName);

      const res = await fetch(`/api/applications?${params}`);
      const data = await res.json();
      if (data.success) {
        setList(data.list);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('查询失败:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [page, rowsPerPage]);

  useEffect(() => {
    const timer = setInterval(() => fetchList(true), 5000);
    return () => clearInterval(timer);
  }, [page, rowsPerPage, filters]);

  const handleSearch = () => {
    setPage(0);
    fetchList();
  };

  const getEmailStatus = (item: ApplicationItem) => {
    if (item.email_total_count === 0) return { label: '未发送', color: 'default' as const };
    if (item.email_failed_count > 0 && item.email_sent_count > 0) return { label: '部分失败', color: 'warning' as const };
    if (item.email_failed_count > 0) return { label: '全部失败', color: 'error' as const };
    return { label: '已发送', color: 'success' as const };
  };

  const [monitors, setMonitors] = useState<{ name: string; healthy: boolean; staleMinutes: number | null }[]>([]);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/admin/health');
      const data = await res.json();
      if (data.success) setMonitors(data.monitors);
    } catch (error) {
      console.error('健康检查失败:', error);
    }
  };

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            管理后台 - 申请列表
          </Typography>
          <Button color="inherit" onClick={() => navigate('/admin/customers')}>
            客户名单
          </Button>
          <Button color="inherit" onClick={() => navigate('/admin/agents')} sx={{ ml: 1 }}>
            代理商
          </Button>
          <Button color="inherit" onClick={() => navigate('/admin/whitelist')} sx={{ ml: 1 }}>
            白名单
          </Button>
          <Button color="inherit" onClick={() => navigate('/')} sx={{ ml: 1 }}>
            返回申请页
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        <Paper sx={{ p: 2, mb: 2, bgcolor: monitors.some((m) => !m.healthy) ? '#fef3c7' : '#f0fdf4' }}>
          <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" sx={{ fontWeight: 700 }}>系统状态：</Typography>
            {monitors.length === 0 && <Typography variant="body2" color="text.secondary">检测中...</Typography>}
            {monitors.map((m) => (
              <Stack key={m.name} direction="row" spacing={1} alignItems="center">
                <Chip
                  label={m.healthy ? '正常' : '异常'}
                  color={m.healthy ? 'success' : 'error'}
                  size="small"
                />
                <Typography variant="body2">{m.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {m.staleMinutes === null ? '暂无记录' : `上次成功 ${m.staleMinutes} 分钟前`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              select
              label="状态"
              size="small"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="pending">待处理</MenuItem>
              <MenuItem value="processing">处理中</MenuItem>
              <MenuItem value="completed">已完成</MenuItem>
              <MenuItem value="rejected">已驳回</MenuItem>
            </TextField>

            <TextField
              select
              label="服务类型"
              size="small"
              value={filters.serviceType}
              onChange={(e) => setFilters({ ...filters, serviceType: e.target.value })}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="resetPassword">重置管理员密码</MenuItem>
              <MenuItem value="changeDomain">更改域名</MenuItem>
              <MenuItem value="bindMultiDomain">绑定多域名</MenuItem>
              <MenuItem value="bindDomainAlias">绑定域别名</MenuItem>
              <MenuItem value="unbindMultiDomain">解绑多域名</MenuItem>
              <MenuItem value="unbindDomainAlias">解绑域别名</MenuItem>
              <MenuItem value="changeCompanyName">更改公司名称</MenuItem>
              <MenuItem value="deleteOrgConfig">删除组织配置信息</MenuItem>
              <MenuItem value="unbind2FA">解绑二次验证</MenuItem>
            </TextField>

            <TextField
              label="客户名称"
              size="small"
              value={filters.companyName}
              onChange={(e) => setFilters({ ...filters, companyName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />

            <Button variant="contained" onClick={handleSearch} disabled={loading}>
              {loading ? '查询中...' : '搜索'}
            </Button>

            <Button
              variant="outlined"
              onClick={() => setExportOpen(true)}
            >
              导出 CSV
            </Button>
          </Stack>
        </Paper>

        <Dialog open={exportOpen} onClose={() => setExportOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>导出申请数据</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                select
                label="处理状态"
                size="small"
                value={exportFilters.status}
                onChange={(e) => setExportFilters({ ...exportFilters, status: e.target.value })}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="pending">待处理</MenuItem>
                <MenuItem value="processing">处理中</MenuItem>
                <MenuItem value="completed">已完成</MenuItem>
                <MenuItem value="rejected">已驳回</MenuItem>
              </TextField>
              <TextField
                select
                label="验证状态"
                size="small"
                value={exportFilters.verifyStatus}
                onChange={(e) => setExportFilters({ ...exportFilters, verifyStatus: e.target.value })}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="pending">待确认</MenuItem>
                <MenuItem value="confirmed">已确认</MenuItem>
                <MenuItem value="rejected">已拒绝</MenuItem>
                <MenuItem value="unclear">待人工</MenuItem>
              </TextField>
              <TextField
                select
                label="域名匹配"
                size="small"
                value={exportFilters.domainMatch}
                onChange={(e) => setExportFilters({ ...exportFilters, domainMatch: e.target.value })}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="customer">客户库匹配</MenuItem>
                <MenuItem value="whitelist">白名单</MenuItem>
                <MenuItem value="unmatched">域名未匹配</MenuItem>
                <MenuItem value="missing_agent">代理商缺邮箱</MenuItem>
              </TextField>
              <TextField
                select
                label="服务类型"
                size="small"
                value={exportFilters.serviceType}
                onChange={(e) => setExportFilters({ ...exportFilters, serviceType: e.target.value })}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="resetPassword">重置管理员密码</MenuItem>
                <MenuItem value="changeDomain">更改域名</MenuItem>
                <MenuItem value="bindMultiDomain">绑定多域名</MenuItem>
                <MenuItem value="bindDomainAlias">绑定域别名</MenuItem>
                <MenuItem value="unbindMultiDomain">解绑多域名</MenuItem>
                <MenuItem value="unbindDomainAlias">解绑域别名</MenuItem>
                <MenuItem value="changeCompanyName">更改公司名称</MenuItem>
                <MenuItem value="deleteOrgConfig">删除组织配置信息</MenuItem>
                <MenuItem value="unbind2FA">解绑二次验证</MenuItem>
              </TextField>
              <TextField
                label="客户名称"
                size="small"
                value={exportFilters.companyName}
                onChange={(e) => setExportFilters({ ...exportFilters, companyName: e.target.value })}
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="开始日期"
                  type="date"
                  size="small"
                  value={exportFilters.startDate}
                  onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="结束日期"
                  type="date"
                  size="small"
                  value={exportFilters.endDate}
                  onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setExportOpen(false)}>取消</Button>
            <Button variant="contained" onClick={handleExport}>导出 CSV</Button>
          </DialogActions>
        </Dialog>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell>申请编号</TableCell>
                <TableCell>服务类型</TableCell>
                <TableCell>客户名称</TableCell>
                <TableCell>域名匹配</TableCell>
                <TableCell>服务商邮箱</TableCell>
                <TableCell>验证状态</TableCell>
                <TableCell>邮件状态</TableCell>
                <TableCell>申请状态</TableCell>
                <TableCell>提交时间</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((item) => {
                const emailStatus = getEmailStatus(item);
                return (
                  <TableRow key={item.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{item.submit_id}</TableCell>
                    <TableCell>{item.service_name}</TableCell>
                    <TableCell>{item.company_name || '-'}</TableCell>
                    <TableCell>
                      {item.domain_match ? (
                        <Chip
                          label={DOMAIN_LABELS[item.domain_match] || item.domain_match}
                          color={DOMAIN_COLORS[item.domain_match] || 'default'}
                          size="small"
                        />
                      ) : '-'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {item.provider_email || '-'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={VERIFY_LABELS[item.verify_status] || '待确认'}
                        color={VERIFY_COLORS[item.verify_status] || 'warning'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={emailStatus.label} color={emailStatus.color} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[item.status] || item.status}
                        color={STATUS_COLORS[item.status] || 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{new Date(item.created_at).toLocaleString('zh-CN')}</TableCell>
                    <TableCell align="center">
                      <Button size="small" variant="outlined" onClick={() => navigate(`/admin/${item.id}`)}>
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                        <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
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
    </Box>
  );
}