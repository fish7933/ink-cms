import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import { getShorePositions } from '@/services/shore-position.service';
import { getHolidayDateSet } from '@/services/holiday.service';
import { EMPLOYEE_ROLES } from '@/pages/EmployeeCardManagementPage';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import { getCompanyInfo } from '@/services/company-info.service';
import { buildPayrollLedgerWorkbook } from '@/utils/employee-payroll-ledger-export';
import type {
  EmployeeSalaryItem,
  EmployeeSalaryItemCategory,
  EmployeeSalaryItemPayGroup,
  EmployeeSalaryItemCatalogEntry,
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

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// --- 급여 대상 직원 ---

// 육상 직원(EMPLOYEE_ROLES) 전원을 직급 선임순 → 입사일순으로 정렬해 반환 —
// EmployeeCardManagementPage.tsx의 직원 목록 정렬과 동일한 기준.
// excludeResignedBefore: 이 날짜보다 앞서 퇴사한 직원은 제외한다. 지정하지 않으면 내일(=오늘까지
// 퇴사한 사람은 제외, 아직 재직 중인 사람만) 기준 — 급여회차 생성 시에는 그 달 1일을 넘겨서
// "이번 달 중 퇴사한 사람도 마지막 급여는 받아야 하니 포함"시킨다(generatePayslipsForPeriod 참고).
export async function getPayrollEligibleEmployees(excludeResignedBefore?: string): Promise<PayrollEmployee[]> {
  const cutoff = excludeResignedBefore ?? (() => {
    const d = new Date(todayIso()); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [{ data: users, error }, positions] = await Promise.all([
    supabase.from('users').select('id, name, role, position_id, hire_date, resignation_date, salary_bank_name, salary_bank_account').in('role', EMPLOYEE_ROLES),
    getShorePositions(),
  ]);
  if (error) { console.error(error); return []; }
  const positionById = new Map(positions.map(p => [p.id, p]));
  return (users || [])
    .filter(u => !u.resignation_date || u.resignation_date >= cutoff)
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

// 해당 급여월(yearMonth, 'YYYY-MM') 안에서 hire_date(입사)~resignation_date(퇴사) 구간이
// 그 달의 며칠에 걸쳐 있는지로 일할계산 비율을 구한다. 입/퇴사가 그 달 안에 없으면 1(전액).
function monthProration(yearMonth: string, hireDate: string | null, resignationDate: string | null): { factor: number; note: string | null } {
  const [y, m] = yearMonth.split('-').map(Number);
  const totalDays = new Date(y, m, 0).getDate();
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(totalDays).padStart(2, '0')}`;
  const effectiveStart = hireDate && hireDate > monthStart ? hireDate : monthStart;
  const effectiveEnd = resignationDate && resignationDate < monthEnd ? resignationDate : monthEnd;
  if (effectiveStart > effectiveEnd) return { factor: 0, note: '퇴사일이 입사일보다 앞서 이번 달 근무 일수가 없습니다.' };
  if (effectiveStart === monthStart && effectiveEnd === monthEnd) return { factor: 1, note: null };
  const workedDays = Math.round((new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 86400000) + 1;
  const factor = Math.min(1, Math.max(0, workedDays / totalDays));
  const reason = effectiveStart !== monthStart && effectiveEnd !== monthEnd
    ? `입사일(${hireDate})과 퇴사일(${resignationDate})`
    : effectiveStart !== monthStart ? `입사일(${hireDate})` : `퇴사일(${resignationDate})`;
  return { factor, note: `${reason} 기준 ${yearMonth} 근무일 ${workedDays}/${totalDays}일 → 일할계산 ${(factor * 100).toFixed(1)}% 적용` };
}

// 직원별 급여표에서 급여 지급계좌를 저장 — 지출결의서 항목 상신 시 적요("이름 (은행 계좌번호)")
// 자동 생성에 쓰인다(submitPayrollExpenseReport).
export async function updateEmployeeSalaryBankAccount(userId: string, data: { salary_bank_name: string | null; salary_bank_account: string | null }): Promise<void> {
  const { error } = await supabase.from('users').update(data).eq('id', userId);
  if (error) throw error;
}

// --- 급여 항목 카탈로그 (회사 공통) ---
// 직원마다 항목명을 자유 입력하던 방식 대신, 여기서 관리하는 공통 목록을 각 직원의
// 급여표에서 골라 쓴다. src/lib/salary-store.ts의 salary_components(선원 급여) CRUD와
// 동일한 패턴 — 삭제는 항상 소프트 삭제(is_active=false)로, 이미 배정된 직원 항목은
// catalog_id가 남아있어도 그대로 동작한다(목록/선택 드롭다운에서만 사라짐).

export async function getSalaryItemCatalog(): Promise<EmployeeSalaryItemCatalogEntry[]> {
  const { data, error } = await supabase
    .from('employee_salary_item_catalog')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('display_order');
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function addSalaryItemCatalogEntry(data: Omit<EmployeeSalaryItemCatalogEntry, 'id' | 'created_at' | 'updated_at'>): Promise<EmployeeSalaryItemCatalogEntry> {
  const now = new Date().toISOString();
  const { data: result, error } = await supabase.from('employee_salary_item_catalog').insert({ ...data, created_at: now, updated_at: now }).select().single();
  if (error) throw error;
  return result;
}

export async function updateSalaryItemCatalogEntry(id: string, data: Partial<Pick<EmployeeSalaryItemCatalogEntry, 'name' | 'pay_group' | 'display_order'>>): Promise<void> {
  const { error } = await supabase.from('employee_salary_item_catalog').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deactivateSalaryItemCatalogEntry(id: string): Promise<void> {
  const { error } = await supabase.from('employee_salary_item_catalog').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
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

// 지급(예정)일 기본값 = 차월 15일 — 주말/공휴일이면 그 이전 평일로 당긴다("매월 15일 지급"
// 기준, 해당 월분을 정산해 다음 달 15일에 지급하는 통상적인 급여 규정을 따른다).
async function calcDefaultPaymentDate(yearMonth: string): Promise<string> {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year, month, 15); // month는 1-based 값이라 그대로 넘기면 Date 생성자 기준 차월이 된다.
  const holidays = await getHolidayDateSet();
  const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  while (date.getDay() === 0 || date.getDay() === 6 || holidays.has(toStr(date))) {
    date.setDate(date.getDate() - 1);
  }
  return toStr(date);
}

export async function getOrCreatePayrollPeriod(yearMonth: string): Promise<EmployeePayrollPeriod> {
  const existing = await getPayrollPeriodByYearMonth(yearMonth);
  if (existing) return existing;
  const paymentDate = await calcDefaultPaymentDate(yearMonth);
  const { data, error } = await supabase.from('employee_payroll_periods').insert({ year_month: yearMonth, payment_date: paymentDate }).select().single();
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

// draft로 되돌려 항목 편집을 다시 열어준다 — 지출결의서 연결은 끊는다(문서 자체는 결재
// 이력으로 남기고 링크만 끊음). 직원 확인 상태는 여기서 일괄 초기화하지 않는다 — 실제로
// 항목이 바뀐 명세서만 updatePayslipItems에서 개별적으로 재확인 필요 상태가 되므로,
// 이미 승인/이의제기한 직원이 손대지 않은 명세서까지 다시 확인하게 만들지 않는다.
export async function reopenPayrollPeriod(periodId: string): Promise<void> {
  const { error } = await supabase
    .from('employee_payroll_periods')
    .update({ status: 'draft', confirmed_at: null, confirmed_by: null, approval_document_id: null, updated_at: new Date().toISOString() })
    .eq('id', periodId);
  if (error) throw error;
}

// --- 급여명세서 ---

// 이 기간에 아직 명세서가 없는 대상 직원마다, 현재 급여 항목(employee_salary_items)을
// 스냅샷으로 복사해 명세서를 생성한다. 이미 명세서가 있는 직원은 건너뛴다(중복 생성 방지).
export async function generatePayslipsForPeriod(periodId: string): Promise<{ created: number; skipped: number }> {
  const { data: period, error: periodError } = await supabase.from('employee_payroll_periods').select('payment_date, year_month').eq('id', periodId).single();
  if (periodError) throw periodError;
  const periodMonthStart = `${period.year_month}-01`;

  const [{ data: existing, error: existingError }, employees] = await Promise.all([
    supabase.from('employee_payslips').select('user_id').eq('period_id', periodId),
    // 이번 달 1일 이후에 퇴사한 사람은 이번 달분까지는 받아야 하니 포함(마지막 달은 일할계산으로 처리).
    getPayrollEligibleEmployees(periodMonthStart),
  ]);
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
    const rawItems = itemsByUser.get(emp.id) || [];
    // 그 달 안에 입사/퇴사가 있으면 고정급여·수당만 일할계산한다 — 공제(4대보험/대여금 등)는
    // 담당자가 실제 상황에 맞게 직접 정하는 항목이라 자동으로 비율을 적용하지 않는다.
    const { factor, note } = monthProration(period.year_month, emp.hire_date, emp.resignation_date);
    const items = factor === 1 ? rawItems : rawItems.map(i =>
      i.category === 'deduction' ? i : { ...i, amount: Math.round(i.amount * factor) }
    );
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
        proration_note: note,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (payslipError) throw payslipError;
    if (items.length > 0) {
      const { error: insertItemsError } = await supabase.from('employee_payslip_items').insert(
        items.map(i => ({ payslip_id: payslip.id, category: i.category, pay_group: i.pay_group, name: i.name, amount: i.amount, display_order: i.display_order }))
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
  const [{ data: items, error: itemsError }, { data: period }] = await Promise.all([
    supabase.from('employee_payslip_items').select('*').eq('payslip_id', payslipId).order('display_order'),
    supabase.from('employee_payroll_periods').select('year_month, status').eq('id', payslip.period_id).maybeSingle(),
  ]);
  if (itemsError) { console.error(itemsError); return null; }
  const [detail] = await attachEmployeeDetails([payslip], items || []);
  if (!detail) return null;
  // 실제 급여월(회차 기준)을 붙인다 — payslip.created_at(행 생성 시각)과는 다를 수 있어
  // 인쇄물에서 잘못된 월이 찍히던 문제의 원인이었다.
  return { ...detail, period_year_month: period?.year_month, period_status: period?.status };
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
  items: { category: EmployeeSalaryItemCategory; pay_group?: EmployeeSalaryItemPayGroup | null; name: string; amount: number; display_order: number }[]
): Promise<void> {
  const { error: deleteError } = await supabase.from('employee_payslip_items').delete().eq('payslip_id', payslipId);
  if (deleteError) throw deleteError;
  if (items.length > 0) {
    const { error: insertError } = await supabase.from('employee_payslip_items').insert(items.map(i => ({ ...i, pay_group: i.pay_group ?? null, payslip_id: payslipId })));
    if (insertError) throw insertError;
  }
  const base = sumByCategory(items, 'base');
  const allowance = sumByCategory(items, 'allowance');
  const deduction = sumByCategory(items, 'deduction');
  // 항목이 수정됐으므로 이 명세서만 재확인 필요 상태로 되돌린다 — 지출결의서가 반려되거나
  // 회차를 재오픈해도 다른 직원의 이미 완료된 확인 상태는 건드리지 않기 위함(반려 시 전원
  // 재승인을 요구하던 문제 수정).
  const { error: updateError } = await supabase
    .from('employee_payslips')
    .update({
      base_amount: base, total_allowance: allowance, total_deduction: deduction, net_amount: base + allowance - deduction,
      ack_status: 'pending', ack_comment: null, ack_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payslipId);
  if (updateError) throw updateError;
}

// draft 기간에서 특정 직원의 명세서를 제외 — 이후 "명세서 생성"을 다시 누르면 그 직원만 재생성된다.
export async function deletePayslip(payslipId: string): Promise<void> {
  const { error } = await supabase.from('employee_payslips').delete().eq('id', payslipId);
  if (error) throw error;
}

// draft 상태(아직 직원 확인 요청 전 = 집행 전)인 회차의 명세서를 전부 취소한다 — 급여
// 항목이 바뀐 뒤 "명세서 생성"을 다시 눌러 최신 값 기준으로 새로 만들 수 있게 해준다
// (generatePayslipsForPeriod는 이미 있는 명세서는 건너뛰므로, 재생성하려면 먼저 비워야 함).
export async function cancelPayslipsForPeriod(periodId: string): Promise<void> {
  const { data: period, error: periodError } = await supabase.from('employee_payroll_periods').select('status').eq('id', periodId).single();
  if (periodError) throw periodError;
  if (period.status !== 'draft') throw new Error('작성중 상태의 회차만 명세서를 취소할 수 있습니다.');
  const { error } = await supabase.from('employee_payslips').delete().eq('period_id', periodId);
  if (error) throw error;
}

// 지급 이력에서 작성중(명세서 없음) 회차를 완전히 삭제한다 — 실수로 만든 빈 회차 정리용.
export async function deletePayrollPeriod(periodId: string): Promise<void> {
  const { data: period, error: periodError } = await supabase.from('employee_payroll_periods').select('status').eq('id', periodId).single();
  if (periodError) throw periodError;
  if (period.status !== 'draft') throw new Error('작성중 상태의 회차만 삭제할 수 있습니다.');
  const { count, error: countError } = await supabase.from('employee_payslips').select('id', { count: 'exact', head: true }).eq('period_id', periodId);
  if (countError) throw countError;
  if (count && count > 0) throw new Error('명세서가 있는 회차는 삭제할 수 없습니다.');
  const { error } = await supabase.from('employee_payroll_periods').delete().eq('id', periodId);
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
    .select('id, resident_registration_number, hire_date, salary_bank_name, salary_bank_account')
    .in('id', payslips.map(p => p.user_id));
  const userById = new Map((users || []).map(u => [u.id, u]));

  // 전 직원이 0원인 항목은 열에서 빼서 급여대장을 보기 좋게 만든다 — 항목 존재 여부가 아니라
  // 실제 금액 합계 기준으로 판단(한 명이라도 0이 아니면 표시).
  const allowanceOrder: string[] = [];
  const deductionOrder: string[] = [];
  const sumByName = new Map<string, number>();
  for (const p of payslips) {
    for (const item of p.items) {
      if (item.category === 'allowance' && !allowanceOrder.includes(item.name)) allowanceOrder.push(item.name);
      if (item.category === 'deduction' && !deductionOrder.includes(item.name)) deductionOrder.push(item.name);
      if (item.category === 'allowance' || item.category === 'deduction') {
        sumByName.set(item.name, (sumByName.get(item.name) || 0) + item.amount);
      }
    }
  }
  const allowanceColumns = allowanceOrder.filter(name => (sumByName.get(name) || 0) !== 0);
  const deductionColumns = deductionOrder.filter(name => (sumByName.get(name) || 0) !== 0);

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
      salary_bank_name: u?.salary_bank_name || null,
      salary_bank_account: u?.salary_bank_account || null,
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

  // 예전엔 전 직원 합계를 한 항목으로 뭉쳐서 상신했다 — 지출결의서 문서유형의 실제 스키마는
  // expense_items(직원별 행) 배열인데 이 화면만 안 맞는 평평한 구조를 써왔던 걸 바로잡는다.
  // 승인 후 각 행이 경리 화면(지출결의 반영)에서 직원별로 각각 금전출납 거래가 된다.
  const expenseItems = ledger.rows.map(r => ({
    expense_category: '급여',
    purpose: `${period.year_month} 급여`,
    amount: r.net_amount,
    vendor: r.salary_bank_name && r.salary_bank_account
      ? `${r.employee_name} (${r.salary_bank_name} ${r.salary_bank_account})`
      : r.employee_name,
  }));

  const doc = await approvalDocumentService.createDocument({
    document_type_id: docType.id,
    title: `${period.year_month} 급여 지출결의서`,
    content,
    form_data: {
      expense_date: period.payment_date,
      expense_items: expenseItems,
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
