import { supabase } from '@/lib/supabase';
import type { MedicalRecordWithDetails } from '@/types/crew-extended';

// 상병 기록에 연결된 승선 기록의 선박명/선주사명을 함께 가져온다 (ship_name 자유입력만 있는
// 경우를 대비해 sea_service_records를 우선 사용하고, 없으면 medical_records.ship_name으로 대체).
const MEDICAL_SELECT = `*, crew_members!crew_member_id(name, rank_id, current_grade, ranks:rank_id(name, rank_code)), sea_service_records!sea_service_record_id(ship_name, owner_company_name)`;

interface RawSeaService { ship_name: string | null; owner_company_name: string | null; }

function mapRows(rows: Record<string, unknown>[]): MedicalRecordWithDetails[] {
  return rows.map(r => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const seaService = r.sea_service_records as RawSeaService | null;
    return {
      ...r,
      crew_name: (crew?.name as string) || '',
      rank_name: (ranks?.name as string) || '',
      rank_code: (ranks?.rank_code as string) || '',
      rank_grade: (crew?.current_grade as string) || undefined,
      resolved_ship_name: seaService?.ship_name || (r.ship_name as string) || undefined,
      owner_name: seaService?.owner_company_name || undefined,
    } as MedicalRecordWithDetails;
  });
}

// 전체 선원의 상병(부상/질병) 기록을 모아 보여주는 상병 관리 화면용 조회.
export async function getAllMedicalRecordsWithDetails(): Promise<MedicalRecordWithDetails[]> {
  const { data, error } = await supabase
    .from('medical_records')
    .select(MEDICAL_SELECT)
    .order('record_date', { ascending: false });
  if (error) { console.error(error); return []; }
  return mapRows(data || []);
}
