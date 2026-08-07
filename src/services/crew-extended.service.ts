import { supabase } from '@/lib/supabase';
import type {
  CrewCertificate,
  SeaServiceRecord,
  TrainingRecord,
  MedicalRecord,
  MedicalRecordLog,
  CrewSalaryRecord,
  CrewAssignment,
  CrewBioData,
  CrewInterviewLog,
  CrewInterviewLogWithDetails,
} from '@/types/crew-extended';

// Bio-data
export async function updateCrewBioData(crewMemberId: string, bioData: CrewBioData): Promise<void> {
  const { error } = await supabase
    .from('crew_members')
    .update(bioData)
    .eq('id', crewMemberId);

  if (error) {
    console.error('Error updating crew bio-data:', error);
    throw error;
  }
}

// Certificates
export async function getCrewCertificates(crewMemberId: string): Promise<CrewCertificate[]> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .select('*')
    .eq('crew_member_id', crewMemberId)
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('Error fetching certificates:', error);
    throw error;
  }

  return data || [];
}

export async function addCrewCertificate(certificate: Omit<CrewCertificate, 'id' | 'created_at' | 'updated_at'>): Promise<CrewCertificate> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .insert(certificate)
    .select()
    .single();

  if (error) {
    console.error('Error adding certificate:', error);
    throw error;
  }

  return data;
}

export async function updateCrewCertificate(id: string, updates: Partial<CrewCertificate>): Promise<CrewCertificate> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating certificate:', error);
    throw error;
  }

  return data;
}

export async function deleteCrewCertificate(id: string): Promise<void> {
  const { error } = await supabase
    .from('crew_certificates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting certificate:', error);
    throw error;
  }
}

// Sea Service Records
export async function getSeaServiceRecords(crewMemberId: string): Promise<SeaServiceRecord[]> {
  const { data, error } = await supabase
    .from('sea_service_records')
    .select('*, sign_off_reasons(name)')
    .eq('crew_member_id', crewMemberId)
    .order('sign_on_date', { ascending: false });

  if (error) {
    console.error('Error fetching sea service records:', error);
    throw error;
  }

  return (data || []).map((r: Record<string, unknown>) => {
    const reason = r.sign_off_reasons as { name: string } | null;
    return { ...r, sign_off_reason_name: reason?.name };
  }) as SeaServiceRecord[];
}

export async function addSeaServiceRecord(record: Omit<SeaServiceRecord, 'id' | 'created_at' | 'updated_at'>): Promise<SeaServiceRecord> {
  const { data, error } = await supabase
    .from('sea_service_records')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error adding sea service record:', error);
    throw error;
  }

  return data;
}

export async function updateSeaServiceRecord(id: string, updates: Partial<SeaServiceRecord>): Promise<SeaServiceRecord> {
  const { data, error } = await supabase
    .from('sea_service_records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating sea service record:', error);
    throw error;
  }

  return data;
}

export async function deleteSeaServiceRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('sea_service_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting sea service record:', error);
    throw error;
  }
}

// Training Records
export async function getTrainingRecords(crewMemberId: string): Promise<TrainingRecord[]> {
  const { data, error } = await supabase
    .from('training_records')
    .select('*')
    .eq('crew_member_id', crewMemberId)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('Error fetching training records:', error);
    throw error;
  }

  return data || [];
}

export async function addTrainingRecord(record: Omit<TrainingRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TrainingRecord> {
  const { data, error } = await supabase
    .from('training_records')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error adding training record:', error);
    throw error;
  }

  return data;
}

export async function updateTrainingRecord(id: string, updates: Partial<TrainingRecord>): Promise<TrainingRecord> {
  const { data, error } = await supabase
    .from('training_records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating training record:', error);
    throw error;
  }

  return data;
}

export async function deleteTrainingRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('training_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting training record:', error);
    throw error;
  }
}

// Medical Records
export async function getMedicalRecords(crewMemberId: string): Promise<MedicalRecord[]> {
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('crew_member_id', crewMemberId)
    .order('record_date', { ascending: false });

  if (error) {
    console.error('Error fetching medical records:', error);
    throw error;
  }

  return data || [];
}

