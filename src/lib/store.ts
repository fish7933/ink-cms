import { supabase } from './supabase';
import { sortRanksByDisplayOrder } from './rank-order';
import { login as authLogin, logout as authLogout, getCurrentUser as authGetCurrentUser } from '@/services/auth.service';
import type { 
  User, 
  Company, 
  Fleet, 
  Ship, 
  CrewMember, 
  SalaryTable, 
  JobPosting, 
  JobApplication,
  CrewAssignment,
  Rank
} from '@/types/models';

// Authentication - now using the auth service
export const login = async (username: string, password: string) => {
  return await authLogin(username, password);
};

export const logout = async (): Promise<void> => {
  await authLogout();
};

// User Management
export const getCurrentUser = async (): Promise<User | null> => {
  return await authGetCurrentUser();
};

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Get ship owner users for manager assignment
export const getShipOwnerUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'ship_owner')
    .order('username');

  if (error) throw error;
  return data || [];
};

// Company Management
export const getCompanies = async (): Promise<Company[]> => {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
};

export const addCompany = async (company: Omit<Company, 'id' | 'created_at' | 'updated_at'>): Promise<Company> => {
  const { data, error } = await supabase
    .from('companies')
    .insert([company])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateCompany = async (id: string, company: Partial<Company>): Promise<Company> => {
  const { data, error } = await supabase
    .from('companies')
    .update({ ...company, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Check company dependencies before deletion
export const checkCompanyDependencies = async (id: string): Promise<{
  crewCount: number;
  shipCount: number;
  fleetCount: number;
  canDelete: boolean;
}> => {
  // Check crew members
  const { data: crewMembers, error: crewError } = await supabase
    .from('crew_members')
    .select('id')
    .eq('owner_id', id);

  if (crewError) throw crewError;

  // Check ships
  const { data: ships, error: shipsError } = await supabase
    .from('ships')
    .select('id')
    .eq('owner_id', id);

  if (shipsError) throw shipsError;

  // Check fleets
  const { data: fleets, error: fleetsError } = await supabase
    .from('fleets')
    .select('id')
    .eq('owner_id', id);

  if (fleetsError) throw fleetsError;

  const crewCount = crewMembers?.length || 0;
  const shipCount = ships?.length || 0;
  const fleetCount = fleets?.length || 0;

  return {
    crewCount,
    shipCount,
    fleetCount,
    canDelete: true, // We can always delete, but we need to clean up dependencies
  };
};

// Delete company with automatic dependency handling
export const deleteCompany = async (id: string): Promise<void> => {
  // Step 1: Update crew members - set owner_id to NULL
  const { error: crewUpdateError } = await supabase
    .from('crew_members')
    .update({ owner_id: null })
    .eq('owner_id', id);

  if (crewUpdateError) throw crewUpdateError;

  // Step 2: Update ships - set owner_id to NULL
  const { error: shipsUpdateError } = await supabase
    .from('ships')
    .update({ owner_id: null })
    .eq('owner_id', id);

  if (shipsUpdateError) throw shipsUpdateError;

  // Step 3: Delete fleets owned by this company
  const { data: fleets, error: fleetsError } = await supabase
    .from('fleets')
    .select('id')
    .eq('owner_id', id);

  if (fleetsError) throw fleetsError;

  if (fleets && fleets.length > 0) {
    for (const fleet of fleets) {
      await deleteFleet(fleet.id);
    }
  }

  // Step 4: Finally delete the company
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Fleet Management
export const getFleets = async (ownerId?: string): Promise<Fleet[]> => {
  let query = supabase
    .from('fleets')
    .select('*');

  // If ownerId is provided, filter by owner_id
  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query.order('name');

  if (error) throw error;
  return data || [];
};

export const addFleet = async (fleet: Omit<Fleet, 'id' | 'created_at' | 'updated_at'>): Promise<Fleet> => {
  const { data, error } = await supabase
    .from('fleets')
    .insert([fleet])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateFleet = async (id: string, fleet: Partial<Fleet>): Promise<Fleet> => {
  const { data, error } = await supabase
    .from('fleets')
    .update({ ...fleet, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Check fleet dependencies before deletion
export const checkFleetDependencies = async (id: string): Promise<{
  crewCount: number;
  shipCount: number;
  salaryAssignmentCount: number;
  canDelete: boolean;
}> => {
  // Check crew members
  const { data: crewMembers, error: crewError } = await supabase
    .from('crew_members')
    .select('id')
    .eq('fleet_id', id);

  if (crewError) throw crewError;

  // Check ships
  const { data: ships, error: shipsError } = await supabase
    .from('ships')
    .select('id')
    .eq('fleet_id', id);

  if (shipsError) throw shipsError;

  // Check salary assignments
  const { data: salaryAssignments, error: salaryError } = await supabase
    .from('fleet_salary_assignments')
    .select('id')
    .eq('fleet_id', id);

  if (salaryError) throw salaryError;

  const crewCount = crewMembers?.length || 0;
  const shipCount = ships?.length || 0;
  const salaryAssignmentCount = salaryAssignments?.length || 0;

  return {
    crewCount,
    shipCount,
    salaryAssignmentCount,
    canDelete: true, // We can always delete, but we need to clean up dependencies
  };
};

// Delete fleet with automatic dependency handling
export const deleteFleet = async (id: string): Promise<void> => {
  // Step 1: Update crew members - set fleet_id to NULL
  const { error: crewUpdateError } = await supabase
    .from('crew_members')
    .update({ fleet_id: null })
    .eq('fleet_id', id);

  if (crewUpdateError) throw crewUpdateError;

  // Step 2: Update ships - set fleet_id to NULL
  const { error: shipsUpdateError } = await supabase
    .from('ships')
    .update({ fleet_id: null })
    .eq('fleet_id', id);

  if (shipsUpdateError) throw shipsUpdateError;

  // Step 3: Delete salary assignments
  const { error: salaryDeleteError } = await supabase
    .from('fleet_salary_assignments')
    .delete()
    .eq('fleet_id', id);

  if (salaryDeleteError) throw salaryDeleteError;

  // Step 4: Finally delete the fleet
  const { error } = await supabase
    .from('fleets')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Ship Management
export const getShips = async (): Promise<Ship[]> => {
  const { data, error } = await supabase
    .from('ships')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
};

export const addShip = async (ship: Omit<Ship, 'id' | 'created_at' | 'updated_at'>): Promise<Ship> => {
  const { data, error } = await supabase
    .from('ships')
    .insert([ship])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateShip = async (id: string, ship: Partial<Ship>): Promise<Ship> => {
  const { data, error } = await supabase
    .from('ships')
    .update({ ...ship, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteShip = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('ships')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Get effective manager for a ship (with priority logic)
export const getEffectiveManager = async (shipId: string): Promise<User | null> => {
  // Get ship with its fleet and owner info
  const { data: ship, error: shipError } = await supabase
    .from('ships')
    .select('manager_id, fleet_id, owner_id')
    .eq('id', shipId)
    .single();

  if (shipError || !ship) return null;

  // Priority 1: Ship manager
  if (ship.manager_id) {
    const { data: manager } = await supabase
      .from('users')
      .select('*')
      .eq('id', ship.manager_id)
      .single();
    if (manager) return manager;
  }

  // Priority 2: Fleet manager
  if (ship.fleet_id) {
    const { data: fleet } = await supabase
      .from('fleets')
      .select('manager_id')
      .eq('id', ship.fleet_id)
      .single();
    
    if (fleet?.manager_id) {
      const { data: manager } = await supabase
        .from('users')
        .select('*')
        .eq('id', fleet.manager_id)
        .single();
      if (manager) return manager;
    }
  }

  // Priority 3: Owner (company) manager
  if (ship.owner_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('manager_id')
      .eq('id', ship.owner_id)
      .single();
    
    if (company?.manager_id) {
      const { data: manager } = await supabase
        .from('users')
        .select('*')
        .eq('id', company.manager_id)
        .single();
      if (manager) return manager;
    }
  }

  return null;
};

// Rank Management
export const getRanks = async (): Promise<Rank[]> => {
  const { data, error } = await supabase
    .from('ranks')
    .select('*');

  if (error) throw error;
  return sortRanksByDisplayOrder(data || []);
};

export const addRank = async (rank: Omit<Rank, 'id' | 'created_at'>): Promise<Rank> => {
  const { data, error } = await supabase
    .from('ranks')
    .insert([rank])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateRank = async (id: string, rank: Partial<Rank>): Promise<Rank> => {
  const { data, error } = await supabase
    .from('ranks')
    .update(rank)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteRank = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('ranks')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Crew Member Management
export const getCrewMembers = async (): Promise<CrewMember[]> => {
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
};

export const addCrewMember = async (crew: Omit<CrewMember, 'id' | 'created_at' | 'updated_at'>): Promise<CrewMember> => {
  const { data, error } = await supabase
    .from('crew_members')
    .insert([crew])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateCrewMember = async (id: string, crew: Partial<CrewMember>): Promise<CrewMember> => {
  const { data, error } = await supabase
    .from('crew_members')
    .update({ ...crew, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteCrewMember = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Salary Table Management
export const getSalaryTables = async (): Promise<SalaryTable[]> => {
  const { data, error } = await supabase
    .from('salary_tables')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addSalaryTable = async (salary: Omit<SalaryTable, 'id' | 'created_at' | 'updated_at'>): Promise<SalaryTable> => {
  const { data, error } = await supabase
    .from('salary_tables')
    .insert([salary])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateSalaryTable = async (id: string, salary: Partial<SalaryTable>): Promise<SalaryTable> => {
  const { data, error } = await supabase
    .from('salary_tables')
    .update({ ...salary, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteSalaryTable = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('salary_tables')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Job Posting Management
export const getJobPostings = async (): Promise<JobPosting[]> => {
  const { data, error } = await supabase
    .from('job_postings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addJobPosting = async (posting: Omit<JobPosting, 'id' | 'created_at' | 'updated_at'>): Promise<JobPosting> => {
  const { data, error } = await supabase
    .from('job_postings')
    .insert([posting])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateJobPosting = async (id: string, posting: Partial<JobPosting>): Promise<JobPosting> => {
  const { data, error } = await supabase
    .from('job_postings')
    .update({ ...posting, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteJobPosting = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('job_postings')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Job Application Management
export const getJobApplications = async (): Promise<JobApplication[]> => {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*')
    .order('applied_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addJobApplication = async (application: Omit<JobApplication, 'id' | 'applied_at' | 'updated_at'>): Promise<JobApplication> => {
  const { data, error } = await supabase
    .from('job_applications')
    .insert([application])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateJobApplication = async (id: string, application: Partial<JobApplication>): Promise<JobApplication> => {
  const { data, error } = await supabase
    .from('job_applications')
    .update({ ...application, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateJobApplicationStatus = async (id: string, status: JobApplication['status']): Promise<JobApplication> => {
  const { data, error } = await supabase
    .from('job_applications')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteJobApplication = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('job_applications')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Crew Assignment Management
export const getCrewAssignments = async (): Promise<CrewAssignment[]> => {
  const { data, error } = await supabase
    .from('crew_assignments')
    .select('*')
    .order('sign_on_date', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addCrewAssignment = async (assignment: Omit<CrewAssignment, 'id' | 'created_at' | 'updated_at'>): Promise<CrewAssignment> => {
  const { data, error } = await supabase
    .from('crew_assignments')
    .insert([assignment])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateCrewAssignment = async (id: string, assignment: Partial<CrewAssignment>): Promise<CrewAssignment> => {
  const { data, error } = await supabase
    .from('crew_assignments')
    .update({ ...assignment, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteCrewAssignment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('crew_assignments')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Export types for convenience
export type { User, Company, Fleet, Ship, CrewMember, SalaryTable, JobPosting, JobApplication, CrewAssignment, Rank };