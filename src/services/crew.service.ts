import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { CrewMember, CrewStatus, CrewExperience } from '@/types/models';

interface CrewFilterOptions {
  searchTerm?: string;
  rank?: string;
  nationality?: string;
  status?: string;
  owner_id?: string;
  fleet_id?: string;
  current_ship_id?: string;
  manning_agency_id?: string;
  rank_category?: 'officer' | 'rating';
  ship_type?: string;
  minAge?: number;
  maxAge?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CrewStatusHistoryItem {
  id: string;
  crew_member_id: string;
  status: string;
  changed_at: string;
  changed_by: string;
  notes?: string;
  changed_by_user?: { name: string };
}

export interface CrewWithDetails extends CrewMember {
  rank_name: string;
  rank_code: string;
  rank_category: 'officer' | 'rating';
  ship_name?: string;
  current_ship_name?: string;
  owner_name?: string;
  fleet_name?: string;
  manning_agency_name?: string;
  age?: number;
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  place_of_birth?: string;
  emergency_contacts?: Array<{ name: string; relationship: string; phone: string; note?: string }>;
  certificates?: Array<{
    name: string;
    number?: string;
    issued_date?: string;
    expiry_date?: string;
    issuing_authority?: string;
    no_expiry?: boolean;
    file_path?: string;
    file_name?: string;
  }>;
}

interface CrewMemberRow {
  id: string;
  name: string;
  rank: string;
  rank_id?: string;
  nationality: string;
  date_of_birth: string;
  passport_no?: string;
  seaman_book_no?: string;
  phone: string;
  email: string;
  status: string;
  current_status?: string;
  manning_agency_id?: string;
  owner_id?: string;
  fleet_id?: string;
  current_ship_id?: string;
  experience?: CrewExperience[];
  created_at: string;
  updated_at: string;
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  place_of_birth?: string;
  emergency_contacts?: unknown;
  certificates?: unknown;
  registration_source?: string;
  current_grade?: string;
}

const calculateAge = (dateOfBirth: string): number => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

export const crewService = {
  async getAllWithDetails(filterOptions?: CrewFilterOptions): Promise<CrewWithDetails[]> {
    const currentUser = await getCurrentUser();

    let query = supabase.from('crew_members').select('*');

    if (currentUser && currentUser.role === 'manning_agency') {
      if (currentUser.company_id) {
        query = query.eq('manning_agency_id', currentUser.company_id);
      } else {
        return [];
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching crew members:', error);
      return [];
    }

    const { data: ranksData } = await supabase.from('ranks').select('*');
    const { data: companiesData } = await supabase.from('companies').select('*');
    const { data: fleetsData } = await supabase.from('fleets').select('*');
    const { data: shipsData } = await supabase.from('ships').select('*');

    const ranksById = new Map(ranksData?.map(r => [r.id, r]) || []);
    const ranksByName = new Map(ranksData?.map(r => [r.name, r]) || []);
    const companiesMap = new Map(companiesData?.map(c => [c.id, c]) || []);
    const fleetsMap = new Map(fleetsData?.map(f => [f.id, f]) || []);
    const shipsMap = new Map(shipsData?.map(s => [s.id, s]) || []);

    let crewList = (data || []).map((item: CrewMemberRow) => {
      // rank_id 로 먼저 조회, 없으면 rank(이름)으로 조회
      const rank = item.rank_id
        ? ranksById.get(item.rank_id)
        : ranksByName.get(item.rank);
      const owner = item.owner_id ? companiesMap.get(item.owner_id) : undefined;
      const fleet = item.fleet_id ? fleetsMap.get(item.fleet_id) : undefined;
      const ship = item.current_ship_id ? shipsMap.get(item.current_ship_id) : undefined;
      const manningAgency = item.manning_agency_id ? companiesMap.get(item.manning_agency_id) : undefined;

      let emergencyContacts = item.emergency_contacts;
      if (typeof emergencyContacts === 'string') {
        try { emergencyContacts = JSON.parse(emergencyContacts); } catch { emergencyContacts = []; }
      }

      let certificates = item.certificates;
      if (typeof certificates === 'string') {
        try { certificates = JSON.parse(certificates); } catch { certificates = []; }
      }

      return {
        id: item.id,
        name: item.name,
        rank_id: item.rank_id || rank?.id || '',
        nationality: item.nationality,
        date_of_birth: item.date_of_birth,
        passport_number: item.passport_no,
        seaman_book_number: item.seaman_book_no,
        contact_phone: item.phone,
        contact_email: item.email,
        emergency_contact: '',
        status: item.status,
        current_status: (item.current_status || item.status) as CrewStatus,
        registration_source: item.registration_source,
        current_grade: item.current_grade,
        manning_agency_id: item.manning_agency_id,
        owner_id: item.owner_id,
        fleet_id: item.fleet_id,
        current_ship_id: item.current_ship_id,
        experience: item.experience,
        created_at: item.created_at,
        updated_at: item.updated_at,
        rank_name: rank?.name || item.rank || '',
        rank_code: rank?.rank_code || '',
        rank_category: rank?.rank_category || 'rating',
        ship_name: ship?.name,
        current_ship_name: ship?.name,
        owner_name: owner?.name,
        fleet_name: fleet?.name,
        manning_agency_name: manningAgency?.name,
        age: item.date_of_birth ? calculateAge(item.date_of_birth) : undefined,
        photo_url: item.photo_url || '',
        height: item.height,
        weight: item.weight,
        blood_type: item.blood_type || '',
        shoe_size: item.shoe_size || '',
        coverall_size: item.coverall_size || '',
        place_of_birth: item.place_of_birth || '',
        emergency_contacts: Array.isArray(emergencyContacts) ? emergencyContacts : [],
        certificates: Array.isArray(certificates) ? certificates : [],
      };
    });

    if (filterOptions) {
      if (filterOptions.searchTerm) {
        const term = filterOptions.searchTerm.toLowerCase();
        crewList = crewList.filter(c =>
          c.name.toLowerCase().includes(term) ||
          c.rank_name.toLowerCase().includes(term) ||
          c.rank_code.toLowerCase().includes(term) ||
          c.passport_number?.toLowerCase().includes(term) ||
          c.seaman_book_number?.toLowerCase().includes(term)
        );
      }
      if (filterOptions.owner_id) crewList = crewList.filter(c => c.owner_id === filterOptions.owner_id);
      if (filterOptions.fleet_id) crewList = crewList.filter(c => c.fleet_id === filterOptions.fleet_id);
      if (filterOptions.current_ship_id) crewList = crewList.filter(c => c.current_ship_id === filterOptions.current_ship_id);
      if (filterOptions.manning_agency_id) crewList = crewList.filter(c => c.manning_agency_id === filterOptions.manning_agency_id);
      if (filterOptions.rank) crewList = crewList.filter(c => c.rank_id === filterOptions.rank);
      if (filterOptions.rank_category) crewList = crewList.filter(c => c.rank_category === filterOptions.rank_category);
      if (filterOptions.status) crewList = crewList.filter(c => c.current_status === filterOptions.status);
      if (filterOptions.minAge !== undefined || filterOptions.maxAge !== undefined) {
        crewList = crewList.filter(c => {
          if (!c.age) return false;
          if (filterOptions.minAge !== undefined && c.age < filterOptions.minAge) return false;
          if (filterOptions.maxAge !== undefined && c.age > filterOptions.maxAge) return false;
          return true;
        });
      }
    }

    return crewList;
  },

  async getById(id: string): Promise<CrewMember | null> {
    const { data, error } = await supabase.from('crew_members').select('*').eq('id', id).single();
    if (error) { console.error('Error fetching crew member:', error); return null; }
    return data as CrewMember;
  },

  async create(crewMember: Omit<CrewMember, 'id' | 'created_at' | 'updated_at'>): Promise<CrewWithDetails | null> {
    const { data: rankData } = await supabase.from('ranks').select('name').eq('id', crewMember.rank_id).single();

    const { data, error } = await supabase.from('crew_members').insert([{
      name: crewMember.name,
      rank: rankData?.name || '',
      rank_id: crewMember.rank_id,
      nationality: crewMember.nationality || '',
      date_of_birth: crewMember.date_of_birth || '',
      passport_no: crewMember.passport_number || '',
      seaman_book_no: crewMember.seaman_book_number || '',
      phone: crewMember.contact_phone || '',
      email: crewMember.contact_email || '',
      status: crewMember.current_status || 'registered',
      current_status: crewMember.current_status || 'registered',
      manning_agency_id: crewMember.manning_agency_id,
      owner_id: crewMember.owner_id,
      fleet_id: crewMember.fleet_id,
      current_ship_id: crewMember.current_ship_id,
      experience: crewMember.experience || [],
    }]).select().single();

    if (error) { console.error('Error adding crew member:', error); return null; }
    return data as unknown as CrewWithDetails;
  },

  async update(id: string, updates: Partial<CrewMember>): Promise<CrewMember | null> {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.nationality !== undefined) updateData.nationality = updates.nationality;
    if (updates.date_of_birth !== undefined) updateData.date_of_birth = updates.date_of_birth;
    if (updates.passport_number !== undefined) updateData.passport_no = updates.passport_number;
    if (updates.seaman_book_number !== undefined) updateData.seaman_book_no = updates.seaman_book_number;
    if (updates.contact_phone !== undefined) updateData.phone = updates.contact_phone;
    if (updates.contact_email !== undefined) updateData.email = updates.contact_email;
    if (updates.manning_agency_id !== undefined) updateData.manning_agency_id = updates.manning_agency_id;
    if (updates.owner_id !== undefined) updateData.owner_id = updates.owner_id;
    if (updates.fleet_id !== undefined) updateData.fleet_id = updates.fleet_id;
    if (updates.current_ship_id !== undefined) updateData.current_ship_id = updates.current_ship_id;
    if (updates.experience !== undefined) updateData.experience = updates.experience;
    if (updates.rank_id !== undefined) {
      updateData.rank_id = updates.rank_id;
      const { data: rd } = await supabase.from('ranks').select('name').eq('id', updates.rank_id).single();
      if (rd) updateData.rank = rd.name;
    }
    if (updates.current_status !== undefined) { updateData.current_status = updates.current_status; updateData.status = updates.current_status; }

    const { data, error } = await supabase.from('crew_members').update(updateData).eq('id', id).select().single();
    if (error) { console.error('Error updating crew member:', error); return null; }
    return data as CrewMember;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('crew_members').delete().eq('id', id);
    if (error) { console.error('Error deleting crew member:', error); return false; }
    return true;
  },

  async updateStatus(
    crewMemberId: string,
    status: CrewStatus,
    userId: string,
    notes?: string,
    additionalData?: {
      current_ship_id?: string;
      owner_id?: string;
      fleet_id?: string;
      onboard_date?: string;
      offboard_date?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
      current_status: status,
      status_notes: notes,
      updated_at: new Date().toISOString(),
    };
    if (status === 'on_board') {
      if (additionalData?.current_ship_id) updateData.current_ship_id = additionalData.current_ship_id;
      updateData.onboard_date = additionalData?.onboard_date || new Date().toISOString().split('T')[0];
    }
    if (status === 'available') {
      updateData.offboard_date = additionalData?.offboard_date || new Date().toISOString().split('T')[0];
    }
    const { error } = await supabase.from('crew_members').update(updateData).eq('id', crewMemberId);
    if (error) { console.error('Error updating crew status:', error); throw error; }
  },

  async getStatusHistory(crewMemberId: string): Promise<CrewStatusHistoryItem[]> {
    const { data, error } = await supabase
      .from('crew_status_history')
      .select('*, changed_by_user:users!crew_status_history_changed_by_fkey(name)')
      .eq('crew_member_id', crewMemberId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching crew status history:', error); return []; }
    return data as CrewStatusHistoryItem[];
  },
};

export const getCrewMembers = crewService.getAllWithDetails;
export const getCrewMemberById = crewService.getById;
export const addCrewMember = crewService.create;
export const updateCrewMember = crewService.update;
export const deleteCrewMember = crewService.delete;
export const updateCrewStatus = crewService.updateStatus;
export const getCrewStatusHistory = crewService.getStatusHistory;