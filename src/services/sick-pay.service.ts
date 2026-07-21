import { supabase } from '@/lib/supabase';
import { crewDisplayName } from '@/lib/utils';
import type { CrewSickPayRecord, CrewSickPayRecordWithDetails, CrewSickPayLedgerRow } from '@/types/sick-pay';

// 로컬 타임존으로 Date를 만들고 toISOString()(UTC)으로 읽으면, UTC보다 앞선 타임존(KST 등)에서
// 날짜가 하루 밀려버린다(예: KST에서 2026-07-27 + 1일이 다시 2026-07-27로 나옴) — UTC 기준으로만
// 계산해서 타임존 영향을 없앤다.
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthRange(yearMonth: string): { start: string; end: string } {
  const end = daysInMonth(yearMonth);
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(end).padStart(2, '0')}` };
}

// 상병급여는 시작월/종결월을 일할계산으로 기본 산정한다(그 외 달은 기준 월액 그대로).
// 시작월과 종결월이 같은 짧은 케이스도 처리한다.
function defaultMonthlyAmount(record: CrewSickPayRecord, yearMonth: string): number {
  const total = Number(record.monthly_amount);
  const dim = daysInMonth(yearMonth);
  const startYm = record.start_date.slice(0, 7);
  const closedYm = record.closed_date?.slice(0, 7);

  if (yearMonth === startYm) {
    const startDay = Number(record.start_date.slice(8, 10));
    const endDay = closedYm === yearMonth ? Number(record.closed_date!.slice(8, 10)) : dim;
    const daysServed = Math.max(0, endDay - startDay + 1);
    return Math.round(total * daysServed / dim);
  }
  if (closedYm === yearMonth) {
    const closedDay = Number(record.closed_date!.slice(8, 10));
    return Math.round(total * closedDay / dim);
  }
  return total;
}

async function attachDetails(records: CrewSickPayRecord[]): Promise<CrewSickPayRecordWithDetails[]> {
  if (records.length === 0) return [];
  const crewIds = [...new Set(records.map(r => r.crew_member_id))];
  const shipIds = [...new Set(records.map(r => r.ship_id))];
  const rankIds = [...new Set(records.map(r => r.rank_id).filter((v): v is string => !!v))];

  const [{ data: crewRows }, { data: shipRows }, { data: rankRows }] = await Promise.all([
    supabase.from('crew_members').select('id, name, name_english').in('id', crewIds),
    supabase.from('ships').select('id, name, owner_id, fleet_id').in('id', shipIds),
    rankIds.length > 0 ? supabase.from('ranks').select('id, rank_code').in('id', rankIds) : Promise.resolve({ data: [] as { id: string; rank_code: string }[] }),
  ]);
  const crewById = new Map((crewRows || []).map(c => [c.id, c]));
  const shipById = new Map((shipRows || []).map(s => [s.id, s]));
  const rankById = new Map((rankRows || []).map(r => [r.id, r.rank_code]));

  const ownerIds = [...new Set((shipRows || []).map(s => s.owner_id).filter((v): v is string => !!v))];
  const fleetIds = [...new Set((shipRows || []).map(s => s.fleet_id).filter((v): v is string => !!v))];
  const [{ data: ownerRows }, { data: fleetRows }] = await Promise.all([
    ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const ownerNameById = new Map((ownerRows || []).map(o => [o.id, o.name]));
  const fleetNameById = new Map((fleetRows || []).map(f => [f.id, f.name]));

  return records.map(r => {
    const crew = crewById.get(r.crew_member_id);
    const ship = shipById.get(r.ship_id);
    return {
      ...r,
      crew_name: crew ? crewDisplayName(crew) : '',
      ship_name: ship?.name || '',
      owner_id: ship?.owner_id ?? undefined,
      owner_name: ship?.owner_id ? ownerNameById.get(ship.owner_id) : undefined,
      fleet_id: ship?.fleet_id ?? undefined,
      fleet_name: ship?.fleet_id ? fleetNameById.get(ship.fleet_id) : undefined,
      rank_code: r.rank_id ? rankById.get(r.rank_id) || '' : '',
    };
  });
}

export const sickPayService = {
  // 상병 하선 등록 — 귀국일(return_date)까지는 정상 급여가 지급되므로, 상병급여 청구
  // 시작일은 하선일이 아니라 귀국일 다음날부터다. 귀국일이 없으면(드묾) 하선일을 대신 쓴다.
  async createSickPayRecord(input: {
    crew_member_id: string;
    ship_id: string;
    rank_id: string | null;
    sea_service_record_id: string | null;
    disembark_date: string;
    return_date: string | null;
    monthly_amount: number;
    currency?: string;
    memo?: string | null;
    created_by: string;
  }): Promise<CrewSickPayRecord> {
    const startBasis = input.return_date || input.disembark_date;
    const { data, error } = await supabase
      .from('crew_sick_pay_records')
      .insert({
        crew_member_id: input.crew_member_id,
        ship_id: input.ship_id,
        rank_id: input.rank_id,
        sea_service_record_id: input.sea_service_record_id,
        disembark_date: input.disembark_date,
        return_date: input.return_date,
        start_date: addDays(startBasis, 1),
        monthly_amount: input.monthly_amount,
        currency: input.currency || 'USD',
        memo: input.memo || null,
        created_by: input.created_by,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async closeSickPayRecord(id: string, closedDate: string): Promise<void> {
    const { error } = await supabase.from('crew_sick_pay_records').update({ status: 'closed', closed_date: closedDate, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async reopenSickPayRecord(id: string): Promise<void> {
    const { error } = await supabase.from('crew_sick_pay_records').update({ status: 'active', closed_date: null, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  // 상병 수당 관리 화면의 체크박스 선택삭제 — 월별 청구 내역(crew_sick_pay_monthly_entries)은
  // FK ON DELETE CASCADE라 케이스만 지우면 같이 정리된다.
  async deleteSickPayRecords(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.from('crew_sick_pay_records').delete().in('id', ids);
    if (error) throw error;
  },

  // 그 선박·그 달에 표시해야 할 상병급여 케이스 — 시작일이 그 달 말 이전이고, 종결됐다면
  // 종결일이 그 달 시작일 이후(=그 달까지는 표시)인 것만 대상. 그 달 항목이 없으면
  // 기준 월액을 기본값으로 보여준다(저장 전까지는 monthly_entry_id가 null).
  async getSickPayForShipMonth(shipId: string, yearMonth: string): Promise<CrewSickPayLedgerRow[]> {
    const { start, end } = monthRange(yearMonth);
    const { data: records, error } = await supabase
      .from('crew_sick_pay_records')
      .select('*')
      .eq('ship_id', shipId)
      .lte('start_date', end)
      .or(`status.eq.active,closed_date.gte.${start}`)
      .order('start_date');
    if (error) { console.error('Error fetching sick pay records:', error); return []; }
    if (!records || records.length === 0) return [];

    const recordIds = records.map(r => r.id);
    const { data: entries } = await supabase.from('crew_sick_pay_monthly_entries').select('*').in('sick_pay_record_id', recordIds).eq('year_month', yearMonth);
    const entryByRecordId = new Map((entries || []).map(e => [e.sick_pay_record_id, e]));

    const withDetails = await attachDetails(records);
    return withDetails.map(r => {
      const entry = entryByRecordId.get(r.id);
      return { ...r, monthly_entry_id: entry?.id || null, this_month_amount: entry ? Number(entry.amount) : defaultMonthlyAmount(r, yearMonth) };
    });
  },

  // 그 달 금액을 저장(없으면 생성, 있으면 수정) — 급여대장 화면에서 인라인 수정 시 사용.
  async upsertMonthlyEntry(sickPayRecordId: string, yearMonth: string, amount: number): Promise<void> {
    const { error } = await supabase
      .from('crew_sick_pay_monthly_entries')
      .upsert({ sick_pay_record_id: sickPayRecordId, year_month: yearMonth, amount, updated_at: new Date().toISOString() }, { onConflict: 'sick_pay_record_id,year_month' });
    if (error) throw error;
  },

  // 전용 관리 페이지용 — 선주/플릿/선박 전체에 걸친 케이스 목록(상태 필터 가능).
  async getAllSickPayRecords(status?: 'active' | 'closed'): Promise<CrewSickPayRecordWithDetails[]> {
    let query = supabase.from('crew_sick_pay_records').select('*').order('start_date', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) { console.error('Error fetching sick pay records:', error); return []; }
    return attachDetails(data || []);
  },

  async getMonthlyEntriesForRecord(sickPayRecordId: string): Promise<{ year_month: string; amount: number }[]> {
    const { data, error } = await supabase.from('crew_sick_pay_monthly_entries').select('year_month, amount').eq('sick_pay_record_id', sickPayRecordId).order('year_month', { ascending: false });
    if (error) { console.error('Error fetching sick pay monthly entries:', error); return []; }
    return (data || []).map(e => ({ year_month: e.year_month, amount: Number(e.amount) }));
  },
};
