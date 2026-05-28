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
  owner_name?: string;
  fleet_name?: string;
  manning_agency_name?: string;
  age?: number;
}

interface CrewMemberRow {
  id: string;
  name: string;
  rank: string;
  nationality: string;
  date_of_birth: string;
  passport_no?: string;
  seaman_book_no?: string;
  phone: string;
  email: string;
  status: string;
  manning_agency_id?: string;
  owner_id?: string;
  fleet_id?: string;
  current_ship_id?: string;
  experience?: CrewExperience[];
  created_at: string;
  updated_at: string;
}

const calculateAge = (dateOfBirth: string): number => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

export const crewService = {
  async getAllWithDetails(filterOptions?: CrewFilterOptions): Promise<CrewWithDetails[]> {
    // Get current user to filter based on role
    const currentUser = await getCurrentUser();
    
    let query = supabase
      .from('crew_members')
      .select('*');

    // Filter based on user role - manning agency users only see their own crew
    if (currentUser && currentUser.role === 'manning_agency') {
      if (currentUser.company_id) {
        query = query.eq('manning_agency_id', currentUser.company_id);
      } else {
        // If manning agency user has no company_id, return empty array
        return [];
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching crew members:', error);
      return [];
    }

    // Get all ranks to map rank text to rank details
    const { data: ranksData } = await supabase
      .from('ranks')
      .select('*');

    const ranksMap = new Map(ranksData?.map(r => [r.name, r]) || []);

    // Get companies (owners and manning agencies)
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*');

    const companiesMap = new Map(companiesData?.map(c => [c.id, c]) || []);

    // Get fleets
    const { data: fleetsData } = await supabase
      .from('fleets')
      .select('*');

    const fleetsMap = new Map(fleetsData?.map(f => [f.id, f]) || []);

    // Get ships
    const { data: shipsData } = await supabase
      .from('ships')
      .select('*');

    const shipsMap = new Map(shipsData?.map(s => [s.id, s]) || []);

    let crewList = (data || []).map((item: CrewMemberRow) => {
      const rank = ranksMap.get(item.rank);
      const owner = item.owner_id ? companiesMap.get(item.owner_id) : undefined;
      const fleet = item.fleet_id ? fleetsMap.get(item.fleet_id) : undefined;
      const ship = item.current_ship_id ? shipsMap.get(item.current_ship_id) : undefined;
      const manningAgency = item.manning_agency_id ? companiesMap.get(item.manning_agency_id) : undefined;
      
      return {
        id: item.id,
        name: item.name,
        rank_id: rank?.id || '',
        nationality: item.nationality,
        date_of_birth: item.date_of_birth,
        passport_number: item.passport_no,
        seaman_book_number: item.seaman_book_no,
        contact_phone: item.phone,
        contact_email: item.email,
        emergency_contact: '',
        current_status: item.status as CrewStatus,
        manning_agency_id: item.manning_agency_id,
        owner_id: item.owner_id,
        fleet_id: item.fleet_id,
        current_ship_id: item.current_ship_id,
        experience: item.experience,
        created_at: item.created_at,
        updated_at: item.updated_at,
        rank_name: item.rank,
        rank_code: rank?.rank_code || '',
        rank_category: rank?.rank_category || 'rating',
        ship_name: ship?.name,
        owner_name: owner?.name,
        fleet_name: fleet?.name,
        manning_agency_name: manningAgency?.name,
        age: item.date_of_birth ? calculateAge(item.date_of_birth) : undefined,
      };
    });

    // Apply filters
    if (filterOptions) {
      if (filterOptions.searchTerm) {
        const term = filterOptions.searchTerm.toLowerCase();
        crewList = crewList.filter(crew =>
          crew.name.toLowerCase().includes(term) ||
          crew.rank_name.toLowerCase().includes(term) ||
          crew.rank_code.toLowerCase().includes(term) ||
          crew.passport_number?.toLowerCase().includes(term) ||
          crew.seaman_book_number?.toLowerCase().includes(term)
        );
      }

      if (filterOptions.owner_id) {
        crewList = crewList.filter(crew => crew.owner_id === filterOptions.owner_id);
      }

      if (filterOptions.fleet_id) {
        crewList = crewList.filter(crew => crew.fleet_id === filterOptions.fleet_id);
      }

      if (filterOptions.current_ship_id) {
        crewList = crewList.filter(crew => crew.current_ship_id === filterOptions.current_ship_id);
      }

      if (filterOptions.manning_agency_id) {
        crewList = crewList.filter(crew => crew.manning_agency_id === filterOptions.manning_agency_id);
      }

      if (filterOptions.rank) {
        crewList = crewList.filter(crew => crew.rank_id === filterOptions.rank);
      }

      if (filterOptions.rank_category) {
        crewList = crewList.filter(crew => crew.rank_category === filterOptions.rank_category);
      }

      if (filterOptions.status) {
        crewList = crewList.filter(crew => crew.current_status === filterOptions.status);
      }

      if (filterOptions.ship_type && crewList.length > 0) {
        crewList = crewList.filter(crew => {
          if (!crew.experience || crew.experience.length === 0) return false;
          return crew.experience.some(exp => 
            exp.ship_type.toLowerCase().includes(filterOptions.ship_type!.toLowerCase())
          );
        });
      }

      if (filterOptions.minAge !== undefined || filterOptions.maxAge !== undefined) {
        crewList = crewList.filter(crew => {
          if (!crew.age) return false;
          if (filterOptions.minAge !== undefined && crew.age < filterOptions.minAge) return false;
          if (filterOptions.maxAge !== undefined && crew.age > filterOptions.maxAge) return false;
          return true;
        });
      }
    }

    return crewList;
  },

  async getById(id: string): Promise<CrewMember | null> {
    const { data, error } = await supabase
      .from('crew_members')
      .select(`
        *,
        current_ship:ships!crew_members_current_ship_id_fkey(id, name, imo),
        owner:companies!crew_members_owner_id_fkey(id, name),
        fleet:fleets!crew_members_fleet_id_fkey(id, name),
        reviewer:users!crew_members_reviewer_id_fkey(id, name),
        owner_decision_user:users!crew_members_owner_decision_by_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching crew member:', error);
      return null;
    }

    return data as CrewMember;
  },

  async create(crewMember: Omit<CrewMember, 'id' | 'created_at' | 'updated_at'>): Promise<CrewMember | null> {
    // Get rank name from rank_id
    const { data: rankData } = await supabase
      .from('ranks')
      .select('name')
      .eq('id', crewMember.rank_id)
      .single();

    const { data, error } = await supabase
      .from('crew_members')
      .insert([{
        name: crewMember.name,
        rank: rankData?.name || '',
        nationality: crewMember.nationality || '',
        date_of_birth: crewMember.date_of_birth || '',
        passport_no: crewMember.passport_number || '',
        seaman_book_no: crewMember.seaman_book_number || '',
        phone: crewMember.contact_phone || '',
        email: crewMember.contact_email || '',
        status: crewMember.current_status || 'registered',
        manning_agency_id: crewMember.manning_agency_id,
        owner_id: crewMember.owner_id,
        fleet_id: crewMember.fleet_id,
        current_ship_id: crewMember.current_ship_id,
        experience: crewMember.experience || [],
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding crew member:', error);
      return null;
    }

    return data as CrewMember;
  },

  async update(id: string, updates: Partial<CrewMember>): Promise<CrewMember | null> {
    const updateData: Record<string, string | undefined | CrewExperience[]> = {};
    
    if (updates.name) updateData.name = updates.name;
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
    if (updates.photo_url !== undefined) updateData.photo_url = updates.photo_url;
    if (updates.height !== undefined) updateData.height = updates.height as unknown as string;
    if (updates.weight !== undefined) updateData.weight = updates.weight as unknown as string;
    if (updates.blood_type !== undefined) updateData.blood_type = updates.blood_type;
    if (updates.shoe_size !== undefined) updateData.shoe_size = updates.shoe_size;
    if (updates.coverall_size !== undefined) updateData.coverall_size = updates.coverall_size;
    if (updates.place_of_birth !== undefined) updateData.place_of_birth = updates.place_of_birth;
    if (updates.emergency_contacts !== undefined) updateData.emergency_contacts = updates.emergency_contacts as unknown as string;
    if (updates.certificates !== undefined) updateData.certificates = updates.certificates as unknown as string;
    if (updates.rank_id !== undefined) updateData.rank_id = updates.rank_id;
    if (updates.current_status !== undefined) updateData.current_status = updates.current_status;
    
    // Get rank name from rank_id if provided
    if (updates.rank_id) {
      const { data: rankData } = await supabase
        .from('ranks')
        .select('name')
        .eq('id', updates.rank_id)
        .single();
      
      if (rankData) updateData.rank = rankData.name;
    }

    const { data, error } = await supabase
      .from('crew_members')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating crew member:', error);
      return null;
    }

    return data as CrewMember;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('crew_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting crew member:', error);
      return false;
    }

    return true;
  },

  async updateStatus(
    crewMemberId: string,
    status: CrewStatus,
    userId: string,
    notes?: string,
    additionalData?: {
      reviewer_id?: string;
      current_ship_id?: string;
      owner_id?: string;
      fleet_id?: string;
      onboard_date?: string;
      offboard_date?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
      status_notes: notes,
      updated_at: new Date().toISOString(),
    };

    // Set timestamps and additional data based on status
    switch (status) {
      case 'on_board':
        if (additionalData?.current_ship_id) {
          updateData.current_ship_id = additionalData.current_ship_id;
        }
        updateData.onboard_date = additionalData?.onboard_date || new Date().toISOString().split('T')[0];
        break;
      case 'available':
        updateData.offboard_date = additionalData?.offboard_date || new Date().toISOString().split('T')[0];
        break;
    }

    const { error } = await supabase
      .from('crew_members')
      .update(updateData)
      .eq('id', crewMemberId);

    if (error) {
      console.error('Error updating crew status:', error);
      throw error;
    }
  },

  async getStatusHistory(crewMemberId: string): Promise<CrewStatusHistoryItem[]> {
    const { data, error } = await supabase
      .from('crew_status_history')
      .select(`
        *,
        changed_by_user:users!crew_status_history_changed_by_fkey(name)
      `)
      .eq('crew_member_id', crewMemberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching crew status history:', error);
      return [];
    }

    return data as CrewStatusHistoryItem[];
  },
};

// Legacy exports for backward compatibility
export const getCrewMembers = crewService.getAllWithDetails;
export const getCrewMemberById = crewService.getById;
export const addCrewMember = crewService.create;
export const updateCrewMember = crewService.update;
export const deleteCrewMember = crewService.delete;
export const updateCrewStatus = crewService.updateStatus;
export const getCrewStatusHistory = crewService.getStatusHistory;