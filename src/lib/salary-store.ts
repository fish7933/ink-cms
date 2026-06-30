import { supabase } from './supabase';
import { getCurrentUser } from './store';

// Types
export interface SalaryComponent {
  id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  component_type: 'earning' | 'deduction'; // 급여 구성 항목 vs 공제 항목
  payment_type: 'monthly' | 'deferred';    // 매월 지급 vs 후불성(하선 후)
  created_at: string;
  updated_at: string;
}

export interface SalaryTemplate {
  id: string;
  name: string;
  description?: string;
  rank?: string; // Deprecated, kept for backward compatibility
  currency: string;
  company_id?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SalaryTemplateRank {
  id: string;
  template_id: string;
  rank: string;
  created_at: string;
  updated_at: string;
}

export interface SalaryTemplateItem {
  id: string;
  template_id: string;
  component_id: string;
  rank?: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface SalaryTemplateWithItems extends SalaryTemplate {
  ranks: string[];
  items: (SalaryTemplateItem & { component: SalaryComponent })[];
  total_amount: number;
}

export interface ShipSalaryAssignment {
  id: string;
  ship_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface FleetSalaryAssignment {
  id: string;
  fleet_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface OwnerSalaryAssignment {
  id: string;
  owner_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

// Salary Component functions
export async function getSalaryComponents(): Promise<SalaryComponent[]> {
  const { data, error } = await supabase
    .from('salary_components')
    .select('id, name, description, display_order, is_active, component_type, payment_type, created_at, updated_at')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching salary components:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    component_type: (item.component_type ?? 'earning') as 'earning' | 'deduction',
    payment_type: (item.payment_type ?? 'monthly') as 'monthly' | 'deferred',
  })) as SalaryComponent[];
}

export async function addSalaryComponent(component: Omit<SalaryComponent, 'id' | 'created_at' | 'updated_at'>): Promise<SalaryComponent | null> {
  const { data, error } = await supabase
    .from('salary_components')
    .insert([component])
    .select()
    .single();

  if (error) {
    console.error('Error adding salary component:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id) } as SalaryComponent : null;
}

export async function updateSalaryComponent(id: string, updates: Partial<SalaryComponent>): Promise<SalaryComponent | null> {
  const { data, error } = await supabase
    .from('salary_components')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating salary component:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id) } as SalaryComponent : null;
}

export async function deleteSalaryComponent(id: string): Promise<boolean> {
  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('salary_components')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting salary component:', error);
    return false;
  }

  return true;
}

// Salary Template functions
export async function getSalaryTemplates(): Promise<SalaryTemplate[]> {
  const { data, error } = await supabase
    .from('salary_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching salary templates:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    company_id: item.company_id ? String(item.company_id) : undefined,
  })) as SalaryTemplate[];
}

export async function getSalaryTemplateWithItems(templateId: string): Promise<SalaryTemplateWithItems | null> {
  // Fetch template
  const { data: template, error: templateError } = await supabase
    .from('salary_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    console.error('Error fetching salary template:', templateError);
    return null;
  }

  // Fetch template ranks
  const { data: templateRanks, error: ranksError } = await supabase
    .from('salary_template_ranks')
    .select('rank')
    .eq('template_id', templateId);

  if (ranksError) {
    console.error('Error fetching salary template ranks:', ranksError);
    return null;
  }

  const ranks = templateRanks?.map(tr => tr.rank) || [];

  // Fetch template items (flat query, no nested select)
  const { data: items, error: itemsError } = await supabase
    .from('salary_template_items')
    .select('*')
    .eq('template_id', templateId);

  if (itemsError) {
    console.error('Error fetching salary template items:', itemsError);
    return null;
  }

  // Fetch all active components to join manually
  const { data: allComponents, error: compError } = await supabase
    .from('salary_components')
    .select('*');

  if (compError) {
    console.error('Error fetching salary components:', compError);
    return null;
  }

  const componentsMap = new Map<string, SalaryComponent>();
  (allComponents || []).forEach(c => {
    componentsMap.set(String(c.id), { ...c, id: String(c.id) } as SalaryComponent);
  });

  // Join items with components manually
  const itemsWithComponents = (items || []).map(item => {
    const component = componentsMap.get(String(item.component_id));
    return {
      ...item,
      id: String(item.id),
      template_id: String(item.template_id),
      component_id: String(item.component_id),
      component: component || { id: String(item.component_id), name: 'Unknown', description: '', display_order: 0, is_active: true, component_type: 'earning' as const, payment_type: 'monthly' as const, created_at: '', updated_at: '' },
    };
  });

  const total_amount = itemsWithComponents.reduce((sum, item) => sum + Number(item.amount), 0);

  return {
    ...template,
    id: String(template.id),
    company_id: template.company_id ? String(template.company_id) : undefined,
    ranks,
    items: itemsWithComponents,
    total_amount,
  } as SalaryTemplateWithItems;
}

