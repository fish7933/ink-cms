import { supabase } from '@/lib/supabase';
import type { ShipType, ShipSizeClassification } from '@/types/ship-classification';

// Ship Type Services
export const getShipTypes = async (): Promise<ShipType[]> => {
  const { data, error } = await supabase
    .from('ship_types')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  
  if (error) throw error;
  return data || [];
};

export const addShipType = async (shipType: Omit<ShipType, 'id' | 'created_at' | 'updated_at'>): Promise<ShipType> => {
  const { data, error } = await supabase
    .from('ship_types')
    .insert([shipType])
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateShipType = async (id: string, shipType: Partial<ShipType>): Promise<ShipType> => {
  const { data, error } = await supabase
    .from('ship_types')
    .update({ ...shipType, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteShipType = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('ship_types')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Ship Size Classification Services
export const getSizeClassifications = async (): Promise<ShipSizeClassification[]> => {
  const { data, error } = await supabase
    .from('ship_size_classifications')
    .select('*')
    .order('min_dwt', { ascending: false, nullsFirst: false })
    .order('min_gt', { ascending: false, nullsFirst: false });
  
  if (error) throw error;
  return data || [];
};

export const addSizeClassification = async (
  classification: Omit<ShipSizeClassification, 'id' | 'created_at' | 'updated_at'>
): Promise<ShipSizeClassification> => {
  const { data, error } = await supabase
    .from('ship_size_classifications')
    .insert([classification])
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateSizeClassification = async (
  id: string,
  classification: Partial<ShipSizeClassification>
): Promise<ShipSizeClassification> => {
  const { data, error } = await supabase
    .from('ship_size_classifications')
    .update({ ...classification, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteSizeClassification = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('ship_size_classifications')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Utility Functions
export const calculateDWTFromGT = (gt: number, shipTypeCategory?: string): number => {
  // Default ratios based on ship type category
  const ratios: Record<string, number> = {
    'tanker': 1.85,
    'bulk': 1.75,
    'container': 1.0,
    'general': 1.3,
    'passenger': 0.5,
    'other': 1.5,
    'default': 1.5
  };
  
  const category = shipTypeCategory?.toLowerCase() || 'default';
  const ratio = ratios[category] || ratios.default;
  
  return Math.round(gt * ratio);
};

export const getShipClassification = async (
  dwt: number, 
  gt: number, 
  shipTypeId?: string
): Promise<ShipSizeClassification | null> => {
  const classifications = await getSizeClassifications();
  
  // First, try to match by ship_type_id if provided
  let filteredClassifications = classifications;
  if (shipTypeId) {
    const typeSpecific = classifications.filter(c => c.ship_type_id === shipTypeId);
    if (typeSpecific.length > 0) {
      filteredClassifications = typeSpecific;
    }
  }
  
  // Try to match by DWT first
  const dwtMatch = filteredClassifications.find(c => {
    if (c.min_dwt && c.max_dwt) {
      return dwt >= c.min_dwt && dwt <= c.max_dwt;
    } else if (c.min_dwt) {
      return dwt >= c.min_dwt;
    } else if (c.max_dwt) {
      return dwt <= c.max_dwt;
    }
    return false;
  });
  
  if (dwtMatch) return dwtMatch;
  
  // Try to match by GT
  const gtMatch = filteredClassifications.find(c => {
    if (c.min_gt && c.max_gt) {
      return gt >= c.min_gt && gt <= c.max_gt;
    } else if (c.min_gt) {
      return gt >= c.min_gt;
    } else if (c.max_gt) {
      return gt <= c.max_gt;
    }
    return false;
  });
  
  return gtMatch || null;
};