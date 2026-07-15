import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import { getShorePositions } from '@/services/shore-position.service';
import { EMPLOYEE_ROLES } from '@/pages/EmployeeCardManagementPage';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import { getCompanyInfo } from '@/services/company-info.service';
import { buildPayrollLedgerWorkbook } from '@/utils/employee-payroll-ledger-export';
import type {
  EmployeeSalaryItem,
  EmployeeSalaryItemCategory,
  EmployeePayrollPeriod,
  EmployeePayrollPeriodSummary,
  EmployeePayslip,
  EmployeePayslipItem,
  EmployeePayslipWithDetails,
  PayrollEmployee,
  PayrollLedgerData,
  PayslipAcknowledgmentEntry,
} from '@/types/employee-salary';

const sumByCategory = (items: { category: EmployeeSalaryItemCategory; amount: number }[], category: EmployeeSalaryItemCategory) =>
  items.filter(i => i.category === category).reduce((sum, i) => sum + Number(i.amount), 0);

// --- 급여 대상 직원 ---

// 육상 직원(EMPLOYEE_ROLES) 전원을 직급 선임순 → 입사일순으로 정렬해 반환 —
// EmployeeCardManagementPage.tsx의 직원 목록 정렬과 동일한 기준.
export async function getPayrollEligibleEmployees(): Promise<PayrollEmployee[]> {
  const [{ data: users, error }, positions] = await Promise.all([
    supabase.from('users').select('id, name, role, position_id, hire_date').in('role', EMPLOYEE_ROLES),
    getShorePositions(),
  ]);
  if (error) { console.error(error); return []; }
  const positionById = new Map(positions.map(p => [p.id, p]));
  return (users || [])
    .map(u => ({ ...u, position_name: u.position_id ? positionById.get(u.position_id)?.name || null : null }))
    .sort((a, b) => {
      const posA = a.position_id ? positionById.get(a.position_id)?.display_order ?? Infinity : Infinity;
      const posB = b.position_id ? positionById.get(b.position_id)?.display_order ?? Infinity : Infinity;
      if (posA !== posB) return posA - posB;
      const hireA = a.hire_date ?? '9999-99-99';
      const hireB = b.hire_date ?? '9999-99-99';
      return hireA.localeCompare(hireB);
    });
}

// --- 급여 항목 (정보관리) ---

