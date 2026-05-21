import { supabase } from '@/lib/supabase';
import type { Ship, ShipFilterOptions } from '@/types/models';

export async function getShips(filterOptions?: ShipFilterOptions): Promise<Ship[]> {
  let query = supabase.from('ships').select('*');

  if (filterOptions) {
    if (filterOptions.searchTerm) {
      query = query.or(`name.ilike.%${filterOptions.searchTerm}%,imo.ilike.%${filterOptions.searchTerm}%`);
    }

    if (filterOptions.minDwt !== undefined) {
      query = query.gte('dwt', filterOptions.minDwt);
    }
    if (filterOptions.maxDwt !== undefined) {
      query = query.lte('dwt', filterOptions.maxDwt);
    }

    if (filterOptions.minGt !== undefined) {
      query = query.gte('gt', filterOptions.minGt);
    }
    if (filterOptions.maxGt !== undefined) {
      query = query.lte('gt', filterOptions.maxGt);
    }

    if (filterOptions.fleetGroup) {
      query = query.eq('fleet_group', filterOptions.fleetGroup);
    }

    if (filterOptions.route) {
      query = query.eq('route', filterOptions.route);
    }

    const sortBy = filterOptions.sortBy || 'created_at';
    const sortOrder = filterOptions.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching ships:', error);
    return [];
  }

  return data as Ship[];
}

export async function addShip(ship: Omit<Ship, 'id'>): Promise<Ship | null> {
  const { data, error } = await supabase
    .from('ships')
    .insert([ship])
    .select()
    .single();

  if (error) {
    console.error('Error adding ship:', error);
    return null;
  }

  return data as Ship;
}

export async function updateShip(id: string, updates: Partial<Ship>): Promise<Ship | null> {
  const { data, error } = await supabase
    .from('ships')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating ship:', error);
    return null;
  }

  return data as Ship;
}

export async function deleteShip(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('ships')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting ship:', error);
    return false;
  }

  return true;
}