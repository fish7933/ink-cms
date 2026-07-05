import { supabase } from '@/lib/supabase';
import type {
  AllowanceType,
  AllowanceRankRate,
  AllowanceRankRateWithDetails,
  CrewContractAllowance,
  CrewContractAllowanceWithDetails,
} from '@/types/allowance';

export const allowanceService = {
  async getTypes(includeInactive = false): Promise<AllowanceType[]> {
    let query = supabase.from('allowance_types').select('*').order('name');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) { console.error('Error fetching allowance types:', error); return []; }
    return data || [];
  },

  async createType(data: { code: string; name: string; description?: string }): Promise<AllowanceType | null> {
    const { data: result, error } = await supabase.from('allowance_types').insert(data).select().single();
    if (error) { console.error('Error creating allowance type:', error); return null; }
    return result;
  },

  async updateType(id: string, data: Partial<Pick<AllowanceType, 'name' | 'description' | 'is_active'>>): Promise<void> {
    const { error } = await supabase.from('allowance_types')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async deleteType(id: string): Promise<void> {
    const { error } = await supabase.from('allowance_types').delete().eq('id', id);
    if (error) throw error;
  },

  async getRankRates(allowanceTypeId: string): Promise<AllowanceRankRateWithDetails[]> {
    const { data, error } = await supabase
      .from('allowance_rank_rates')
      .select('*')
      .eq('allowance_type_id', allowanceTypeId);
    if (error) { console.error('Error fetching allowance rank rates:', error); return []; }
    if (!data || data.length === 0) return [];

    const { data: ranks } = await supabase.from('ranks').select('id, name, rank_code').in('id', data.map(r => r.rank_id));
    const ranksById = new Map((ranks || []).map(r => [r.id, r]));

    return data
      .map(r => ({ ...r, rank_name: ranksById.get(r.rank_id)?.name || '', rank_code: ranksById.get(r.rank_id)?.rank_code || '' }))
      .sort((a, b) => a.rank_name.localeCompare(b.rank_name));
  },

  async upsertRankRate(rate: Omit<AllowanceRankRate, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const { error } = await supabase
      .from('allowance_rank_rates')
      .upsert(rate, { onConflict: 'allowance_type_id,rank_id' });
    if (error) throw error;
  },

  async deleteRankRate(id: string): Promise<void> {
    const { error } = await supabase.from('allowance_rank_rates').delete().eq('id', id);
    if (error) throw error;
  },

  async getRankRateFor(allowanceTypeId: string, rankId: string): Promise<AllowanceRankRate | null> {
    const { data } = await supabase
      .from('allowance_rank_rates')
      .select('*')
      .eq('allowance_type_id', allowanceTypeId)
      .eq('rank_id', rankId)
      .maybeSingle();
    return data || null;
  },

  async getContractAllowances(contractId: string): Promise<CrewContractAllowanceWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_contract_allowances')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at');
    if (error) { console.error('Error fetching contract allowances:', error); return []; }
    if (!data || data.length === 0) return [];

    const { data: types } = await supabase.from('allowance_types').select('id, name').in('id', data.map(a => a.allowance_type_id));
    const typesById = new Map((types || []).map(t => [t.id, t.name]));

    return data.map(a => ({ ...a, allowance_type_name: typesById.get(a.allowance_type_id) || '' }));
  },

  async addContractAllowance(data: Omit<CrewContractAllowance, 'id' | 'created_at' | 'updated_at'>): Promise<CrewContractAllowance | null> {
    const { data: result, error } = await supabase.from('crew_contract_allowances').insert(data).select().single();
    if (error) { console.error('Error adding contract allowance:', error); return null; }
    return result;
  },

  async updateContractAllowance(id: string, data: Partial<CrewContractAllowance>): Promise<void> {
    const { error } = await supabase.from('crew_contract_allowances')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async deleteContractAllowance(id: string): Promise<void> {
    const { error } = await supabase.from('crew_contract_allowances').delete().eq('id', id);
    if (error) throw error;
  },
};