export async function getMedicalRecordsBySeaServiceRecord(seaServiceRecordId: string): Promise<MedicalRecord[]> {
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('sea_service_record_id', seaServiceRecordId)
    .order('record_date', { ascending: false });

  if (error) {
    console.error('Error fetching medical records by sea service record:', error);
    throw error;
  }

  return data || [];
}

export async function addMedicalRecord(record: Omit<MedicalRecord, 'id' | 'created_at' | 'updated_at'>): Promise<MedicalRecord> {
  const { data, error } = await supabase
    .from('medical_records')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error adding medical record:', error);
    throw error;
  }

  return data;
}

export async function updateMedicalRecord(id: string, updates: Partial<MedicalRecord>): Promise<MedicalRecord> {
  const { data, error } = await supabase
    .from('medical_records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating medical record:', error);
    throw error;
  }

  return data;
}

export async function deleteMedicalRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('medical_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting medical record:', error);
    throw error;
  }
}

// Medical Record Logs — 상병 기록 하나에 대해 치료가 진행되는 동안 계속 남기는 경과 로그
export async function getMedicalRecordLogs(medicalRecordId: string): Promise<MedicalRecordLog[]> {
  const { data, error } = await supabase
    .from('medical_record_logs')
    .select('*')
    .eq('medical_record_id', medicalRecordId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching medical record logs:', error);
    throw error;
  }

  return data || [];
}

export async function addMedicalRecordLog(medicalRecordId: string, logDate: string, note: string, attachments: MedicalRecordLog['attachments'] = []): Promise<MedicalRecordLog> {
  const { data, error } = await supabase
    .from('medical_record_logs')
    .insert({ medical_record_id: medicalRecordId, log_date: logDate, note, attachments })
    .select()
    .single();

  if (error) {
    console.error('Error adding medical record log:', error);
    throw error;
  }

  return data;
}

export async function updateMedicalRecordLogAttachments(id: string, attachments: MedicalRecordLog['attachments']): Promise<void> {
  const { error } = await supabase
    .from('medical_record_logs')
    .update({ attachments })
    .eq('id', id);

  if (error) {
    console.error('Error updating medical record log attachments:', error);
    throw error;
  }
}

export async function deleteMedicalRecordLog(id: string): Promise<void> {
  const { error } = await supabase
    .from('medical_record_logs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting medical record log:', error);
    throw error;
  }
}

// Salary Records
export async function getCrewSalaryRecords(crewMemberId: string): Promise<CrewSalaryRecord[]> {
  const { data, error } = await supabase
    .from('crew_salary_records')
    .select('*')
    .eq('crew_member_id', crewMemberId)
    .order('payment_date', { ascending: false });

  if (error) {
    console.error('Error fetching salary records:', error);
    throw error;
  }

  return data || [];
}

export async function addCrewSalaryRecord(record: Omit<CrewSalaryRecord, 'id' | 'created_at' | 'updated_at'>): Promise<CrewSalaryRecord> {
  const { data, error } = await supabase
    .from('crew_salary_records')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error adding salary record:', error);
    throw error;
  }

  return data;
}

// 같은 레벨(직급) 선원들에게 동일한 급여 내역을 한 번에 적용할 때 사용
export async function addCrewSalaryRecordsBulk(records: Omit<CrewSalaryRecord, 'id' | 'created_at' | 'updated_at'>[]): Promise<CrewSalaryRecord[]> {
  const { data, error } = await supabase
    .from('crew_salary_records')
    .insert(records)
    .select();

  if (error) {
    console.error('Error bulk-adding salary records:', error);
    throw error;
  }

  return data || [];
}

export async function updateCrewSalaryRecord(id: string, updates: Partial<CrewSalaryRecord>): Promise<CrewSalaryRecord> {
  const { data, error } = await supabase
    .from('crew_salary_records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating salary record:', error);
    throw error;
  }

  return data;
}

export async function deleteCrewSalaryRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('crew_salary_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting salary record:', error);
    throw error;
  }
}

