import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Container, Paper, Button, Grid,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  MenuItem, TextField, Link, Divider, CircularProgress, Alert, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';

interface EmailLog {
  id: number;
  recipient_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  preview_url: string | null;
  message_id: string | null;
  error_message: string | null;
  sent_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  rejected: '已驳回',
};

const RECIPIENT_LABELS: Record<string, string> = {
  service_provider: '服务商',
  support_team: '售后团队',
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({ recipientType: '', logStatus: '' });

  const handleEmailExport = () => {
    const params = new URLSearchParams();
    if (exportFilters.recipientType) params.set('recipientType', exportFilters.recipientType);
    if (exportFilters.logStatus) params.set('logStatus', exportFilters.logStatus);
    window.open(`/api/applications/${id}/emails/export?${params.toString()}`, '_blank');
    setExportOpen(false);
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [appRes, emailRes] = await Promise.all([
        fetch(`/api/applications/${id}`),
        fetch(`/api/applications/${id}/emails`),
      ]);
      const appData = await appRes.json();
      const emailData = await emailRes.json();

      if (appData.success) setData(appData.data);
      if (emailData.success) setEmailLogs(emailData.list);
    } catch (error) {
      console.error('查询失败:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(timer);
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    setStatusUpdating(true);
    try {
      await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchData();
    } catch (error) {
      console.error('更新失败:', error);
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">申请不存在</Alert>
        <Button sx={{ mt: 2 }} variant="outlined" onClick={() => navigate('/admin')}>
          返回列表
        </Button>
      </Box>
    );
  }

  const formData = typeof data.form_data === 'string' ? JSON.parse(data.form_data) : data.form_data;
  const verifyData = typeof data.verify_data === 'string' ? JSON.parse(data.verify_data) : data.verify_data;

  const checkCompleteness = () => {
    const missing: string[] = [];
    if (!formData.companyName) missing.push('公司名称');
    if (!verifyData.contactPerson) missing.push('申请人姓名');
    if (!verifyData.contactEmail) missing.push('申请人邮箱');
    if (!data.business_license_path && !data.identity_card_path) missing.push('营业执照/身份证');
    if (data.service_type === 'resetPassword' && !formData.receive_email) missing.push('新密码接收邮箱');
    return missing;
  };

  const missingFields = checkCompleteness();
  const licenseFilename = data.business_license_path
    ? data.business_license_path.split(/[/\\]/).pop()
    : null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="static" sx={{ bgcolor: '#1e3a5f' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            申请详情
          </Typography>
          <Button color="inherit" onClick={() => navigate('/admin')}>
            返回列表
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>申请信息</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">申请编号</Typography>
                  <Typography sx={{ fontFamily: 'monospace' }}>{data.submit_id}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">服务类型</Typography>
                  <Typography>{data.service_name}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">客户名称</Typography>
                  <Typography>{data.company_name || '-'}</Typography>
                </Grid>
                {data.sub_domains && data.sub_domains.length > 0 && (
                  <Grid item xs={12} sm={6}>
                    <Typography color="text.secondary" variant="body2">新增副域名</Typography>
                    <Typography>{Array.isArray(data.sub_domains) ? data.sub_domains.join('、') : data.sub_domains}</Typography>
                  </Grid>
                )}
                {data.alias_domains && data.alias_domains.length > 0 && (
                  <Grid item xs={12} sm={6}>
                    <Typography color="text.secondary" variant="body2">新增域别名</Typography>
                    <Typography>{Array.isArray(data.alias_domains) ? data.alias_domains.join('、') : data.alias_domains}</Typography>
                  </Grid>
                )}
                {data.old_name && (
                  <Grid item xs={12} sm={6}>
                    <Typography color="text.secondary" variant="body2">原组织名称</Typography>
                    <Typography>{data.old_name}</Typography>
                  </Grid>
                )}
                {data.new_name && (
                  <Grid item xs={12} sm={6}>
                    <Typography color="text.secondary" variant="body2">新组织名称</Typography>
                    <Typography>{data.new_name}</Typography>
                  </Grid>
                )}
                {data.receive_email && (
                  <Grid item xs={12} sm={6}>
                    <Typography color="text.secondary" variant="body2">新密码接收邮箱</Typography>
                    <Typography>{data.receive_email}</Typography>
                  </Grid>
                )}
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">提交时间</Typography>
                  <Typography>{new Date(data.created_at).toLocaleString('zh-CN')}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>表单字段</Typography>
              <Grid container spacing={2}>
                {Object.entries(formData)
                  .filter(([k]) => {
                    if (k === 'serviceType' || k === 'customerDomain') return false;
                    if (['applyReason', 'additionalInfo', 'applicant_name', 'applicant_email'].includes(k)) return false;
                    return true;
                  })
                  .map(([key, value]) => (
                    <Grid item xs={12} sm={6} key={key}>
                      <Typography color="text.secondary" variant="body2">{key}</Typography>
                      <Typography>{String(value || '-')}</Typography>
                    </Grid>
                  ))}
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>信息完整度检查</Typography>
              {missingFields.length === 0 ? (
                <Alert severity="success">所有必填信息完整</Alert>
              ) : (
                <Alert severity="warning">
                  缺少：{missingFields.join('、')}
                </Alert>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>身份验证信息</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">申请人姓名</Typography>
                  <Typography>{verifyData.contactPerson || '-'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">申请人邮箱</Typography>
                  <Typography>{verifyData.contactEmail || '-'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">申请书</Typography>
                  {data.application_form_name && data.application_form_path ? (
                    <Link href={`/api/uploads/${data.application_form_path.split(/[/\\]/).pop()}`} target="_blank" rel="noopener">
                      {data.application_form_name}
                    </Link>
                  ) : (
                    <Typography>-</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">免责声明</Typography>
                  {data.disclaimer_name && data.disclaimer_path ? (
                    <Link href={`/api/uploads/${data.disclaimer_path.split(/[/\\]/).pop()}`} target="_blank" rel="noopener">
                      {data.disclaimer_name}
                    </Link>
                  ) : (
                    <Typography>-</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="body2">营业执照</Typography>
                  {licenseFilename ? (
                    <Link href={`/api/uploads/${licenseFilename}`} target="_blank" rel="noopener">
                      {data.business_license_name || '下载'}
                    </Link>
                  ) : (
                    <Typography>-</Typography>
                  )}
                </Grid>
                {data.identity_card_path && (
                  <Grid item xs={12} sm={6}>
                    <Typography color="text.secondary" variant="body2">身份证复印件</Typography>
                    <Link href={`/api/uploads/${data.identity_card_path.split(/[/\\]/).pop()}`} target="_blank" rel="noopener">
                      {data.identity_card_name}
                    </Link>
                  </Grid>
                )}
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>身份验证状态</Typography>
              <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography>验证状态：</Typography>
                  <Chip
                    label={data.verify_status === 'confirmed' ? '已确认' : data.verify_status === 'rejected' ? '已拒绝' : data.verify_status === 'unclear' ? '待人工' : '待确认'}
                    color={data.verify_status === 'confirmed' ? 'success' : data.verify_status === 'rejected' ? 'error' : data.verify_status === 'unclear' ? 'primary' : 'warning'}
                  />
                </Stack>
                {data.verified_at && (
                  <Typography variant="body2" color="text.secondary">
                    验证时间：{new Date(data.verified_at).toLocaleString('zh-CN')}
                  </Typography>
                )}
                {data.verify_status === 'unclear' && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={async () => {
                        await fetch(`/api/applications/${id}/verify`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ verify_status: 'confirmed' }),
                        });
                        fetchData();
                      }}
                    >
                      人工确认
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      onClick={async () => {
                        await fetch(`/api/applications/${id}/verify`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ verify_status: 'rejected' }),
                        });
                        fetchData();
                      }}
                    >
                      人工拒绝
                    </Button>
                  </Stack>
                )}
              </Stack>
              {data.verify_reply_text && (
                <Box sx={{ mt: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>服务商回复内容：</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{data.verify_reply_text}</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>邮件发送日志</Typography>
                <Button size="small" variant="outlined" onClick={() => setExportOpen(true)}>
                  导出 CSV
                </Button>
              </Stack>

              <Dialog open={exportOpen} onClose={() => setExportOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>导出邮件日志</DialogTitle>
                <DialogContent>
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                      select
                      label="收件人类型"
                      size="small"
                      value={exportFilters.recipientType}
                      onChange={(e) => setExportFilters({ ...exportFilters, recipientType: e.target.value })}
                    >
                      <MenuItem value="">全部</MenuItem>
                      <MenuItem value="service_provider">服务商</MenuItem>
                      <MenuItem value="support_team">售后团队</MenuItem>
                    </TextField>
                    <TextField
                      select
                      label="发送状态"
                      size="small"
                      value={exportFilters.logStatus}
                      onChange={(e) => setExportFilters({ ...exportFilters, logStatus: e.target.value })}
                    >
                      <MenuItem value="">全部</MenuItem>
                      <MenuItem value="sent">已发送</MenuItem>
                      <MenuItem value="failed">失败</MenuItem>
                    </TextField>
                  </Stack>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setExportOpen(false)}>取消</Button>
                  <Button variant="contained" onClick={handleEmailExport}>导出 CSV</Button>
                </DialogActions>
              </Dialog>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                      <TableCell>收件人类型</TableCell>
                      <TableCell>收件邮箱</TableCell>
                      <TableCell>邮件主题</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>发送时间</TableCell>
                      <TableCell>预览</TableCell>
                      <TableCell>错误信息</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {emailLogs.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell>{RECIPIENT_LABELS[log.recipient_type] || log.recipient_type}</TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{log.recipient_email}</TableCell>
                        <TableCell sx={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.subject}</TableCell>
                        <TableCell>
                          <Chip
                            label={log.status === 'sent' ? '已发送' : '失败'}
                            color={log.status === 'sent' ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{new Date(log.sent_at).toLocaleString('zh-CN')}</TableCell>
                        <TableCell>
                          {log.preview_url ? (
                            <Link href={log.preview_url} target="_blank" rel="noopener">
                              查看邮件
                            </Link>
                          ) : '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: 13, color: 'error.main', maxWidth: 200 }}>
                          {log.error_message || '-'}
                        </TableCell>
                        <TableCell align="center">
                          {log.status === 'failed' && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              onClick={async () => {
                                const resp = await fetch(`/api/applications/${id}/emails/${log.id}/resend`, {
                                  method: 'POST',
                                });
                                const result = await resp.json();
                                alert(result.message || (result.error || '操作完成'));
                                fetchData();
                              }}
                            >
                              重发
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {emailLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 3 }}>暂无邮件日志</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>状态管理</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography>当前状态：</Typography>
                <Chip
                  label={STATUS_LABELS[data.status] || data.status}
                  color={data.status === 'completed' ? 'success' : data.status === 'rejected' ? 'error' : data.status === 'processing' ? 'primary' : 'default'}
                />
                <TextField
                  select
                  size="small"
                  label="切换状态"
                  value=""
                  onChange={(e) => e.target.value && handleStatusChange(e.target.value)}
                  sx={{ minWidth: 150 }}
                  disabled={statusUpdating}
                >
                  <MenuItem value="pending">待处理</MenuItem>
                  <MenuItem value="processing">处理中</MenuItem>
                  <MenuItem value="completed">已完成</MenuItem>
                  <MenuItem value="rejected">已驳回</MenuItem>
                </TextField>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}