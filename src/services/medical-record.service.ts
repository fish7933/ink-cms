import { supabase } from '@/lib/supabase';
import type { MedicalRecordWithDetails } from '@/types/crew-extended';

// 상병 기록에 연결된 승선 기록에서 선박(ship_id)을 가져온 뒤, 그 선박의 선주/플릿을
// ships/companies/fleets에서 조회해 채운다 (ship_name 자유입력만 있는 경우를 대비해
// sea_service_records를 우선 사용하고, 없으면 medical_records.ship_name으로 대체).
const MEDICAL_SELECT = `*, crew_members!crew_member_id(name, rank_id, current_grade, ranks:rank_id(name, rank_code)), sea_service_records!sea_service_record_id(ship_id, ship_name, owner_company_name)`;

interface RawSeaService { ship_id: string | null; ship_name: string | null; owner_company_name: string | null; }
interface RawShipRow { id: string; name: string; owner_id: string | null; fleet_id: string | null; }

async function mapRows(rows: Record<string, unknown>[]): Promise<MedicalRecordWithDetails[]> {
  const shipIds = new Set<string>();
  for (const r of rows) {
    const seaService = r.sea_service_records as RawSeaService | null;
    if (seaService?.ship_id) shipIds.add(seaService.ship_id);
  }

  const shipsRes = shipIds.size > 0
    ? await supabase.from('ships').select('id, name, owner_id, fleet_id').in('id', [...shipIds])
    : { data: [] as RawShipRow[] };
  const shipById = new Map((shipsRes.data || []).map(s => [s.id, s]));

  const ownerIds = new Set<string>();
  const fleetIds = new Set<string>();
  for (const s of shipsRes.data || []) {
    if (s.owner_id) ownerIds.add(s.owner_id);
    if (s.fleet_id) fleetIds.add(s.fleet_id);
  }
  const [ownersRes, fleetsRes] = await Promise.all([
    ownerIds.size > 0 ? supabase.from('companies').select('id, name').in('id', [...ownerIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fleetIds.size > 0 ? supabase.from('fleets').select('id, name').in('id', [...fleetIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const ownerNameById = new Map((ownersRes.data || []).map(o => [o.id, o.name]));
  const fleetNameById = new Map((fleetsRes.data || []).map(f => [f.id, f.name]));

  return rows.map(r => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const seaService = r.sea_service_records as RawSeaService | null;
    const ship = seaService?.ship_id ? shipById.get(seaService.ship_id) : undefined;
    return {
      ...r,
      crew_name: (crew?.name as string) || '',
      rank_name: (ranks?.name as string) || '',
      rank_code: (ranks?.rank_code as string) || '',
      rank_grade: (crew?.current_grade as string) || undefined,
      resolved_ship_name: ship?.name || seaService?.ship_name || (r.ship_name as string) || undefined,
      owner_name: (ship?.owner_id ? ownerNameById.get(ship.owner_id) : undefined) || seaService?.owner_company_name || undefined,
      fleet_name: ship?.fleet_id ? fleetNameById.get(ship.fleet_id) : undefined,
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
