import { supabase } from '@/lib/supabase';
import type { CrewCertificate, CrewCertificateWithType } from '@/types/crew-certificate';

export async function getCrewCertificates(crewId: string): Promise<CrewCertificateWithType[]> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .select(`
      *,
      certificate_type:certificate_types(id, type_name_ko, category)
    `)
    .eq('crew_id', crewId)
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('Error fetching crew certificates:', error);
    throw error;
  }

  return data || [];
}

export async function getAllCertificates(): Promise<CrewCertificateWithType[]> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .select(`
      *,
      certificate_type:certificate_types(id, type_name_ko, category)
    `)
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('Error fetching all certificates:', error);
    throw error;
  }

  return data || [];
}

export async function getExpiringCertificates(days: number = 30): Promise<CrewCertificateWithType[]> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const { data, error } = await supabase
    .from('crew_certificates')
    .select(`
      *,
      certificate_type:certificate_types(id, type_name_ko, category)
    `)
    .lte('expiry_date', futureDate.toISOString().split('T')[0])
    .gte('expiry_date', new Date().toISOString().split('T')[0])
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('Error fetching expiring certificates:', error);
    throw error;
  }

  return data || [];
}

export async function getExpiredCertificates(): Promise<CrewCertificateWithType[]> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .select(`
      *,
      certificate_type:certificate_types(id, type_name_ko, category)
    `)
    .eq('status', 'expired')
    .order('expiry_date', { ascending: false });

  if (error) {
    console.error('Error fetching expired certificates:', error);
    throw error;
  }

  return data || [];
}

export async function addCrewCertificate(
  certificate: Omit<CrewCertificate, 'id' | 'status' | 'created_at' | 'updated_at'>
): Promise<CrewCertificate> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .insert(certificate)
    .select()
    .single();

  if (error) {
    console.error('Error adding crew certificate:', error);
    throw error;
  }

  return data;
}

export async function updateCrewCertificate(
  id: string,
  updates: Partial<CrewCertificate>
): Promise<CrewCertificate> {
  const { data, error } = await supabase
    .from('crew_certificates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating crew certificate:', error);
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
    console.error('Error deleting crew certificate:', error);
    throw error;
  }
}

export async function uploadCertificateFile(file: File, crewId: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${crewId}/${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('certificates')
    .upload(fileName, file);

  if (error) {
    console.error('Error uploading certificate file:', error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('certificates')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}