export async function addSalaryTemplate(
  template: { name: string; description?: string; currency: string; is_active: boolean },
  ranks: string[],
  items: { rank: string; component_id: string; amount: number }[]
): Promise<SalaryTemplate | null> {
  const currentUser = await getCurrentUser();
  
  // Insert template (no company_id - templates are shared across companies via assignments)
  const { data: newTemplate, error: templateError } = await supabase
    .from('salary_templates')
    .insert([{ ...template, created_by: currentUser?.id }])
    .select()
    .single();

  if (templateError || !newTemplate) {
    console.error('Error adding salary template:', templateError);
    return null;
  }

  const newTemplateId = String(newTemplate.id);

  // Insert template ranks
  if (ranks.length > 0) {
    const templateRanks = ranks.map(rank => ({
      template_id: newTemplateId,
      rank: rank,
    }));

    const { error: ranksError } = await supabase
      .from('salary_template_ranks')
      .insert(templateRanks);

    if (ranksError) {
      console.error('Error adding salary template ranks:', ranksError);
      // Rollback: delete the template
      await supabase.from('salary_templates').delete().eq('id', newTemplateId);
      return null;
    }
  }

  // Insert template items
  if (items.length > 0) {
    const templateItems = items.map(item => ({
      template_id: newTemplateId,
      component_id: item.component_id,
      rank: item.rank,
      amount: item.amount,
    }));

    const { error: itemsError } = await supabase
      .from('salary_template_items')
      .insert(templateItems);

    if (itemsError) {
      console.error('Error adding salary template items:', itemsError);
      // Rollback: delete the template and ranks
      await supabase.from('salary_template_ranks').delete().eq('template_id', newTemplateId);
      await supabase.from('salary_templates').delete().eq('id', newTemplateId);
      return null;
    }
  }

  return { ...newTemplate, id: newTemplateId } as SalaryTemplate;
}

export async function updateSalaryTemplate(
  id: string,
  template: Partial<SalaryTemplate>,
  ranks?: string[],
  items?: { rank: string; component_id: string; amount: number }[]
): Promise<SalaryTemplate | null> {
  // Update template
  const { data: updatedTemplate, error: templateError } = await supabase
    .from('salary_templates')
    .update(template)
    .eq('id', id)
    .select()
    .single();

  if (templateError || !updatedTemplate) {
    console.error('Error updating salary template:', templateError);
    return null;
  }

  // Update ranks if provided
  if (ranks) {
    // Delete existing ranks
    await supabase
      .from('salary_template_ranks')
      .delete()
      .eq('template_id', id);

    // Insert new ranks
    if (ranks.length > 0) {
      const templateRanks = ranks.map(rank => ({
        template_id: id,
        rank: rank,
      }));

      const { error: ranksError } = await supabase
        .from('salary_template_ranks')
        .insert(templateRanks);

      if (ranksError) {
        console.error('Error updating salary template ranks:', ranksError);
        return null;
      }
    }
  }

  // Update items if provided
  if (items) {
    // Delete existing items
    await supabase
      .from('salary_template_items')
      .delete()
      .eq('template_id', id);

    // Insert new items
    if (items.length > 0) {
      const templateItems = items.map(item => ({
        template_id: id,
        component_id: item.component_id,
        rank: item.rank,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('salary_template_items')
        .insert(templateItems);

      if (itemsError) {
        console.error('Error updating salary template items:', itemsError);
        return null;
      }
    }
  }

  return { ...updatedTemplate, id: String(updatedTemplate.id) } as SalaryTemplate;
}

export async function deleteSalaryTemplate(id: string): Promise<boolean> {
  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('salary_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting salary template:', error);
    return false;
  }

  return true;
}

// Ship Salary Assignment functions
export async function getShipSalaryAssignments(shipId?: string): Promise<ShipSalaryAssignment[]> {
  let query = supabase.from('ship_salary_assignments').select('*');
  
  if (shipId) {
    query = query.eq('ship_id', shipId);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error fetching ship salary assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    ship_id: String(item.ship_id),
    template_id: String(item.template_id),
  })) as ShipSalaryAssignment[];
}

