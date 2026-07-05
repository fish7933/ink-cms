import { supabase } from '@/lib/supabase';
import type {
  CrewCertificate,
  SeaServiceRecord,
  TrainingRecord,
  MedicalRecord,
  CrewSalaryRecord,
  CrewAssignment,
  CrewBioData
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