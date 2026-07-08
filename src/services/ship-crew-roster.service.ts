import { supabase } from '@/lib/supabase';
import { isContractActiveOnDate } from '@/lib/crew-contract-coverage';

// IMO FAL Form 5 (Crew List) 표준 서식에 맞춘 승선 인원 항목
export interface ShipCrewRosterEntry {
  record_id: string;
  crew_member_id: string;
  family_name: string;
  given_names: string;
  rank: string;
  rank_grade: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  id_document_nature: string | null; // Passport / Seaman's Book
  id_document_number: string | null;
  id_document_expiry: string | null;
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

interface CrewContractRosterRow extends CrewContractRange {
  id: string;
  rank: string;
  crew_members: {
    name: string;
    nationality: string | null;
    date_of_birth: string | null;
    place_of_birth: string | null;
    passport_number: string | null;
    passport_expiry: string | null;
    seaman_book_flag_number: string | null;
    seaman_book_flag_expiry: string | null;
    seaman_book_number: string | null;
    seaman_book_expiry: string | null;
  } | null;
}

const CREW_ROSTER_SELECT = 'id, crew_member_id, rank, start_date, end_date, terminated_date, status, crew_members(name, nationality, date_of_birth, place_of_birth, passport_number, passport_expiry, seaman_book_flag_number, seaman_book_flag_expiry, seaman_book_number, seaman_book_expiry)';

// 이름을 "성 이름" 두 단어로 단순 분리 (family name / given names 컬럼이 없어 근사치로 사용)
function splitName(fullName: string): { family: string; given: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { family: fullName, given: '' };
  return { family: parts[0], given: parts.slice(1).join(' ') };
}

// 신분증(여권/선원수첩) 중 국제 항해에 쓰이는 것을 우선해서 하나만 선택
function pickIdDocument(crew: NonNullable<CrewContractRosterRow['crew_members']>): {
  nature: string | null; number: string | null; expiry: string | null;
} {
  if (crew.seaman_book_flag_number) {
    return { nature: "Seaman's Book", number: crew.seaman_book_flag_number, expiry: crew.seaman_book_flag_expiry };
  }
  if (crew.seaman_book_number) {
    return { nature: "Seaman's Book", number: crew.seaman_book_number, expiry: crew.seaman_book_expiry };
  }
  if (crew.passport_number) {
    return { nature: 'Passport', number: crew.passport_number, expiry: crew.passport_expiry };
  }
  return { nature: null, number: null, expiry: null };
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
  const { data, error } = await supabase
    .from('crew_contracts')
    .select(CREW_ROSTER_SELECT)
    .eq('ship_id', shipId)
    .neq('status', 'draft')
    .order('start_date', { ascending: false });

  if (error) throw error;

  const seenCrew = new Set<string>();
  const roster: ShipCrewRosterEntry[] = [];
  for (const r of (data || []) as unknown as CrewContractRosterRow[]) {
    if (!isContractActiveOnDate(r, date)) continue;
    if (seenCrew.has(r.crew_member_id)) continue; // 갱신 등 중복 계약은 최신 1건만
    seenCrew.add(r.crew_member_id);

    const crew = r.crew_members;
    const { family, given } = splitName(crew?.name || '알 수 없음');
    const idDoc = crew ? pickIdDocument(crew) : { nature: null, number: null, expiry: null };

    roster.push({
      record_id: r.id,
      crew_member_id: r.crew_member_id,
      family_name: family,
      given_names: given,
      rank: r.rank,
      rank_grade: null,
      nationality: crew?.nationality || null,
      date_of_birth: crew?.date_of_birth || null,
      place_of_birth: crew?.place_of_birth || null,
      id_document_nature: idDoc.nature,
      id_document_number: idDoc.number,
      id_document_expiry: idDoc.expiry,
      sign_on_date: r.start_date,
      sign_off_date: r.terminated_date || r.end_date,
    });
  }
  return roster;
}
