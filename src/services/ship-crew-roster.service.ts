import { supabase } from '@/lib/supabase';
import { isContractActiveOnDate } from '@/lib/crew-contract-coverage';

export interface ShipCrewRosterEntry {
  record_id: string;
  crew_member_id: string;
  crew_name: string;
  rank: string;
  rank_grade: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  seaman_book_number: string | null;
  passport_number: string | null;
  passport_issue_date: string | null;
  passport_expiry: string | null;
  sign_on_date: string;
  sign_off_date: string | null;
}

export interface CrewContractRange {
  crew_member_id: string;
  start_date: string;
  end_date: string;
  terminated_date: string | null;
  status: string;
}

interface CrewCertificate {
  name: string;
  number?: string;
  issued_date?: string;
  expiry_date?: string;
}

interface CrewContractRosterRow extends CrewContractRange {
  id: string;
  rank: string;
  crew_members: {
    name: string;
    nationality: string | null;
    date_of_birth: string | null;
    seaman_book_flag_number: string | null;
    seaman_book_number: string | null;
    certificates: CrewCertificate[] | string | null;
  } | null;
}

const CREW_ROSTER_SELECT = 'id, crew_member_id, rank, start_date, end_date, terminated_date, status, crew_members(name, nationality, date_of_birth, seaman_book_flag_number, seaman_book_number, certificates)';

// crew_members.certificates는 JSON 문자열로 저장돼있을 수 있어 파싱해준다 (CrewDetailPanel.tsx와 동일 처리)
function parseCertificates(raw: CrewCertificate[] | string | null | undefined): CrewCertificate[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

// 여권 정보는 crew_members의 레거시 passport_number/passport_expiry 컬럼이 아니라
// 증서 관리(certificates JSON)에서 "한국 여권"/"외국 여권" 증서를 찾아 가져온다.
async function getPassportCertificateTypeNames(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('certificate_types')
    .select('type_name_en')
    .in('type_code', ['KR_PASSPORT', 'PASSPORT_FOREIGN']);
  if (error) throw error;
  return new Set((data || []).map((t: { type_name_en: string }) => t.type_name_en));
}

// 선박의 전체 승선 계약 기간(날짜 범위)만 가져온다 — 달력에서 어느 날짜에 승선 인원이 있었는지
// 표시하기 위해 매번 날짜별로 쿼리하지 않고 한 번에 불러와 클라이언트에서 판정한다.
export async function getShipContractRanges(shipId: string): Promise<CrewContractRange[]> {
  const { data, error } = await supabase
    .from('crew_contracts')
    .select('crew_member_id, start_date, end_date, terminated_date, status')
    .eq('ship_id', shipId)
    .neq('status', 'draft');

  if (error) throw error;
  return (data || []) as CrewContractRange[];
}

// 특정 선박에서 특정 기준일에 승선 중이었던(계약 start_date <= date <= end_date/조기하선일) 선원 목록.
// date에 오늘 날짜를 넘기면 "현재 승선 중" 목록이 된다. crew_contracts(정식 계약)를 기준으로 한다.
export async function getShipCrewRoster(shipId: string, date: string): Promise<ShipCrewRosterEntry[]> {
  const [{ data, error }, passportTypeNames] = await Promise.all([
    supabase
      .from('crew_contracts')
      .select(CREW_ROSTER_SELECT)
      .eq('ship_id', shipId)
      .neq('status', 'draft')
      .order('start_date', { ascending: false }),
    getPassportCertificateTypeNames(),
  ]);

  if (error) throw error;

  const seenCrew = new Set<string>();
  const roster: ShipCrewRosterEntry[] = [];
  for (const r of (data || []) as unknown as CrewContractRosterRow[]) {
    if (!isContractActiveOnDate(r, date)) continue;
    if (seenCrew.has(r.crew_member_id)) continue; // 갱신 등 중복 계약은 최신 1건만
    seenCrew.add(r.crew_member_id);

    const crew = r.crew_members;
    const passportCert = parseCertificates(crew?.certificates).find(c => passportTypeNames.has(c.name)) || null;

    roster.push({
      record_id: r.id,
      crew_member_id: r.crew_member_id,
      crew_name: crew?.name || '알 수 없음',
      rank: r.rank,
      rank_grade: null,
      nationality: crew?.nationality || null,
      date_of_birth: crew?.date_of_birth || null,
      seaman_book_number: crew?.seaman_book_flag_number || crew?.seaman_book_number || null,
      passport_number: passportCert?.number || null,
      passport_issue_date: passportCert?.issued_date || null,
      passport_expiry: passportCert?.expiry_date || null,
      sign_on_date: r.start_date,
      sign_off_date: r.terminated_date || r.end_date,
    });
  }
  return roster;
}
