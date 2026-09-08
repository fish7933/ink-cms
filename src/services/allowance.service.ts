import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type {
  AllowanceItem,
  AllowanceKind,
  AllowancePaymentBasis,
  AllowancePaymentMethod,
  AllowanceTemplate,
  AllowanceTemplateItem,
  AllowanceTemplateItemInput,
  AllowanceTemplateWithItems,
  ShipAllowanceTemplateAssignment,
  FleetAllowanceTemplateAssignment,
  OwnerAllowanceTemplateAssignment,
  CrewContractAllowance,
  CrewContractAllowanceWithDetails,
} from '@/types/allowance';

export const allowanceService = {
  // ── 항목 카탈로그 ──────────────────────────────────────────────
  async getItems(includeInactive = false, kind?: AllowanceKind): Promise<AllowanceItem[]> {
    let query = supabase.from('allowance_items').select('*').order('display_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    if (kind) query = query.eq('kind', kind);
    const { data, error } = await query;
    if (error) { console.error('Error fetching allowance items:', error); return []; }
    return data || [];
  },

  async createItem(data: { code: string; name: string; description?: string; kind?: AllowanceKind; payment_basis?: AllowancePaymentBasis; payment_method?: AllowancePaymentMethod; display_order?: number }): Promise<AllowanceItem | null> {
    const { data: result, error } = await supabase.from('allowance_items').insert(data).select().single();
    if (error) { console.error('Error creating allowance item:', error); return null; }
    return result;
  },

  async updateItem(id: string, data: Partial<Pick<AllowanceItem, 'name' | 'description' | 'is_active' | 'kind' | 'payment_basis' | 'payment_method' | 'display_order'>>): Promise<void> {
    const { error } = await supabase.from('allowance_items')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('allowance_items').delete().eq('id', id);
    if (error) throw error;
  },

  // ── 템플릿 (management-fee-store.ts의 대응 함수와 동일 구조) ──────
  async getTemplates(): Promise<AllowanceTemplate[]> {
    const { data, error } = await supabase
      .from('allowance_templates')
      .select('*')
      .eq('is_active', true)
      .is('effective_until', null)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching allowance templates:', error); return []; }
    return (data || []) as AllowanceTemplate[];
  },

  async getTemplateWithItems(templateId: string): Promise<AllowanceTemplateWithItems | null> {
    const { data: template, error: templateError } = await supabase
      .from('allowance_templates').select('*').eq('id', templateId).single();
    if (templateError || !template) { console.error('Error fetching allowance template:', templateError); return null; }

    const { data: items, error: itemsError } = await supabase
      .from('allowance_template_items').select('*').eq('template_id', templateId);
    if (itemsError) { console.error('Error fetching allowance template items:', itemsError); return null; }

    const { data: allItems, error: allItemsError } = await supabase.from('allowance_items').select('*');
    if (allItemsError) { console.error('Error fetching allowance items:', allItemsError); return null; }

    const itemsMap = new Map<string, AllowanceItem>((allItems || []).map(i => [String(i.id), i as AllowanceItem]));

    const itemsWithAllowanceItem = (items || []).map(item => ({
      ...item,
      allowance_item: itemsMap.get(String(item.allowance_item_id)) || {
        id: String(item.allowance_item_id), code: '', name: 'Unknown', kind: 'allowance' as const,
        display_order: 0, payment_basis: 'monthly' as const, payment_method: 'owner_billed' as const,
        is_active: true, created_at: '', updated_at: '',
      },
    }));

    return { ...template, items: itemsWithAllowanceItem } as AllowanceTemplateWithItems;
  },

  async addTemplate(
    template: { name: string; description?: string; is_active: boolean; effective_from?: string },
    items: AllowanceTemplateItemInput[],
  ): Promise<AllowanceTemplate | null> {
    const currentUser = await getCurrentUser();

    const { data: newTemplate, error: templateError } = await supabase
      .from('allowance_templates').insert([{ ...template, created_by: currentUser?.id }]).select().single();
    if (templateError || !newTemplate) { console.error('Error adding allowance template:', templateError); return null; }

    if (items.length > 0) {
      const templateItems = items.map(item => ({
        template_id: newTemplate.id,
        allowance_item_id: item.allowance_item_id,
        rank_id: item.rank_id || null,
        kind: item.kind,
        amount: item.amount,
        currency: item.currency,
        payment_basis: item.payment_basis,
        payment_method: item.payment_method,
        notes: item.notes || null,
        max_payout_count: item.max_payout_count ?? null,
        min_prior_contract_months: item.min_prior_contract_months ?? null,
        max_gap_months: item.max_gap_months ?? null,
        reset_on_owner_change: item.reset_on_owner_change,
      }));
      const { error: itemsError } = await supabase.from('allowance_template_items').insert(templateItems);
      if (itemsError) {
        console.error('Error adding allowance template items:', itemsError);
        await supabase.from('allowance_templates').delete().eq('id', newTemplate.id);
        return null;
      }
    }

    return newTemplate as AllowanceTemplate;
  },

  async updateTemplate(
    id: string,
    template: Partial<AllowanceTemplate>,
    items?: AllowanceTemplateItemInput[],
  ): Promise<AllowanceTemplate | null> {
    // 적용 시작일이 바뀌면 직전 이력 버전의 종료일도 자동 조정 (management_fee_templates와 동일 로직)
    if (template.effective_from) {
      const { data: existing, error: existingError } = await supabase
        .from('allowance_templates').select('effective_from, root_template_id').eq('id', id).single();
      if (existingError || !existing) { console.error('Error fetching template before update:', existingError); return null; }

      if (template.effective_from !== existing.effective_from) {
        const root = existing.root_template_id ? String(existing.root_template_id) : id;
        const { data: lineage, error: lineageError } = await supabase
          .from('allowance_templates').select('id, effective_from')
          .or(`id.eq.${root},root_template_id.eq.${root}`)
          .neq('id', id).lt('effective_from', existing.effective_from)
          .order('effective_from', { ascending: false }).limit(1);
        if (lineageError) { console.error('Error fetching predecessor template version:', lineageError); return null; }

        const predecessor = lineage?.[0];
        if (predecessor) {
          if (template.effective_from <= predecessor.effective_from) {
            console.error('Error updating allowance template: effective_from must be after the previous version\'s effective_from', predecessor.effective_from);
            return null;
          }
          const dayBefore = new Date(template.effective_from);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const { error: predUpdateError } = await supabase
            .from('allowance_templates').update({ effective_until: dayBefore.toISOString().slice(0, 10) }).eq('id', predecessor.id);
          if (predUpdateError) { console.error('Error adjusting previous version\'s effective_until:', predUpdateError); return null; }
        }
      }
    }

    const { data: updatedTemplate, error: templateError } = await supabase
      .from('allowance_templates').update(template).eq('id', id).select().single();
    if (templateError || !updatedTemplate) { console.error('Error updating allowance template:', templateError); return null; }

    if (items) {
      await supabase.from('allowance_template_items').delete().eq('template_id', id);
      if (items.length > 0) {
        const templateItems = items.map(item => ({
          template_id: id,
          allowance_item_id: item.allowance_item_id,
          rank_id: item.rank_id || null,
          kind: item.kind,
          amount: item.amount,
          currency: item.currency,
          payment_basis: item.payment_basis,
          payment_method: item.payment_method,
          notes: item.notes || null,
          max_payout_count: item.max_payout_count ?? null,
          min_prior_contract_months: item.min_prior_contract_months ?? null,
          max_gap_months: item.max_gap_months ?? null,
          reset_on_owner_change: item.reset_on_owner_change,
        }));
        const { error: itemsError } = await supabase.from('allowance_template_items').insert(templateItems);
        if (itemsError) { console.error('Error updating allowance template items:', itemsError); return null; }
      }
    }

    return updatedTemplate as AllowanceTemplate;
  },

  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase.from('allowance_templates').update({ is_active: false }).eq('id', id);
    if (error) { console.error('Error deleting allowance template:', error); return false; }
    return true;
  },

  async getTemplateAssignmentSummary(templateIds: string[]): Promise<{ shipCount: number; fleetCount: number; ownerCount: number; total: number }> {
    if (templateIds.length === 0) return { shipCount: 0, fleetCount: 0, ownerCount: 0, total: 0 };
    const [ship, fleet, owner] = await Promise.all([
      supabase.from('ship_allowance_template_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
      supabase.from('fleet_allowance_template_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
      supabase.from('owner_allowance_template_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
    ]);
    const shipCount = ship.count || 0;
    const fleetCount = fleet.count || 0;
    const ownerCount = owner.count || 0;
    return { shipCount, fleetCount, ownerCount, total: shipCount + fleetCount + ownerCount };
  },

  async getTemplateHistory(templateId: string): Promise<AllowanceTemplate[]> {
    const { data: current, error: currentError } = await supabase
      .from('allowance_templates').select('id, root_template_id').eq('id', templateId).single();
    if (currentError || !current) { console.error('Error fetching template for history:', currentError); return []; }

    const root = current.root_template_id ? String(current.root_template_id) : String(current.id);
    const { data, error } = await supabase
      .from('allowance_templates').select('*')
      .or(`id.eq.${root},root_template_id.eq.${root}`)
      .order('effective_from', { ascending: false });
    if (error) { console.error('Error fetching allowance template history:', error); return []; }
    return (data || []) as AllowanceTemplate[];
  },

  async deleteTemplateHistoryVersion(versionId: string): Promise<boolean> {
    const { data: version, error: versionError } = await supabase
      .from('allowance_templates').select('id, effective_from, effective_until, root_template_id').eq('id', versionId).single();
    if (versionError || !version) { console.error('Error fetching template version to delete:', versionError); return false; }
    if (!version.effective_until) { console.error('Error deleting allowance template version: cannot delete the current active version', versionId); return false; }

    const root = version.root_template_id ? String(version.root_template_id) : versionId;
    const { data: lineage, error: lineageError } = await supabase
      .from('allowance_templates').select('id, effective_from, root_template_id')
      .or(`id.eq.${root},root_template_id.eq.${root}`);
    if (lineageError) { console.error('Error fetching lineage before history deletion:', lineageError); return false; }

    const others = (lineage || []).filter(v => String(v.id) !== versionId);
    const predecessor = others.filter(v => v.effective_from < version.effective_from).sort((a, b) => (a.effective_from > b.effective_from ? -1 : 1))[0];
    const successor = others.filter(v => v.effective_from > version.effective_from).sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))[0];

    if (predecessor) {
      let newUntil: string | null = null;
      if (successor) {
        const d = new Date(successor.effective_from);
        d.setDate(d.getDate() - 1);
        newUntil = d.toISOString().slice(0, 10);
      }
      const { error } = await supabase.from('allowance_templates').update({ effective_until: newUntil }).eq('id', predecessor.id);
      if (error) { console.error('Error extending predecessor version while deleting history:', error); return false; }
    } else if (successor) {
      const { error: rootError } = await supabase
        .from('allowance_templates').update({ root_template_id: null, effective_from: version.effective_from }).eq('id', successor.id);
      if (rootError) { console.error('Error promoting successor to new root while deleting history:', rootError); return false; }

      const otherDescendantIds = others.filter(v => String(v.id) !== String(successor.id)).map(v => String(v.id));
      if (otherDescendantIds.length > 0) {
        const { error: repointError } = await supabase.from('allowance_templates').update({ root_template_id: successor.id }).in('id', otherDescendantIds);
        if (repointError) { console.error('Error repointing lineage to new root while deleting history:', repointError); return false; }
      }
    }

    await supabase.from('allowance_template_items').delete().eq('template_id', versionId);
    const { error: deleteError } = await supabase.from('allowance_templates').delete().eq('id', versionId);
    if (deleteError) { console.error('Error deleting allowance template version:', deleteError); return false; }
    return true;
  },

  async renewTemplate(templateId: string, newEffectiveFrom: string): Promise<AllowanceTemplate | null> {
    const current = await allowanceService.getTemplateWithItems(templateId);
    if (!current) { console.error('Error renewing allowance template: template not found', templateId); return null; }
    if (current.effective_until) { console.error('Error renewing allowance template: cannot renew an already-closed historical version', templateId); return null; }
    if (newEffectiveFrom <= current.effective_from) { console.error('Error renewing allowance template: new effective_from must be after current effective_from'); return null; }

    const root = current.root_template_id || current.id;

    const newTemplate = await allowanceService.addTemplate(
      { name: current.name, description: current.description, is_active: true, effective_from: newEffectiveFrom },
      current.items.map(i => ({
        allowance_item_id: i.allowance_item_id, rank_id: i.rank_id, kind: i.kind,
        amount: i.amount, currency: i.currency, payment_basis: i.payment_basis,
        payment_method: i.payment_method, notes: i.notes,
        max_payout_count: i.max_payout_count, min_prior_contract_months: i.min_prior_contract_months,
        max_gap_months: i.max_gap_months, reset_on_owner_change: i.reset_on_owner_change,
      })),
    );
    if (!newTemplate) { console.error('Error renewing allowance template: failed to create new version'); return null; }

    const { error: rootError } = await supabase.from('allowance_templates').update({ root_template_id: root }).eq('id', newTemplate.id);
    if (rootError) console.error('Error linking renewed template to root:', rootError);

    const dayBefore = new Date(newEffectiveFrom);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const { error: closeError } = await supabase.from('allowance_templates').update({ effective_until: dayBefore.toISOString().slice(0, 10) }).eq('id', templateId);
    if (closeError) console.error('Error closing previous template version:', closeError);

    const { error: shipError } = await supabase.from('ship_allowance_template_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
    if (shipError) console.error('Error migrating ship allowance template assignments to renewed template:', shipError);
    const { error: fleetError } = await supabase.from('fleet_allowance_template_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
    if (fleetError) console.error('Error migrating fleet allowance template assignments to renewed template:', fleetError);
    const { error: ownerError } = await supabase.from('owner_allowance_template_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
    if (ownerError) console.error('Error migrating owner allowance template assignments to renewed template:', ownerError);

    return { ...newTemplate, root_template_id: root };
  },

  async copyTemplate(templateId: string, newName: string): Promise<AllowanceTemplate | null> {
    const source = await allowanceService.getTemplateWithItems(templateId);
    if (!source) { console.error('Error copying allowance template: template not found', templateId); return null; }

    return allowanceService.addTemplate(
      { name: newName, description: source.description, is_active: true, effective_from: new Date().toISOString().slice(0, 10) },
      source.items.map(i => ({
        allowance_item_id: i.allowance_item_id, rank_id: i.rank_id, kind: i.kind,
        amount: i.amount, currency: i.currency, payment_basis: i.payment_basis,
        payment_method: i.payment_method, notes: i.notes,
        max_payout_count: i.max_payout_count, min_prior_contract_months: i.min_prior_contract_months,
        max_gap_months: i.max_gap_months, reset_on_owner_change: i.reset_on_owner_change,
      })),
    );
  },

  // ── 선박/플릿/선주 배정 ────────────────────────────────────────
  async getShipAssignments(shipId?: string): Promise<ShipAllowanceTemplateAssignment[]> {
    let query = supabase.from('ship_allowance_template_assignments').select('*');
    if (shipId) query = query.eq('ship_id', shipId);
    const { data, error } = await query.order('assigned_at', { ascending: false });
    if (error) { console.error('Error fetching ship allowance template assignments:', error); return []; }
    return (data || []) as ShipAllowanceTemplateAssignment[];
  },

  async assignTemplateToShip(shipId: string, templateId: string): Promise<ShipAllowanceTemplateAssignment | null> {
    const currentUser = await getCurrentUser();
    const { data, error } = await supabase
      .from('ship_allowance_template_assignments')
      .insert([{ ship_id: shipId, template_id: templateId, assigned_by: currentUser?.id }])
      .select().single();
    if (error) { console.error('Error assigning template to ship:', error); return null; }
    return data as ShipAllowanceTemplateAssignment;
  },

  async unassignTemplateFromShip(shipId: string, templateId: string): Promise<boolean> {
    const { error } = await supabase.from('ship_allowance_template_assignments').delete().eq('ship_id', shipId).eq('template_id', templateId);
    if (error) { console.error('Error unassigning template from ship:', error); return false; }
    return true;
  },

  async getFleetAssignments(fleetId?: string): Promise<FleetAllowanceTemplateAssignment[]> {
    let query = supabase.from('fleet_allowance_template_assignments').select('*');
    if (fleetId) query = query.eq('fleet_id', fleetId);
    const { data, error } = await query.order('assigned_at', { ascending: false });
    if (error) { console.error('Error fetching fleet allowance template assignments:', error); return []; }
    return (data || []) as FleetAllowanceTemplateAssignment[];
  },

  async assignTemplateToFleet(fleetId: string, templateId: string): Promise<FleetAllowanceTemplateAssignment | null> {
    const currentUser = await getCurrentUser();
    const { data, error } = await supabase
      .from('fleet_allowance_template_assignments')
      .insert([{ fleet_id: fleetId, template_id: templateId, assigned_by: currentUser?.id }])
      .select().single();
    if (error) { console.error('Error assigning template to fleet:', error); return null; }
    return data as FleetAllowanceTemplateAssignment;
  },

  async unassignTemplateFromFleet(fleetId: string, templateId: string): Promise<boolean> {
    const { error } = await supabase.from('fleet_allowance_template_assignments').delete().eq('fleet_id', fleetId).eq('template_id', templateId);
    if (error) { console.error('Error unassigning template from fleet:', error); return false; }
    return true;
  },

  async getOwnerAssignments(ownerId?: string): Promise<OwnerAllowanceTemplateAssignment[]> {
    let query = supabase.from('owner_allowance_template_assignments').select('*');
    if (ownerId) query = query.eq('owner_id', ownerId);
    const { data, error } = await query.order('assigned_at', { ascending: false });
    if (error) { console.error('Error fetching owner allowance template assignments:', error); return []; }
    return (data || []) as OwnerAllowanceTemplateAssignment[];
  },

  async assignTemplateToOwner(ownerId: string, templateId: string): Promise<OwnerAllowanceTemplateAssignment | null> {
    const currentUser = await getCurrentUser();
    const { data, error } = await supabase
      .from('owner_allowance_template_assignments')
      .insert([{ owner_id: ownerId, template_id: templateId, assigned_by: currentUser?.id }])
      .select().single();
    if (error) { console.error('Error assigning template to owner:', error); return null; }
    return data as OwnerAllowanceTemplateAssignment;
  },

  async unassignTemplateFromOwner(ownerId: string, templateId: string): Promise<boolean> {
    const { error } = await supabase.from('owner_allowance_template_assignments').delete().eq('owner_id', ownerId).eq('template_id', templateId);
    if (error) { console.error('Error unassigning template from owner:', error); return false; }
    return true;
  },

  /**
   * 하위 레벨 배정 정리(management-fee-store.ts의 cleanupLowerLevelAssignments와 동일 정책):
   * 플릿에 배정하면 그 플릿 소속 선박들의 선박 단위 배정을 제거, 선주에 배정하면 그 선주 소속
   * 플릿/선박의 배정을 모두 제거한다 — 우선순위가 항상 "가장 구체적인 배정 하나"만 남도록.
   */
  async cleanupLowerLevelAssignments(level: 'fleet' | 'owner', entityId: string): Promise<{ removedShips: number; removedFleets: number }> {
    let removedShips = 0;
    let removedFleets = 0;

    if (level === 'fleet') {
      const { data: ships } = await supabase.from('ships').select('id').eq('fleet_id', entityId);
      if (ships && ships.length > 0) {
        const shipIds = ships.map(s => String(s.id));
        const allShipAssignments = await allowanceService.getShipAssignments();
        const toRemove = allShipAssignments.filter(a => shipIds.includes(String(a.ship_id)));
        for (const assignment of toRemove) {
          const success = await allowanceService.unassignTemplateFromShip(assignment.ship_id, assignment.template_id);
          if (success) removedShips++;
        }
      }
    } else if (level === 'owner') {
      const { data: fleets } = await supabase.from('fleets').select('id').eq('owner_id', entityId);
      const fleetIds = (fleets || []).map(f => String(f.id));

      const { data: allShips } = await supabase.from('ships').select('id, fleet_id, owner_id');
      const ownerShipIds: string[] = [];
      if (allShips) {
        for (const ship of allShips) {
          const shipFleetId = ship.fleet_id ? String(ship.fleet_id) : '';
          const shipOwnerId = ship.owner_id ? String(ship.owner_id) : '';
          if (shipOwnerId === entityId || fleetIds.includes(shipFleetId)) ownerShipIds.push(String(ship.id));
        }
      }

      if (fleetIds.length > 0) {
        const allFleetAssignments = await allowanceService.getFleetAssignments();
        const fleetsToRemove = allFleetAssignments.filter(a => fleetIds.includes(String(a.fleet_id)));
        for (const assignment of fleetsToRemove) {
          const success = await allowanceService.unassignTemplateFromFleet(assignment.fleet_id, assignment.template_id);
          if (success) removedFleets++;
        }
      }

      if (ownerShipIds.length > 0) {
        const allShipAssignments = await allowanceService.getShipAssignments();
        const shipsToRemove = allShipAssignments.filter(a => ownerShipIds.includes(String(a.ship_id)));
        for (const assignment of shipsToRemove) {
          const success = await allowanceService.unassignTemplateFromShip(assignment.ship_id, assignment.template_id);
          if (success) removedShips++;
        }
      }
    }

    return { removedShips, removedFleets };
  },

  // 선박>플릿>선주 우선순위로 유효 템플릿 해석 (management-fee-store.ts::getEffectiveTemplateForShip과 동일 로직)
  async getEffectiveTemplateForShip(shipId: string): Promise<AllowanceTemplateWithItems | null> {
    const shipAssignments = await allowanceService.getShipAssignments(shipId);
    if (shipAssignments.length > 0) return allowanceService.getTemplateWithItems(shipAssignments[0].template_id);

    const { data: ship, error: shipError } = await supabase.from('ships').select('fleet_id, owner_id').eq('id', shipId).single();
    if (shipError || !ship) { console.error('Error fetching ship:', shipError); return null; }

    if (ship.fleet_id) {
      const fleetAssignments = await allowanceService.getFleetAssignments(String(ship.fleet_id));
      if (fleetAssignments.length > 0) return allowanceService.getTemplateWithItems(fleetAssignments[0].template_id);
    }

    if (ship.owner_id) {
      const ownerAssignments = await allowanceService.getOwnerAssignments(String(ship.owner_id));
      if (ownerAssignments.length > 0) return allowanceService.getTemplateWithItems(ownerAssignments[0].template_id);
    }

    return null;
  },

  // 여러 선박의 유효 템플릿을 한 번에 계산 (N+1 방지)
  async getEffectiveTemplateMapForShips(ships: { id: string; fleet_id?: string | null; owner_id?: string | null }[]): Promise<Record<string, AllowanceTemplate | null>> {
    const [shipAssignments, fleetAssignments, ownerAssignments, templates] = await Promise.all([
      allowanceService.getShipAssignments(),
      allowanceService.getFleetAssignments(),
      allowanceService.getOwnerAssignments(),
      allowanceService.getTemplates(),
    ]);

    const templateMap = new Map(templates.map(t => [t.id, t]));
    const byShip = new Map<string, ShipAllowanceTemplateAssignment[]>();
    shipAssignments.forEach(a => { const arr = byShip.get(a.ship_id) || []; arr.push(a); byShip.set(a.ship_id, arr); });
    const byFleet = new Map<string, FleetAllowanceTemplateAssignment[]>();
    fleetAssignments.forEach(a => { const arr = byFleet.get(a.fleet_id) || []; arr.push(a); byFleet.set(a.fleet_id, arr); });
    const byOwner = new Map<string, OwnerAllowanceTemplateAssignment[]>();
    ownerAssignments.forEach(a => { const arr = byOwner.get(a.owner_id) || []; arr.push(a); byOwner.set(a.owner_id, arr); });

    const result: Record<string, AllowanceTemplate | null> = {};
    for (const ship of ships) {
      const shipAssigns = byShip.get(ship.id);
      if (shipAssigns?.length) { result[ship.id] = templateMap.get(shipAssigns[0].template_id) || null; continue; }
      const fleetAssigns = ship.fleet_id ? byFleet.get(ship.fleet_id) : undefined;
      if (fleetAssigns?.length) { result[ship.id] = templateMap.get(fleetAssigns[0].template_id) || null; continue; }
      const ownerAssigns = ship.owner_id ? byOwner.get(ship.owner_id) : undefined;
      if (ownerAssigns?.length) { result[ship.id] = templateMap.get(ownerAssigns[0].template_id) || null; continue; }
      result[ship.id] = null;
    }
    return result;
  },

  // 수당 시스템 전용: 선박의 유효 템플릿에서 특정 직급에 적용되는 항목만 추림
  // (직급 특정 행이 있으면 그것을, 없으면 전 직급 공통(rank_id=null) 행을 사용 — "구체적인 게 우선")
  async getEffectiveTemplateItemsForShipAndRank(shipId: string, rankId: string): Promise<(AllowanceTemplateItem & { allowance_item: AllowanceItem })[]> {
    const template = await allowanceService.getEffectiveTemplateForShip(shipId);
    return allowanceService._resolveTemplateItemsForRank(template, rankId);
  },

  _resolveTemplateItemsForRank(template: AllowanceTemplateWithItems | null, rankId: string): (AllowanceTemplateItem & { allowance_item: AllowanceItem })[] {
    if (!template) return [];
    const rankSpecific = template.items.filter(i => i.rank_id === rankId);
    if (rankSpecific.length > 0) return rankSpecific;
    return template.items.filter(i => !i.rank_id);
  },

  // ── 계약별 수당 스냅샷 ─────────────────────────────────────────
  async getContractAllowances(contractId: string): Promise<CrewContractAllowanceWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_contract_allowances')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at');
    if (error) { console.error('Error fetching contract allowances:', error); return []; }
    if (!data || data.length === 0) return [];

    const { data: items } = await supabase.from('allowance_items').select('id, name, description').in('id', data.map(a => a.allowance_item_id));
    const itemsById = new Map((items || []).map(i => [i.id, i]));

    return data.map(a => ({
      ...a,
      allowance_item_name: itemsById.get(a.allowance_item_id)?.name || '',
      allowance_item_description: itemsById.get(a.allowance_item_id)?.description || undefined,
    }));
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