// Crew Assignments
export async function getCrewAssignments(crewMemberId?: string, shipId?: string): Promise<CrewAssignment[]> {
  let query = supabase
    .from('crew_assignments')
    .select('*')
    .order('assignment_date', { ascending: false });

  if (crewMemberId) {
    query = query.eq('crew_member_id', crewMemberId);
  }

  if (shipId) {
    query = query.eq('ship_id', shipId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching crew assignments:', error);
    throw error;
  }

  return data || [];
}

export async function addCrewAssignment(assignment: Omit<CrewAssignment, 'id' | 'created_at' | 'updated_at'>): Promise<CrewAssignment> {
  const { data, error } = await supabase
    .from('crew_assignments')
    .insert(assignment)
    .select()
    .single();

  if (error) {
    console.error('Error adding crew assignment:', error);
    throw error;
  }

  return data;
}

export async function updateCrewAssignment(id: string, updates: Partial<CrewAssignment>): Promise<CrewAssignment> {
  const { data, error } = await supabase
    .from('crew_assignments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating crew assignment:', error);
    throw error;
  }

  return data;
}

export async function deleteCrewAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from('crew_assignments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting crew assignment:', error);
    throw error;
  }
}

// 선원 면담 일지
export async function getCrewInterviewLogs(crewMemberId: string): Promise<CrewInterviewLogWithDetails[]> {
  const { data, error } = await supabase
    .from('crew_interview_logs')
    .select('*, owner:companies!desired_owner_id(name), fleet:fleets!desired_fleet_id(name), ship:ships!desired_ship_id(name)')
    .eq('crew_member_id', crewMemberId)
    .order('interview_date', { ascending: false });

  if (error) {
    console.error('Error fetching crew interview logs:', error);
    throw error;
  }

  return (data || []).map(d => {
    const { owner, fleet, ship, ...rest } = d as typeof d & {
      owner: { name?: string } | null;
      fleet: { name?: string } | null;
      ship: { name?: string } | null;
    };
    return {
      ...rest,
      desired_owner_name: owner?.name,
      desired_fleet_name: fleet?.name,
      desired_ship_name: ship?.name,
    } as CrewInterviewLogWithDetails;
  });
}

// 이 면담이(추가/수정/삭제 후) 그 선원의 가장 최근 면담이면, 그 승선 희망일을
// crew_members.desired_embark_date에도 반영한다 — 없으면(면담이 아예 없어졌으면) null로 비운다.
async function syncDesiredEmbarkDateFromLatestInterview(crewMemberId: string): Promise<void> {
  const logs = await getCrewInterviewLogs(crewMemberId);
  const latest = logs[0];
  await supabase
    .from('crew_members')
    .update({ desired_embark_date: latest?.desired_embark_date || null, updated_at: new Date().toISOString() })
    .eq('id', crewMemberId);
}

export async function addCrewInterviewLog(log: Omit<CrewInterviewLog, 'id' | 'created_at' | 'updated_at'>): Promise<CrewInterviewLog> {
  const { data, error } = await supabase
    .from('crew_interview_logs')
    .insert(log)
    .select()
    .single();

  if (error) {
    console.error('Error adding crew interview log:', error);
    throw error;
  }

  await syncDesiredEmbarkDateFromLatestInterview(log.crew_member_id);
  return data;
}

export async function updateCrewInterviewLog(id: string, updates: Partial<CrewInterviewLog>): Promise<CrewInterviewLog> {
  const { data, error } = await supabase
    .from('crew_interview_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating crew interview log:', error);
    throw error;
  }

  await syncDesiredEmbarkDateFromLatestInterview(data.crew_member_id);
  return data;
}

export async function deleteCrewInterviewLog(id: string): Promise<void> {
  const { data: existing } = await supabase.from('crew_interview_logs').select('crew_member_id').eq('id', id).single();

  const { error } = await supabase
    .from('crew_interview_logs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting crew interview log:', error);
    throw error;
  }

  if (existing?.crew_member_id) await syncDesiredEmbarkDateFromLatestInterview(existing.crew_member_id);
}