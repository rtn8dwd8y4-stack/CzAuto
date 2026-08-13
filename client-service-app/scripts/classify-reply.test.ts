import { test } from 'node:test';
import assert from 'node:assert';
import { classifyReply } from '../src/server/emailMonitor';

function check(input: string, expected: string): void {
  const r = classifyReply(input);
  assert.strictEqual(r.status, expected, `"${input}" -> ${r.status} (期望 ${expected}) | ${r.detail}`);
}

// ============ 1. 强拒绝 ============
test('1. 强拒绝：出现"拒绝"直接 rejected', () => {
  check('我拒绝', 'rejected');
  check('拒绝此申请', 'rejected');
  check('我们拒绝通过', 'rejected');
});

// ============ 2. 单纯确认 ============
test('2. 单纯确认', () => {
  check('身份已确认', 'confirmed');
  check('资料予以确认', 'confirmed');
  check('核实无误', 'confirmed');
  check('验证通过', 'confirmed');
  check('同意该申请', 'confirmed');
  check('是我们的客户', 'confirmed');
  check('情况属实', 'confirmed');
  check('信息已确认', 'confirmed');
});

// ============ 3. 单纯拒绝 ============
test('3. 单纯拒绝', () => {
  check('不确认', 'rejected');
  check('不能通过', 'rejected');
  check('不予同意', 'rejected');
  check('无法确认', 'rejected');
  check('身份不符', 'rejected');
  check('查无此人', 'rejected');
  check('非我们客户', 'rejected');
  check('信息有误', 'rejected');
  check('资料不完整', 'rejected');
});

// ============ 4. 同时命中（最后位置仲裁）============
test('4. 冲突仲裁：最后命中位置决定', () => {
  check('我不确认，但情况属实', 'confirmed');
  check('情况属实，但我不确认', 'rejected');
});

// ============ 5. 否定词邻近检测（3字符内）============
test('5. 否定词邻近检测', () => {
  check('不打算确认', 'rejected');
  check('暂时无法通过', 'rejected');
  check('尚未核实', 'rejected');
  check('不同意该申请', 'rejected');
  check('并不是我们的客户', 'rejected');
});

// ============ 6. 模板噪声剔除 ============
test('6. 模板噪声剔除', () => {
  check('请确认。情况属实，同意通过', 'confirmed');
  check('请确认', 'unclear');
  check('请核实以上信息是否与您记录的客户信息一致', 'unclear');
  check('回复邮件确认客户身份', 'unclear');
});

// ============ 7. 边界陷阱 ============
test('7. 边界陷阱', () => {
  check('通过不了，需要修改', 'rejected');
  check('你确认吗？', 'unclear');
  check('我不拒绝，但也不确认', 'unclear');
});

// ============ 8. 真实邮件场景 ============
test('8. 真实邮件场景', () => {
  // 确认场景：服务商回复带引用原文 + 明确确认
  check(
    '> 客户身份验证请求\n> 申请编号：RHF-20260812-0001\n> 请确认\n\n我们核实过了，情况属实，确认是贵司客户。',
    'confirmed'
  );
  // 拒绝场景
  check(
    '> 客户身份验证请求\n> 申请编号：RHF-20260812-0002\n\n经查，该客户信息有误，非我方客户，无法确认。',
    'rejected'
  );
  // 无关邮件（转发的业务邮件，无关键词）
  check('关于域名续费事宜，请查收附件报价单。', 'unclear');
});
