export type SickPayStatus = 'active' | 'closed';

// 상병(질병/부상) 하선 선원에게 하선일 다음날부터 발생하는 상병급여 케이스 — 선원 급여대장
// (crew_payslips)과 별개로 추적한다.
export interface CrewSickPayRecord {
  id: string;
  crew_member_id: string;
  ship_id: string;
  rank_id: string | null;
  sea_service_record_id: string | null;
  disembark_date: string;
  start_date: string; // 하선일 다음날
  monthly_amount: number;
  currency: string;
  status: SickPayStatus;
  closed_date: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewSickPayMonthlyEntry {
  id: string;
  sick_pay_record_id: string;
  year_month: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

// 화면 표시용 — 선원/선박/직급 이름까지 조인.
export interface CrewSickPayRecordWithDetails extends CrewSickPayRecord {
  crew_name: string;
  ship_name: string;
  owner_id?: string;
  owner_name?: string;
  fleet_id?: string;
  fleet_name?: string;
  rank_code: string;
}

// 급여대장 화면 하단 "상병 급여" 섹션 한 행 — 그 달에 해당하는 월별 항목(있으면 기존,
// 없으면 기준 월액으로 새로 만들 값)까지 합쳐서 보여준다.
export interface CrewSickPayLedgerRow extends CrewSickPayRecordWithDetails {
  monthly_entry_id: string | null; // 그 달 항목이 아직 없으면 null(기준 월액을 기본으로 보여줌)
  this_month_amount: number;
}
