import { supabase } from '@/lib/supabase';
import type { CrewAppointment, AppointmentDocument } from '@/types/crew-appointment';

export async function getCrewAppointments(): Promise<CrewAppointment[]> {
  const { data, error } = await supabase
    .from('crew_appointments')
    .select('*')
    .order('appointment_date', { ascending: false });

  if (error) {
    console.error('Error fetching crew appointments:', error);
    throw error;
  }

  return data || [];
}

export async function getAppointmentsByCrew(crewId: string): Promise<CrewAppointment[]> {
  const { data, error } = await supabase
    .from('crew_appointments')
    .select('*')
    .eq('crew_id', crewId)
    .order('appointment_date', { ascending: false });

  if (error) {
    console.error('Error fetching appointments by crew:', error);
    throw error;
  }

  return data || [];
}

export async function getAppointmentsByShip(shipId: string): Promise<CrewAppointment[]> {
  const { data, error } = await supabase
    .from('crew_appointments')
    .select('*')
    .eq('ship_id', shipId)
    .order('appointment_date', { ascending: false });

  if (error) {
    console.error('Error fetching appointments by ship:', error);
    throw error;
  }

  return data || [];
}

export async function getAppointmentsByStatus(status: string): Promise<CrewAppointment[]> {
  const { data, error } = await supabase
    .from('crew_appointments')
    .select('*')
    .eq('status', status)
    .order('appointment_date', { ascending: false });

  if (error) {
    console.error('Error fetching appointments by status:', error);
    throw error;
  }

  return data || [];
}

export async function addCrewAppointment(
  appointment: Omit<CrewAppointment, 'id' | 'created_at' | 'updated_at'>
): Promise<CrewAppointment> {
  const { data, error } = await supabase
    .from('crew_appointments')
    .insert(appointment)
    .select()
    .single();

  if (error) {
    console.error('Error adding crew appointment:', error);
    throw error;
  }

  return data;
}

export async function updateCrewAppointment(
  id: string,
  updates: Partial<CrewAppointment>
): Promise<CrewAppointment> {
  const { data, error } = await supabase
    .from('crew_appointments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating crew appointment:', error);
    throw error;
  }

  return data;
}

export async function deleteCrewAppointment(id: string): Promise<void> {
  const { error } = await supabase
    .from('crew_appointments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting crew appointment:', error);
    throw error;
  }
}

export async function getAppointmentDocuments(appointmentId: string): Promise<AppointmentDocument[]> {
  const { data, error } = await supabase
    .from('appointment_documents')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('generated_at', { ascending: false });

  if (error) {
    console.error('Error fetching appointment documents:', error);
    throw error;
  }

  return data || [];
}

export async function addAppointmentDocument(
  document: Omit<AppointmentDocument, 'id' | 'generated_at' | 'created_at'>
): Promise<AppointmentDocument> {
  const { data, error } = await supabase
    .from('appointment_documents')
    .insert(document)
    .select()
    .single();

  if (error) {
    console.error('Error adding appointment document:', error);
    throw error;
  }

  return data;
}