export async function assignTemplateToShip(shipId: string, templateId: string): Promise<ShipSalaryAssignment | null> {
  const currentUser = await getCurrentUser();

  const { data, error } = await supabase
    .from('ship_salary_assignments')
    .insert([{
      ship_id: shipId,
      template_id: templateId,
      assigned_by: currentUser?.id,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error assigning template to ship:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id), ship_id: String(data.ship_id), template_id: String(data.template_id) } as ShipSalaryAssignment : null;
}

export async function unassignTemplateFromShip(shipId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('ship_salary_assignments')
    .delete()
    .eq('ship_id', shipId)
    .eq('template_id', templateId);

  if (error) {
    console.error('Error unassigning template from ship:', error);
    return false;
  }

  return true;
}

export async function getTemplatesByShip(shipId: string): Promise<SalaryTemplateWithItems[]> {
  const { data: assignments, error } = await supabase
    .from('ship_salary_assignments')
    .select('template_id')
    .eq('ship_id', shipId);

  if (error || !assignments) {
    console.error('Error fetching ship templates:', error);
    return [];
  }

  const templates: SalaryTemplateWithItems[] = [];
  for (const assignment of assignments) {
    const template = await getSalaryTemplateWithItems(String(assignment.template_id));
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

// Fleet Salary Assignment functions
export async function getFleetSalaryAssignments(fleetId?: string): Promise<FleetSalaryAssignment[]> {
  let query = supabase.from('fleet_salary_assignments').select('*');
  
  if (fleetId) {
    query = query.eq('fleet_id', fleetId);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error fetching fleet salary assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    fleet_id: String(item.fleet_id),
    template_id: String(item.template_id),
  })) as FleetSalaryAssignment[];
}

export async function assignTemplateToFleet(fleetId: string, templateId: string): Promise<FleetSalaryAssignment | null> {
  const currentUser = await getCurrentUser();

  const { data, error } = await supabase
    .from('fleet_salary_assignments')
    .insert([{
      fleet_id: fleetId,
      template_id: templateId,
      assigned_by: currentUser?.id,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error assigning template to fleet:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id), fleet_id: String(data.fleet_id), template_id: String(data.template_id) } as FleetSalaryAssignment : null;
}

export async function unassignTemplateFromFleet(fleetId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('fleet_salary_assignments')
    .delete()
    .eq('fleet_id', fleetId)
    .eq('template_id', templateId);

  if (error) {
    console.error('Error unassigning template from fleet:', error);
    return false;
  }

  return true;
}

export async function getTemplatesByFleet(fleetId: string): Promise<SalaryTemplateWithItems[]> {
  const { data: assignments, error } = await supabase
    .from('fleet_salary_assignments')
    .select('template_id')
    .eq('fleet_id', fleetId);

  if (error || !assignments) {
    console.error('Error fetching fleet templates:', error);
    return [];
  }

  const templates: SalaryTemplateWithItems[] = [];
  for (const assignment of assignments) {
    const template = await getSalaryTemplateWithItems(String(assignment.template_id));
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

// Owner Salary Assignment functions
export async function getOwnerSalaryAssignments(ownerId?: string): Promise<OwnerSalaryAssignment[]> {
  let query = supabase.from('owner_salary_assignments').select('*');
  
  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error fetching owner salary assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    owner_id: String(item.owner_id),
    template_id: String(item.template_id),
  })) as OwnerSalaryAssignment[];
}

export async function assignTemplateToOwner(ownerId: string, templateId: string): Promise<OwnerSalaryAssignment | null> {
  const currentUser = await getCurrentUser();

  const { data, error } = await supabase
    .from('owner_salary_assignments')
    .insert([{
      owner_id: ownerId,
      template_id: templateId,
      assigned_by: currentUser?.id,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error assigning template to owner:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id), owner_id: String(data.owner_id), template_id: String(data.template_id) } as OwnerSalaryAssignment : null;
}

export async function unassignTemplateFromOwner(ownerId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('owner_salary_assignments')
    .delete()
    .eq('owner_id', ownerId)
    .eq('template_id', templateId);

  if (error) {
    console.error('Error unassigning template from owner:', error);
    return false;
  }

  return true;
}

export async function getTemplatesByOwner(ownerId: string): Promise<SalaryTemplateWithItems[]> {
  const { data: assignments, error } = await supabase
    .from('owner_salary_assignments')
    .select('template_id')
    .eq('owner_id', ownerId);

  if (error || !assignments) {
    console.error('Error fetching owner templates:', error);
    return [];
  }

  const templates: SalaryTemplateWithItems[] = [];
  for (const assignment of assignments) {
    const template = await getSalaryTemplateWithItems(String(assignment.template_id));
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

/**
 * Clean up lower-level assignments when assigning at a higher level.
 * 
 * When assigning to a FLEET:
 *   - Remove all ship-level assignments for ships belonging to that fleet (any template)
 * 
 * When assigning to an OWNER:
 *   - Remove all fleet-level assignments for fleets belonging to that owner (any template)
 *   - Remove all ship-level assignments for ships belonging to that owner (any template)
 */
export async function cleanupLowerLevelAssignments(
  level: 'fleet' | 'owner',
  entityId: string,
): Promise<{ removedShips: number; removedFleets: number }> {
  let removedShips = 0;
  let removedFleets = 0;

  if (level === 'fleet') {
    // Get all ships belonging to this fleet
    const { data: ships } = await supabase
      .from('ships')
      .select('id')
      .eq('fleet_id', entityId);

    if (ships && ships.length > 0) {
      const shipIds = ships.map(s => String(s.id));

      // Get all ship assignments for these ships
      const allShipAssignments = await getShipSalaryAssignments();
      const toRemove = allShipAssignments.filter(a => shipIds.includes(String(a.ship_id)));

      for (const assignment of toRemove) {
        const success = await unassignTemplateFromShip(assignment.ship_id, assignment.template_id);
        if (success) removedShips++;
      }
    }
  } else if (level === 'owner') {
    // Get all fleets belonging to this owner
    const { data: fleets } = await supabase
      .from('fleets')
      .select('id')
      .eq('owner_id', entityId);

    const fleetIds = (fleets || []).map(f => String(f.id));

    // Get all ships belonging to this owner (via fleet or direct owner_id)
    const { data: allShips } = await supabase
      .from('ships')
      .select('id, fleet_id, owner_id');

    const ownerShipIds: string[] = [];
    if (allShips) {
      for (const ship of allShips) {
        const shipFleetId = ship.fleet_id ? String(ship.fleet_id) : '';
        const shipOwnerId = ship.owner_id ? String(ship.owner_id) : '';
        if (shipOwnerId === entityId || fleetIds.includes(shipFleetId)) {
          ownerShipIds.push(String(ship.id));
        }
      }
    }

    // Remove fleet-level assignments for fleets belonging to this owner
    if (fleetIds.length > 0) {
      const allFleetAssignments = await getFleetSalaryAssignments();
      const fleetsToRemove = allFleetAssignments.filter(a => fleetIds.includes(String(a.fleet_id)));

      for (const assignment of fleetsToRemove) {
        const success = await unassignTemplateFromFleet(assignment.fleet_id, assignment.template_id);
        if (success) removedFleets++;
      }
    }

    // Remove ship-level assignments for ships belonging to this owner
    if (ownerShipIds.length > 0) {
      const allShipAssignments = await getShipSalaryAssignments();
      const shipsToRemove = allShipAssignments.filter(a => ownerShipIds.includes(String(a.ship_id)));

      for (const assignment of shipsToRemove) {
        const success = await unassignTemplateFromShip(assignment.ship_id, assignment.template_id);
        if (success) removedShips++;
      }
    }
  }

  return { removedShips, removedFleets };
}

// Get effective template for a ship (priority: ship > fleet > owner)
export async function getEffectiveTemplateForShip(shipId: string): Promise<SalaryTemplateWithItems | null> {
  // First, try to get ship-level assignment
  const shipAssignments = await getShipSalaryAssignments(shipId);
  if (shipAssignments.length > 0) {
    return await getSalaryTemplateWithItems(shipAssignments[0].template_id);
  }

  // Get ship info to find fleet and owner
  const { data: ship, error: shipError } = await supabase
    .from('ships')
    .select('fleet_id, owner_id')
    .eq('id', shipId)
    .single();

  if (shipError || !ship) {
    console.error('Error fetching ship:', shipError);
    return null;
  }

  // Second, try to get fleet-level assignment
  if (ship.fleet_id) {
    const fleetAssignments = await getFleetSalaryAssignments(String(ship.fleet_id));
    if (fleetAssignments.length > 0) {
      return await getSalaryTemplateWithItems(fleetAssignments[0].template_id);
    }
  }

  // Third, try to get owner-level assignment
  if (ship.owner_id) {
    const ownerAssignments = await getOwnerSalaryAssignments(String(ship.owner_id));
    if (ownerAssignments.length > 0) {
      return await getSalaryTemplateWithItems(ownerAssignments[0].template_id);
    }
  }

  return null;
}