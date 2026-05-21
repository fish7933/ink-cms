import { supabase } from '@/lib/supabase';
import type { CertificateType } from '@/types/certificate-type';

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