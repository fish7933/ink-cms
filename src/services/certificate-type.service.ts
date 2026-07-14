import { supabase } from '@/lib/supabase';
import type { CertificateType, CertificateNationalityValidity } from '@/types/certificate-type';

export async function getCertificateTypes(activeOnly: boolean = true): Promise<CertificateType[]> {
  let query = supabase
    .from('certificate_types')
    .select('*')
    .order('display_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching certificate types:', error);
    throw error;
  }

  return data || [];
}

export async function getCertificateTypesByCategory(category: string, activeOnly: boolean = true): Promise<CertificateType[]> {
  let query = supabase
    .from('certificate_types')
    .select('*')
    .eq('category', category)
    .order('display_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching certificate types by category:', error);
    throw error;
  }

  return data || [];
}

export async function addCertificateType(certificateType: Omit<CertificateType, 'id' | 'created_at' | 'updated_at'>): Promise<CertificateType> {
  const { data, error } = await supabase
    .from('certificate_types')
    .insert(certificateType)
    .select()
    .single();

  if (error) {
    console.error('Error adding certificate type:', error);
    throw error;
  }

  return data;
}

export async function updateCertificateType(id: string, updates: Partial<CertificateType>): Promise<CertificateType> {
  const { data, error } = await supabase
    .from('certificate_types')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating certificate type:', error);
    throw error;
  }

  return data;
}

export async function deleteCertificateType(id: string): Promise<void> {
  const { error } = await supabase
    .from('certificate_types')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting certificate type:', error);
    throw error;
  }
}

// 국적별 유효기간 예외 — 대부분의 증서/국적 조합은 예외가 없어 기본값(validity_period_months)을
// 그대로 쓰고, 이 테이블에 행이 있는 조합만 그 값으로 대체된다.
export async function getNationalityValidityForType(certificateTypeId: string): Promise<CertificateNationalityValidity[]> {
  const { data, error } = await supabase
    .from('certificate_type_nationality_validity')
    .select('*')
    .eq('certificate_type_id', certificateTypeId);

  if (error) {
    console.error('Error fetching certificate nationality validity:', error);
    throw error;
  }

  return data || [];
}

// 선원 증서 자동 불러오기(CrewDetailPanel/CrewInputPage)에서 모든 유형의 예외를 한 번에 조회할 때 사용
export async function getAllNationalityValidityOverrides(): Promise<CertificateNationalityValidity[]> {
  const { data, error } = await supabase
    .from('certificate_type_nationality_validity')
    .select('*');

  if (error) {
    console.error('Error fetching certificate nationality validity overrides:', error);
    throw error;
  }

  return data || [];
}

export async function upsertNationalityValidity(
  certificateTypeId: string,
  nationalityCode: string,
  validityPeriodMonths: number | null
): Promise<void> {
  const { error } = await supabase
    .from('certificate_type_nationality_validity')
    .upsert(
      { certificate_type_id: certificateTypeId, nationality_code: nationalityCode, validity_period_months: validityPeriodMonths, updated_at: new Date().toISOString() },
      { onConflict: 'certificate_type_id,nationality_code' }
    );

  if (error) {
    console.error('Error saving certificate nationality validity:', error);
    throw error;
  }
}

export async function deleteNationalityValidity(id: string): Promise<void> {
  const { error } = await supabase
    .from('certificate_type_nationality_validity')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting certificate nationality validity:', error);
    throw error;
  }
}