export async function getEmployeeSalaryItems(userId: string): Promise<EmployeeSalaryItem[]> {
  const { data, error } = await supabase
    .from('employee_salary_items')
    .select('*')
    .eq('user_id', userId)
    .order('category')
    .order('display_order');
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function addEmployeeSalaryItem(data: Omit<EmployeeSalaryItem, 'id' | 'created_at' | 'updated_at'>): Promise<EmployeeSalaryItem> {
  const now = new Date().toISOString();
  const { data: result, error } = await supabase.from('employee_salary_items').insert({ ...data, created_at: now, updated_at: now }).select().single();
  if (error) throw error;
  return result;
}

export async function updateEmployeeSalaryItem(id: string, data: Partial<Omit<EmployeeSalaryItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase.from('employee_salary_items').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteEmployeeSalaryItem(id: string): Promise<void> {
  const { error } = await supabase.from('employee_salary_items').delete().eq('id', id);
  if (error) throw error;
}

// --- 월별 지급 회차 ---

export async function getPayrollPeriods(): Promise<EmployeePayrollPeriodSummary[]> {
  const { data: periods, error } = await supabase.from('employee_payroll_periods').select('*').order('year_month', { ascending: false });
  if (error) { console.error(error); return []; }
  if (!periods || periods.length === 0) return [];

  const { data: payslips } = await supabase.from('employee_payslips').select('period_id, net_amount').in('period_id', periods.map(p => p.id));
  const summaryByPeriod = new Map<string, { count: number; total: number }>();
  for (const p of payslips || []) {
    const cur = summaryByPeriod.get(p.period_id) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(p.net_amount) || 0;
    summaryByPeriod.set(p.period_id, cur);
  }
  return periods.map(p => ({ ...p, payslip_count: summaryByPeriod.get(p.id)?.count || 0, total_net_amount: summaryByPeriod.get(p.id)?.total || 0 }));
}

export async function getPayrollPeriodByYearMonth(yearMonth: string): Promise<EmployeePayrollPeriod | null> {
  const { data, error } = await supabase.from('employee_payroll_periods').select('*').eq('year_month', yearMonth).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

export async function getOrCreatePayrollPeriod(yearMonth: string): Promise<EmployeePayrollPeriod> {
  const existing = await getPayrollPeriodByYearMonth(yearMonth);
  if (existing) return existing;
  const { data, error } = await supabase.from('employee_payroll_periods').insert({ year_month: yearMonth }).select().single();
  if (error) throw error;
  return data;
}

// 급여 지급(예정)일을 관리한다 — 지출결의서 자동 상신 시 "지출일" 필드로 쓰인다. 이미 명세서가
// 생성되어 있으면 각 명세서의 payment_date도 함께 맞추고, 이미 지출결의서가 상신된 회차라면
// 그 문서의 form_data.expense_date도 같이 갱신한다(금액 등 다른 필드는 건드리지 않음).
export async function updatePayrollPeriodPaymentDate(periodId: string, paymentDate: string | null): Promise<void> {
  const { data: period, error } = await supabase
    .from('employee_payroll_periods')
    .update({ payment_date: paymentDate, updated_at: new Date().toISOString() })
    .eq('id', periodId)
    .select()
    .single();
  if (error) throw error;

  const { error: payslipError } = await supabase
    .from('employee_payslips')
    .update({ payment_date: paymentDate, updated_at: new Date().toISOString() })
    .eq('period_id', periodId);
  if (payslipError) throw payslipError;

  if (period.approval_document_id) {
    const { data: doc } = await supabase.from('approval_documents').select('form_data').eq('id', period.approval_document_id).maybeSingle();
    if (doc) {
      const { error: docError } = await supabase
        .from('approval_documents')
        .update({ form_data: { ...(doc.form_data || {}), expense_date: paymentDate } })
        .eq('id', period.approval_document_id);
      if (docError) throw docError;
    }
  }
}

// 담당자가 급여 항목 입력/명세서 생성을 마쳤을 때 — 이후 항목은 잠기고, 각 직원이 본인
// 명세서를 확인(승인/이의제기)할 수 있는 단계로 넘어간다.
export async function requestEmployeeAcknowledgment(periodId: string): Promise<void> {
  const { count } = await supabase.from('employee_payslips').select('id', { count: 'exact', head: true }).eq('period_id', periodId);
  if (!count) throw new Error('먼저 명세서를 생성해주세요.');
  const { error } = await supabase
    .from('employee_payroll_periods')
    .update({ status: 'pending_ack', updated_at: new Date().toISOString() })
    .eq('id', periodId)
    .eq('status', 'draft');
  if (error) throw error;
}

// draft로 되돌린다 — 항목이 달라질 수 있으므로 그 기간의 모든 직원 확인 상태와 지출결의서
// 연결도 함께 초기화한다(지출결의서 문서 자체는 결재 이력으로 남기고 링크만 끊음).
export async function reopenPayrollPeriod(periodId: string): Promise<void> {
  const { error } = await supabase
    .from('employee_payroll_periods')
    .update({ status: 'draft', confirmed_at: null, confirmed_by: null, approval_document_id: null, updated_at: new Date().toISOString() })
    .eq('id', periodId);
  if (error) throw error;
  const { error: ackResetError } = await supabase
    .from('employee_payslips')
    .update({ ack_status: 'pending', ack_comment: null, ack_at: null, updated_at: new Date().toISOString() })
    .eq('period_id', periodId);
  if (ackResetError) throw ackResetError;
}

// --- 급여명세서 ---

// 이 기간에 아직 명세서가 없는 대상 직원마다, 현재 급여 항목(employee_salary_items)을
// 스냅샷으로 복사해 명세서를 생성한다. 이미 명세서가 있는 직원은 건너뛴다(중복 생성 방지).
export async function generatePayslipsForPeriod(periodId: string): Promise<{ created: number; skipped: number }> {
  const [{ data: period, error: periodError }, { data: existing, error: existingError }, employees] = await Promise.all([
    supabase.from('employee_payroll_periods').select('payment_date').eq('id', periodId).single(),
    supabase.from('employee_payslips').select('user_id').eq('period_id', periodId),
    getPayrollEligibleEmployees(),
  ]);
  if (periodError) throw periodError;
  if (existingError) throw existingError;
  const existingUserIds = new Set((existing || []).map(p => p.user_id));
  const targets = employees.filter(e => !existingUserIds.has(e.id));
  if (targets.length === 0) return { created: 0, skipped: employees.length };

  const { data: allItems, error: itemsError } = await supabase
    .from('employee_salary_items')
    .select('*')
    .in('user_id', targets.map(e => e.id))
    .eq('is_active', true)
    .order('display_order');
  if (itemsError) throw itemsError;
  const itemsByUser = new Map<string, EmployeeSalaryItem[]>();
  for (const item of allItems || []) {
    if (!itemsByUser.has(item.user_id)) itemsByUser.set(item.user_id, []);
    itemsByUser.get(item.user_id)!.push(item);
  }

  const now = new Date().toISOString();
  await Promise.all(targets.map(async emp => {
    const items = itemsByUser.get(emp.id) || [];
    const base = sumByCategory(items, 'base');
    const allowance = sumByCategory(items, 'allowance');
    const deduction = sumByCategory(items, 'deduction');
    const { data: payslip, error: payslipError } = await supabase
      .from('employee_payslips')
      .insert({
        period_id: periodId,
        user_id: emp.id,
        base_amount: base,
        total_allowance: allowance,
        total_deduction: deduction,
        net_amount: base + allowance - deduction,
        payment_date: period.payment_date,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (payslipError) throw payslipError;
    if (items.length > 0) {
      const { error: insertItemsError } = await supabase.from('employee_payslip_items').insert(
        items.map(i => ({ payslip_id: payslip.id, category: i.category, name: i.name, amount: i.amount, display_order: i.display_order }))
      );
      if (insertItemsError) throw insertItemsError;
    }
  }));

  return { created: targets.length, skipped: employees.length - targets.length };
}

// 주민등록번호 앞 7자리에서 생년월일을 계산한다 — 이 프로젝트에는 별도 생년월일 필드가 없고
// 직원 카드 관리에서 입력하는 주민등록번호가 유일한 출처다.
function birthDateFromRrn(rrn: string | null | undefined): string | null {
  if (!rrn) return null;
  const digits = rrn.replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;
  const century = ['9', '0'].includes(digits[6]) ? 1800 : ['1', '2'].includes(digits[6]) ? 1900 : 2000;
  const year = century + Number(digits.slice(0, 2));
  const month = digits.slice(2, 4);
  const day = digits.slice(4, 6);
  return `${year}-${month}-${day}`;
}

async function attachEmployeeDetails(payslips: EmployeePayslip[], items: EmployeePayslipItem[]): Promise<EmployeePayslipWithDetails[]> {
  if (payslips.length === 0) return [];
  const userIds = [...new Set(payslips.map(p => p.user_id))];
  const [{ data: users }, positions] = await Promise.all([
    supabase.from('users').select('id, name, position_id, hire_date, resident_registration_number').in('id', userIds),
    getShorePositions(),
  ]);
  const positionById = new Map(positions.map(p => [p.id, p]));
  const userById = new Map((users || []).map(u => [u.id, u]));
  const itemsByPayslip = new Map<string, EmployeePayslipItem[]>();
  for (const item of items) {
    if (!itemsByPayslip.has(item.payslip_id)) itemsByPayslip.set(item.payslip_id, []);
    itemsByPayslip.get(item.payslip_id)!.push(item);
  }
  // 직급 선임순 → 입사일순 정렬 — 이 프로젝트 전반의 직원 목록 정렬 관례와 동일하게 맞춘다.
  return payslips
    .map(p => {
      const u = userById.get(p.user_id);
      const position = u?.position_id ? positionById.get(u.position_id) : undefined;
      return {
        ...p,
        employee_name: u?.name || '알 수 없음',
        employee_position_name: position?.name || null,
        employee_hire_date: u?.hire_date || null,
        employee_birth_date: birthDateFromRrn(u?.resident_registration_number),
        _positionOrder: position?.display_order ?? Infinity,
        _hireDate: u?.hire_date ?? '9999-99-99',
        items: itemsByPayslip.get(p.id) || [],
      };
    })
    .sort((a, b) => {
      if (a._positionOrder !== b._positionOrder) return a._positionOrder - b._positionOrder;
      return a._hireDate.localeCompare(b._hireDate);
    })
    .map(({ _positionOrder, _hireDate, ...rest }) => rest);
}

export async function getPayslipsForPeriod(periodId: string): Promise<EmployeePayslipWithDetails[]> {
  const { data: payslips, error } = await supabase.from('employee_payslips').select('*').eq('period_id', periodId).order('created_at');
  if (error) { console.error(error); return []; }
  if (!payslips || payslips.length === 0) return [];
  const { data: items, error: itemsError } = await supabase
    .from('employee_payslip_items')
    .select('*')
    .in('payslip_id', payslips.map(p => p.id))
    .order('display_order');
  if (itemsError) { console.error(itemsError); return attachEmployeeDetails(payslips, []); }
  return attachEmployeeDetails(payslips, items || []);
}

export async function getPayslipDetail(payslipId: string): Promise<EmployeePayslipWithDetails | null> {
  const { data: payslip, error } = await supabase.from('employee_payslips').select('*').eq('id', payslipId).maybeSingle();
  if (error) { console.error(error); return null; }
  if (!payslip) return null;
  const { data: items, error: itemsError } = await supabase.from('employee_payslip_items').select('*').eq('payslip_id', payslipId).order('display_order');
  if (itemsError) { console.error(itemsError); return null; }
  const [detail] = await attachEmployeeDetails([payslip], items || []);
  return detail || null;
}

// "내 급여명세서" 페이지용 — 담당자가 직원 확인을 요청한(draft를 벗어난) 명세서만 보인다.
export async function getMyPayslips(userId: string): Promise<EmployeePayslipWithDetails[]> {
  const { data: payslips, error } = await supabase.from('employee_payslips').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  if (!payslips || payslips.length === 0) return [];

  const periodIds = [...new Set(payslips.map(p => p.period_id))];
  const { data: periods } = await supabase.from('employee_payroll_periods').select('id, year_month, status').in('id', periodIds);
  const periodById = new Map((periods || []).map(p => [p.id, p]));
  const visible = payslips.filter(p => periodById.get(p.period_id)?.status !== 'draft');
  if (visible.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from('employee_payslip_items')
    .select('*')
    .in('payslip_id', visible.map(p => p.id))
    .order('display_order');
  if (itemsError) { console.error(itemsError); return []; }

  const details = await attachEmployeeDetails(visible, items || []);
  return details.map(d => {
    const period = periodById.get(d.period_id);
    return { ...d, period_year_month: period?.year_month, period_status: period?.status };
  });
}

// "내 급여명세서" 메뉴/대시보드 배지용 — draft 회차는 아직 직원에게 노출되지 않으므로 제외한다.
export async function getMyPendingPayslipCount(userId: string): Promise<number> {
  const { data: periods, error: periodsError } = await supabase.from('employee_payroll_periods').select('id').neq('status', 'draft');
  if (periodsError) { console.error(periodsError); return 0; }
  const periodIds = (periods || []).map(p => p.id);
  if (periodIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('employee_payslips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('ack_status', 'pending')
    .in('period_id', periodIds);
  if (error) { console.error(error); return 0; }
  return count || 0;
}

// 직원 본인이 명세서를 승인하거나 이의를 제기한다 — 이의제기도 "확인 완료"로 취급되어
// 담당자의 지출결의서 상신을 막지 않는다(담당자에게 사유가 보일 뿐).
export async function acknowledgePayslip(payslipId: string, status: 'approved' | 'disputed', comment?: string): Promise<void> {
  const { error } = await supabase
    .from('employee_payslips')
    .update({ ack_status: status, ack_comment: comment || null, ack_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', payslipId);
  if (error) throw error;
}

// draft 상태인 기간에서만 화면에서 호출되어야 한다 — 전량 delete-then-insert 후 합계를 다시 계산한다.
export async function updatePayslipItems(
  payslipId: string,
  items: { category: EmployeeSalaryItemCategory; name: string; amount: number; display_order: number }[]
): Promise<void> {
  const { error: deleteError } = await supabase.from('employee_payslip_items').delete().eq('payslip_id', payslipId);
  if (deleteError) throw deleteError;
  if (items.length > 0) {
    const { error: insertError } = await supabase.from('employee_payslip_items').insert(items.map(i => ({ ...i, payslip_id: payslipId })));
    if (insertError) throw insertError;
  }
  const base = sumByCategory(items, 'base');
  const allowance = sumByCategory(items, 'allowance');
  const deduction = sumByCategory(items, 'deduction');
  const { error: updateError } = await supabase
    .from('employee_payslips')
    .update({ base_amount: base, total_allowance: allowance, total_deduction: deduction, net_amount: base + allowance - deduction, updated_at: new Date().toISOString() })
    .eq('id', payslipId);
  if (updateError) throw updateError;
}

// draft 기간에서 특정 직원의 명세서를 제외 — 이후 "명세서 생성"을 다시 누르면 그 직원만 재생성된다.
export async function deletePayslip(payslipId: string): Promise<void> {
  const { error } = await supabase.from('employee_payslips').delete().eq('id', payslipId);
  if (error) throw error;
}

// --- 급여대장 (전체 직원 표) ---

// 인쇄/엑셀 출력용 — 기본급 옆에 수당/공제 항목을 열로 펼친 표 데이터를 만든다. 항목명은
// 직원마다 직접 입력한 값이라, 그 회차 안에서 실제로 쓰인 이름들의 합집합을 컬럼으로 쓴다.
export async function getPayrollLedgerForPeriod(periodId: string): Promise<PayrollLedgerData | null> {
  const { data: period, error: periodError } = await supabase.from('employee_payroll_periods').select('*').eq('id', periodId).maybeSingle();
  if (periodError) { console.error(periodError); return null; }
  if (!period) return null;

  const payslips = await getPayslipsForPeriod(periodId);
  const { data: users } = await supabase
    .from('users')
    .select('id, resident_registration_number, hire_date')
    .in('id', payslips.map(p => p.user_id));
  const userById = new Map((users || []).map(u => [u.id, u]));

  const allowanceColumns: string[] = [];
  const deductionColumns: string[] = [];
  for (const p of payslips) {
    for (const item of p.items) {
      if (item.category === 'allowance' && !allowanceColumns.includes(item.name)) allowanceColumns.push(item.name);
      if (item.category === 'deduction' && !deductionColumns.includes(item.name)) deductionColumns.push(item.name);
    }
  }

  const rows = payslips.map(p => {
    const u = userById.get(p.user_id);
    const allowanceByName: Record<string, number> = {};
    const deductionByName: Record<string, number> = {};
    for (const item of p.items) {
      if (item.category === 'allowance') allowanceByName[item.name] = (allowanceByName[item.name] || 0) + item.amount;
      if (item.category === 'deduction') deductionByName[item.name] = (deductionByName[item.name] || 0) + item.amount;
    }
    return {
      employee_id: p.user_id,
      employee_name: p.employee_name,
      resident_registration_number: u?.resident_registration_number || null,
      hire_date: u?.hire_date || null,
      base_amount: p.base_amount,
      allowance_by_name: allowanceByName,
      gross_amount: p.base_amount + p.total_allowance,
      deduction_by_name: deductionByName,
      total_deduction: p.total_deduction,
      net_amount: p.net_amount,
    };
  });

  return { period, allowance_columns: allowanceColumns, deduction_columns: deductionColumns, rows };
}

// --- 직원 확인 / 지출결의서 결재 상신 ---

export async function getAcknowledgmentStatus(periodId: string): Promise<PayslipAcknowledgmentEntry[]> {
  const payslips = await getPayslipsForPeriod(periodId);
  return payslips.map(p => ({
    payslip_id: p.id,
    employee_id: p.user_id,
    employee_name: p.employee_name,
    employee_position_name: p.employee_position_name,
    ack_status: p.ack_status,
    ack_comment: p.ack_comment,
    ack_at: p.ack_at,
  }));
}

// 전 직원 확인이 끝난 급여대장을 지출결의서로 결재 상신한다 — 급여대장 엑셀을 첨부로 붙여
// 결재자가 상세 내역을 바로 열람할 수 있게 하고, 결재선은 상신자의 조직도 기준으로 자동
// 계산된다(기안서 작성 화면의 previewChain과 동일한 기준, createDocument 내부에서 처리).
export async function submitPayrollExpenseReport(periodId: string, submittedByUserId: string): Promise<void> {
  const { data: period, error: periodError } = await supabase.from('employee_payroll_periods').select('*').eq('id', periodId).single();
  if (periodError) throw periodError;
  if (period.status !== 'pending_ack') throw new Error('직원 확인 단계의 회차만 상신할 수 있습니다.');
  if (!period.payment_date) throw new Error('먼저 급여 지급(예정)일을 설정해주세요.');

  const payslips = await getPayslipsForPeriod(periodId);
  if (payslips.length === 0) throw new Error('명세서가 없습니다.');
  if (payslips.some(p => p.ack_status === 'pending')) throw new Error('아직 확인하지 않은 직원이 있습니다.');

  const ledger = await getPayrollLedgerForPeriod(periodId);
  if (!ledger) throw new Error('급여대장을 만들 수 없습니다.');

  const [{ data: docType, error: docTypeError }, company, members] = await Promise.all([
    supabase.from('approval_document_types').select('id').eq('code', 'expense_report').maybeSingle(),
    getCompanyInfo().catch(() => null),
    orgChartService.getOrgMembers(),
  ]);
  if (docTypeError) throw docTypeError;
  if (!docType) throw new Error('지출결의서 문서유형을 찾을 수 없습니다. 문서유형 관리에서 확인해주세요.');

  const submitter = members.find(m => m.id === submittedByUserId);
  const orgUnitId = submitter?.org_unit_ids?.[0];
  if (!orgUnitId) throw new Error('소속 부서가 없어 결재라인을 구성할 수 없습니다.');

  const totalGross = ledger.rows.reduce((s, r) => s + r.gross_amount, 0);
  const totalDeduction = ledger.rows.reduce((s, r) => s + r.total_deduction, 0);
  const totalNet = ledger.rows.reduce((s, r) => s + r.net_amount, 0);
  const content = [
    `${period.year_month} 급여 지출결의서`,
    `대상 인원: ${ledger.rows.length}명`,
    `급여 합계: ${totalGross.toLocaleString('ko-KR')}원`,
    `공제 합계: ${totalDeduction.toLocaleString('ko-KR')}원`,
    `실지급액 합계: ${totalNet.toLocaleString('ko-KR')}원`,
    '',
    '상세 내역은 첨부된 급여대장을 참고해주세요.',
  ].join('\n');

  const workbook = buildPayrollLedgerWorkbook(ledger, company?.name || '');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const path = `approval-documents/${Date.now()}_${Math.random().toString(36).substring(7)}.xlsx`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, blob);
  if (uploadError) throw uploadError;

  const doc = await approvalDocumentService.createDocument({
    document_type_id: docType.id,
    title: `${period.year_month} 급여 지출결의서`,
    content,
    form_data: {
      expense_date: period.payment_date,
      expense_category: '급여',
      purpose: `${period.year_month} 급여 지급 (${ledger.rows.length}명)`,
      amount: totalGross,
      vendor: '임직원 급여계좌 일괄이체',
      notes: content,
    },
    attachments: [{ name: `${period.year_month}_급여대장.xlsx`, path, size: blob.size, type: blob.type }],
    org_unit_id: orgUnitId,
    created_by: submittedByUserId,
    reference_type: 'employee_payroll_period',
    reference_id: periodId,
  });

  const { error: updateError } = await supabase
    .from('employee_payroll_periods')
    .update({ status: 'pending_approval', approval_document_id: doc.id, updated_at: new Date().toISOString() })
    .eq('id', periodId);
  if (updateError) throw updateError;
}
