import { supabase } from './supabase';
import { getCurrentUser } from './store';

// Types
export interface ManagementFeeItem {
  id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  default_billing_basis: 'monthly' | 'one_time' | 'actual_cost';
  created_at: string;
  updated_at: string;
}

export interface ManagementFeeTemplate {
  id: string;
  name: string;
  description?: string;
  currency: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  effective_from: string; // 이 버전의 적용 시작일
  effective_until?: string | null; // null = 현재 활성 버전
  root_template_id?: string | null; // 최초 원본 템플릿 id (null이면 이 행 자체가 원본)
}

export interface ManagementFeeTemplateItem {
  id: string;
  template_id: string;
  fee_item_id: string;
  rank_category?: 'officer' | 'rating' | null; // null = 직급구분 무관
  nationality_code?: string | null; // null = 국적 무관
  ship_type?: string | null; // null = 선종 무관
  billing_basis: 'monthly' | 'one_time' | 'actual_cost';
  amount: number;
  currency: string;
  ship_cap_amount?: number | null; // 선박×월 합계 상한 (같은 fee_item_id의 모든 행이 동일해야 함)
  created_at: string;
  updated_at: string;
}

export interface ManagementFeeTemplateWithItems extends ManagementFeeTemplate {
  items: (ManagementFeeTemplateItem & { fee_item: ManagementFeeItem })[];
}

export interface ShipManagementFeeAssignment {
  id: string;
  ship_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface FleetManagementFeeAssignment {
  id: string;
  fleet_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface OwnerManagementFeeAssignment {
  id: string;
  owner_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export type ManagementFeeTemplateItemInput = {
  fee_item_id: string;
  rank_category?: 'officer' | 'rating' | null;
  nationality_code?: string | null;
  ship_type?: string | null;
  billing_basis: 'monthly' | 'one_time' | 'actual_cost';
  amount: number;
  currency: string;
  ship_cap_amount?: number | null;
};

// 같은 fee_item_id에 상한(ship_cap_amount)이 설정된 행이 여러 개면 반드시 같은 금액+통화여야 한다.
// 상한은 개별 조건이 아니라 "그 청구 항목 자체"에 속하는 값이기 때문 — 여기서 저장 전에 검증한다.
// UI에서도 저장 전에 같은 검증으로 구체적인 오류 메시지를 보여줄 수 있도록 export한다.
export function validateCapConsistency(items: ManagementFeeTemplateItemInput[]): string | null {
  const capMap = new Map<string, { amount: number; currency: string }>();
  for (const item of items) {
    if (item.ship_cap_amount == null) continue;
    const existing = capMap.get(item.fee_item_id);
    if (existing) {
      if (existing.amount !== item.ship_cap_amount || existing.currency !== item.currency) {
        return `같은 청구 항목의 선박 상한 금액/통화는 모든 조건 행에서 동일해야 합니다 (fee_item_id: ${item.fee_item_id})`;
      }
    } else {
      capMap.set(item.fee_item_id, { amount: item.ship_cap_amount, currency: item.currency });
    }
  }
  return null;
}

// Management Fee Item (청구 항목 카탈로그) functions
export async function getManagementFeeItems(): Promise<ManagementFeeItem[]> {
  const { data, error } = await supabase
    .from('management_fee_items')
    .select('id, name, description, display_order, is_active, default_billing_basis, created_at, updated_at')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching management fee items:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    default_billing_basis: (item.default_billing_basis ?? 'monthly') as 'monthly' | 'one_time' | 'actual_cost',
  })) as ManagementFeeItem[];
}

export async function addManagementFeeItem(item: Omit<ManagementFeeItem, 'id' | 'created_at' | 'updated_at'>): Promise<ManagementFeeItem | null> {
  const { data, error } = await supabase
    .from('management_fee_items')
    .insert([item])
    .select()
    .single();

  if (error) {
    console.error('Error adding management fee item:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id) } as ManagementFeeItem : null;
}

export async function updateManagementFeeItem(id: string, updates: Partial<ManagementFeeItem>): Promise<ManagementFeeItem | null> {
  const { data, error } = await supabase
    .from('management_fee_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating management fee item:', error);
    return null;
  }

  return data ? { ...data, id: String(data.id) } as ManagementFeeItem : null;
}

export async function deleteManagementFeeItem(id: string): Promise<boolean> {
  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('management_fee_items')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting management fee item:', error);
    return false;
  }

  return true;
}

// Management Fee Template functions
export async function getManagementFeeTemplates(): Promise<ManagementFeeTemplate[]> {
  const { data, error } = await supabase
    .from('management_fee_templates')
    .select('*')
    .eq('is_active', true)
    .is('effective_until', null) // 현재 활성 버전만 (갱신되어 종료된 과거 버전은 이력에서만 조회)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching management fee templates:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
  })) as ManagementFeeTemplate[];
}

export async function getManagementFeeTemplateWithItems(templateId: string): Promise<ManagementFeeTemplateWithItems | null> {
  const { data: template, error: templateError } = await supabase
    .from('management_fee_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    console.error('Error fetching management fee template:', templateError);
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('management_fee_template_items')
    .select('*')
    .eq('template_id', templateId);

  if (itemsError) {
    console.error('Error fetching management fee template items:', itemsError);
    return null;
  }

  const { data: allFeeItems, error: feeItemsError } = await supabase
    .from('management_fee_items')
    .select('*');

  if (feeItemsError) {
    console.error('Error fetching management fee items:', feeItemsError);
    return null;
  }

  const feeItemsMap = new Map<string, ManagementFeeItem>();
  (allFeeItems || []).forEach(fi => {
    feeItemsMap.set(String(fi.id), { ...fi, id: String(fi.id) } as ManagementFeeItem);
  });

  const itemsWithFeeItems = (items || []).map(item => {
    const feeItem = feeItemsMap.get(String(item.fee_item_id));
    return {
      ...item,
      id: String(item.id),
      template_id: String(item.template_id),
      fee_item_id: String(item.fee_item_id),
      fee_item: feeItem || {
        id: String(item.fee_item_id), name: 'Unknown', display_order: 0, is_active: true,
        default_billing_basis: 'monthly' as const, created_at: '', updated_at: '',
      },
    };
  });

  return {
    ...template,
    id: String(template.id),
    items: itemsWithFeeItems,
  } as ManagementFeeTemplateWithItems;
}

export async function addManagementFeeTemplate(
  template: { name: string; description?: string; currency: string; is_active: boolean; effective_from?: string },
  items: ManagementFeeTemplateItemInput[],
): Promise<ManagementFeeTemplate | null> {
  const capError = validateCapConsistency(items);
  if (capError) {
    console.error('Error adding management fee template:', capError);
    return null;
  }

  const currentUser = await getCurrentUser();

  const { data: newTemplate, error: templateError } = await supabase
    .from('management_fee_templates')
    .insert([{ ...template, created_by: currentUser?.id }])
    .select()
    .single();

  if (templateError || !newTemplate) {
    console.error('Error adding management fee template:', templateError);
    return null;
  }

  const newTemplateId = String(newTemplate.id);

  if (items.length > 0) {
    const templateItems = items.map(item => ({
      template_id: newTemplateId,
      fee_item_id: item.fee_item_id,
      rank_category: item.rank_category || null,
      nationality_code: item.nationality_code || null,
      ship_type: item.ship_type || null,
      billing_basis: item.billing_basis,
      amount: item.amount,
      currency: item.currency,
      ship_cap_amount: item.ship_cap_amount ?? null,
    }));

    const { error: itemsError } = await supabase
      .from('management_fee_template_items')
      .insert(templateItems);

    if (itemsError) {
      console.error('Error adding management fee template items:', itemsError);
      // Rollback: delete the template
      await supabase.from('management_fee_templates').delete().eq('id', newTemplateId);
      return null;
    }
  }

  return { ...newTemplate, id: newTemplateId } as ManagementFeeTemplate;
}

export async function updateManagementFeeTemplate(
  id: string,
  template: Partial<ManagementFeeTemplate>,
  items?: ManagementFeeTemplateItemInput[],
): Promise<ManagementFeeTemplate | null> {
  if (items) {
    const capError = validateCapConsistency(items);
    if (capError) {
      console.error('Error updating management fee template:', capError);
      return null;
    }
  }

  // 적용 시작일(effective_from)이 변경되면, 직전 이력 버전의 종료일도 그에 맞춰 자동 조정
  if (template.effective_from) {
    const { data: existing, error: existingError } = await supabase
      .from('management_fee_templates')
      .select('effective_from, root_template_id')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      console.error('Error fetching template before update:', existingError);
      return null;
    }

    if (template.effective_from !== existing.effective_from) {
      const root = existing.root_template_id ? String(existing.root_template_id) : id;
      const { data: lineage, error: lineageError } = await supabase
        .from('management_fee_templates')
        .select('id, effective_from')
        .or(`id.eq.${root},root_template_id.eq.${root}`)
        .neq('id', id)
        .lt('effective_from', existing.effective_from)
        .order('effective_from', { ascending: false })
        .limit(1);

      if (lineageError) {
        console.error('Error fetching predecessor template version:', lineageError);
        return null;
      }

      const predecessor = lineage?.[0];
      if (predecessor) {
        if (template.effective_from <= predecessor.effective_from) {
          console.error('Error updating management fee template: effective_from must be after the previous version\'s effective_from', predecessor.effective_from);
          return null;
        }
        const dayBefore = new Date(template.effective_from);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const newPredecessorUntil = dayBefore.toISOString().slice(0, 10);

        const { error: predUpdateError } = await supabase
          .from('management_fee_templates')
          .update({ effective_until: newPredecessorUntil })
          .eq('id', predecessor.id);

        if (predUpdateError) {
          console.error('Error adjusting previous version\'s effective_until:', predUpdateError);
          return null;
        }
      }
    }
  }

  const { data: updatedTemplate, error: templateError } = await supabase
    .from('management_fee_templates')
    .update(template)
    .eq('id', id)
    .select()
    .single();

  if (templateError || !updatedTemplate) {
    console.error('Error updating management fee template:', templateError);
    return null;
  }

  if (items) {
    await supabase
      .from('management_fee_template_items')
      .delete()
      .eq('template_id', id);

    if (items.length > 0) {
      const templateItems = items.map(item => ({
        template_id: id,
        fee_item_id: item.fee_item_id,
        rank_category: item.rank_category || null,
        nationality_code: item.nationality_code || null,
        ship_type: item.ship_type || null,
        billing_basis: item.billing_basis,
        amount: item.amount,
        currency: item.currency,
        ship_cap_amount: item.ship_cap_amount ?? null,
      }));

      const { error: itemsError } = await supabase
        .from('management_fee_template_items')
        .insert(templateItems);

      if (itemsError) {
        console.error('Error updating management fee template items:', itemsError);
        return null;
      }
    }
  }

  return { ...updatedTemplate, id: String(updatedTemplate.id) } as ManagementFeeTemplate;
}

export async function deleteManagementFeeTemplate(id: string): Promise<boolean> {
  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('management_fee_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting management fee template:', error);
    return false;
  }

  return true;
}

// 삭제하려는 템플릿(들)이 선박/플릿/선주에 할당되어 있는지 미리 확인
export async function getTemplateAssignmentSummary(templateIds: string[]): Promise<{ shipCount: number; fleetCount: number; ownerCount: number; total: number }> {
  if (templateIds.length === 0) return { shipCount: 0, fleetCount: 0, ownerCount: 0, total: 0 };
  const [ship, fleet, owner] = await Promise.all([
    supabase.from('ship_management_fee_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
    supabase.from('fleet_management_fee_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
    supabase.from('owner_management_fee_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
  ]);
  const shipCount = ship.count || 0;
  const fleetCount = fleet.count || 0;
  const ownerCount = owner.count || 0;
  return { shipCount, fleetCount, ownerCount, total: shipCount + fleetCount + ownerCount };
}

// 특정 템플릿(어느 버전이든)의 전체 이력(원본 + 갱신된 모든 버전)을 최신순으로 조회
export async function getManagementFeeTemplateHistory(templateId: string): Promise<ManagementFeeTemplate[]> {
  const { data: current, error: currentError } = await supabase
    .from('management_fee_templates')
    .select('id, root_template_id')
    .eq('id', templateId)
    .single();

  if (currentError || !current) {
    console.error('Error fetching template for history:', currentError);
    return [];
  }

  const root = current.root_template_id ? String(current.root_template_id) : String(current.id);

  const { data, error } = await supabase
    .from('management_fee_templates')
    .select('*')
    .or(`id.eq.${root},root_template_id.eq.${root}`)
    .order('effective_from', { ascending: false });

  if (error) {
    console.error('Error fetching management fee template history:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
  })) as ManagementFeeTemplate[];
}

// 갱신 히스토리 중 종료된(과거) 버전 삭제. 삭제 후 앞뒤 버전의 유효기간이 빈 틈 없이 이어붙도록 자동 조정.
export async function deleteManagementFeeTemplateHistoryVersion(versionId: string): Promise<boolean> {
  const { data: version, error: versionError } = await supabase
    .from('management_fee_templates')
    .select('id, effective_from, effective_until, root_template_id')
    .eq('id', versionId)
    .single();

  if (versionError || !version) {
    console.error('Error fetching template version to delete:', versionError);
    return false;
  }
  if (!version.effective_until) {
    console.error('Error deleting management fee template version: cannot delete the current active version', versionId);
    return false;
  }

  const root = version.root_template_id ? String(version.root_template_id) : versionId;

  const { data: lineage, error: lineageError } = await supabase
    .from('management_fee_templates')
    .select('id, effective_from, root_template_id')
    .or(`id.eq.${root},root_template_id.eq.${root}`);

  if (lineageError) {
    console.error('Error fetching lineage before history deletion:', lineageError);
    return false;
  }

  const others = (lineage || []).filter(v => String(v.id) !== versionId);
  const predecessor = others
    .filter(v => v.effective_from < version.effective_from)
    .sort((a, b) => (a.effective_from > b.effective_from ? -1 : 1))[0];
  const successor = others
    .filter(v => v.effective_from > version.effective_from)
    .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))[0];

  if (predecessor) {
    let newUntil: string | null = null;
    if (successor) {
      const d = new Date(successor.effective_from);
      d.setDate(d.getDate() - 1);
      newUntil = d.toISOString().slice(0, 10);
    }
    const { error } = await supabase.from('management_fee_templates').update({ effective_until: newUntil }).eq('id', predecessor.id);
    if (error) {
      console.error('Error extending predecessor version while deleting history:', error);
      return false;
    }
  } else if (successor) {
    const { error: rootError } = await supabase
      .from('management_fee_templates')
      .update({ root_template_id: null, effective_from: version.effective_from })
      .eq('id', successor.id);
    if (rootError) {
      console.error('Error promoting successor to new root while deleting history:', rootError);
      return false;
    }

    const otherDescendantIds = others.filter(v => String(v.id) !== String(successor.id)).map(v => String(v.id));
    if (otherDescendantIds.length > 0) {
      const { error: repointError } = await supabase
        .from('management_fee_templates')
        .update({ root_template_id: successor.id })
        .in('id', otherDescendantIds);
      if (repointError) {
        console.error('Error repointing lineage to new root while deleting history:', repointError);
        return false;
      }
    }
  }

  await supabase.from('management_fee_template_items').delete().eq('template_id', versionId);
  const { error: deleteError } = await supabase.from('management_fee_templates').delete().eq('id', versionId);
  if (deleteError) {
    console.error('Error deleting management fee template version:', deleteError);
    return false;
  }

  return true;
}

// 관리비 요율 인상 등에 대응하기 위한 템플릿 갱신: 새 유효기간 버전을 생성하고, 기존 배정을 자동으로 새 버전으로 이전
export async function renewManagementFeeTemplate(templateId: string, newEffectiveFrom: string): Promise<ManagementFeeTemplate | null> {
  const current = await getManagementFeeTemplateWithItems(templateId);
  if (!current) {
    console.error('Error renewing management fee template: template not found', templateId);
    return null;
  }
  if (current.effective_until) {
    console.error('Error renewing management fee template: cannot renew an already-closed historical version', templateId);
    return null;
  }
  if (newEffectiveFrom <= current.effective_from) {
    console.error('Error renewing management fee template: new effective_from must be after current effective_from');
    return null;
  }

  const root = current.root_template_id || current.id;

  const newTemplate = await addManagementFeeTemplate(
    {
      name: current.name,
      description: current.description,
      currency: current.currency,
      is_active: true,
      effective_from: newEffectiveFrom,
    },
    current.items.map(i => ({
      fee_item_id: i.fee_item_id,
      rank_category: i.rank_category,
      nationality_code: i.nationality_code,
      ship_type: i.ship_type,
      billing_basis: i.billing_basis,
      amount: i.amount,
      currency: i.currency,
      ship_cap_amount: i.ship_cap_amount,
    })),
  );

  if (!newTemplate) {
    console.error('Error renewing management fee template: failed to create new version');
    return null;
  }

  const { error: rootError } = await supabase
    .from('management_fee_templates')
    .update({ root_template_id: root })
    .eq('id', newTemplate.id);
  if (rootError) console.error('Error linking renewed template to root:', rootError);

  const dayBefore = new Date(newEffectiveFrom);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const effectiveUntil = dayBefore.toISOString().slice(0, 10);

  const { error: closeError } = await supabase
    .from('management_fee_templates')
    .update({ effective_until: effectiveUntil })
    .eq('id', templateId);
  if (closeError) console.error('Error closing previous template version:', closeError);

  // 기존 배정을 새 버전으로 자동 이전
  const { error: shipError } = await supabase.from('ship_management_fee_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
  if (shipError) console.error('Error migrating ship management fee assignments to renewed template:', shipError);
  const { error: fleetError } = await supabase.from('fleet_management_fee_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
  if (fleetError) console.error('Error migrating fleet management fee assignments to renewed template:', fleetError);
  const { error: ownerError } = await supabase.from('owner_management_fee_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
  if (ownerError) console.error('Error migrating owner management fee assignments to renewed template:', ownerError);

  return { ...newTemplate, root_template_id: root };
}

// 유사한 관리비 템플릿을 새로 만들 때 쓰는 복사: 청구 항목 구성을 그대로 복제한 완전히 독립된 새 템플릿을 만든다
export async function copyManagementFeeTemplate(templateId: string, newName: string): Promise<ManagementFeeTemplate | null> {
  const source = await getManagementFeeTemplateWithItems(templateId);
  if (!source) {
    console.error('Error copying management fee template: template not found', templateId);
    return null;
  }

  return addManagementFeeTemplate(
    {
      name: newName,
      description: source.description,
      currency: source.currency,
      is_active: true,
      effective_from: new Date().toISOString().slice(0, 10),
    },
    source.items.map(i => ({
      fee_item_id: i.fee_item_id,
      rank_category: i.rank_category,
      nationality_code: i.nationality_code,
      ship_type: i.ship_type,
      billing_basis: i.billing_basis,
      amount: i.amount,
      currency: i.currency,
      ship_cap_amount: i.ship_cap_amount,
    })),
  );
}

// Ship Management Fee Assignment functions
export async function getShipManagementFeeAssignments(shipId?: string): Promise<ShipManagementFeeAssignment[]> {
  let query = supabase.from('ship_management_fee_assignments').select('*');

  if (shipId) {
    query = query.eq('ship_id', shipId);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error fetching ship management fee assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    ship_id: String(item.ship_id),
    template_id: String(item.template_id),
  })) as ShipManagementFeeAssignment[];
}

export async function assignTemplateToShip(shipId: string, templateId: string): Promise<ShipManagementFeeAssignment | null> {
  const currentUser = await getCurrentUser();

  const { data, error } = await supabase
    .from('ship_management_fee_assignments')
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

  return data ? { ...data, id: String(data.id), ship_id: String(data.ship_id), template_id: String(data.template_id) } as ShipManagementFeeAssignment : null;
}

export async function unassignTemplateFromShip(shipId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('ship_management_fee_assignments')
    .delete()
    .eq('ship_id', shipId)
    .eq('template_id', templateId);

  if (error) {
    console.error('Error unassigning template from ship:', error);
    return false;
  }

  return true;
}

export async function getTemplatesByShip(shipId: string): Promise<ManagementFeeTemplateWithItems[]> {
  const { data: assignments, error } = await supabase
    .from('ship_management_fee_assignments')
    .select('template_id')
    .eq('ship_id', shipId);

  if (error || !assignments) {
    console.error('Error fetching ship templates:', error);
    return [];
  }

  const templates: ManagementFeeTemplateWithItems[] = [];
  for (const assignment of assignments) {
    const template = await getManagementFeeTemplateWithItems(String(assignment.template_id));
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

// Fleet Management Fee Assignment functions
export async function getFleetManagementFeeAssignments(fleetId?: string): Promise<FleetManagementFeeAssignment[]> {
  let query = supabase.from('fleet_management_fee_assignments').select('*');

  if (fleetId) {
    query = query.eq('fleet_id', fleetId);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error fetching fleet management fee assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    fleet_id: String(item.fleet_id),
    template_id: String(item.template_id),
  })) as FleetManagementFeeAssignment[];
}

export async function assignTemplateToFleet(fleetId: string, templateId: string): Promise<FleetManagementFeeAssignment | null> {
  const currentUser = await getCurrentUser();

  const { data, error } = await supabase
    .from('fleet_management_fee_assignments')
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

  return data ? { ...data, id: String(data.id), fleet_id: String(data.fleet_id), template_id: String(data.template_id) } as FleetManagementFeeAssignment : null;
}

export async function unassignTemplateFromFleet(fleetId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('fleet_management_fee_assignments')
    .delete()
    .eq('fleet_id', fleetId)
    .eq('template_id', templateId);

  if (error) {
    console.error('Error unassigning template from fleet:', error);
    return false;
  }

  return true;
}

export async function getTemplatesByFleet(fleetId: string): Promise<ManagementFeeTemplateWithItems[]> {
  const { data: assignments, error } = await supabase
    .from('fleet_management_fee_assignments')
    .select('template_id')
    .eq('fleet_id', fleetId);

  if (error || !assignments) {
    console.error('Error fetching fleet templates:', error);
    return [];
  }

  const templates: ManagementFeeTemplateWithItems[] = [];
  for (const assignment of assignments) {
    const template = await getManagementFeeTemplateWithItems(String(assignment.template_id));
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

// Owner Management Fee Assignment functions
export async function getOwnerManagementFeeAssignments(ownerId?: string): Promise<OwnerManagementFeeAssignment[]> {
  let query = supabase.from('owner_management_fee_assignments').select('*');

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error fetching owner management fee assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    owner_id: String(item.owner_id),
    template_id: String(item.template_id),
  })) as OwnerManagementFeeAssignment[];
}

export async function assignTemplateToOwner(ownerId: string, templateId: string): Promise<OwnerManagementFeeAssignment | null> {
  const currentUser = await getCurrentUser();

  const { data, error } = await supabase
    .from('owner_management_fee_assignments')
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

  return data ? { ...data, id: String(data.id), owner_id: String(data.owner_id), template_id: String(data.template_id) } as OwnerManagementFeeAssignment : null;
}

export async function unassignTemplateFromOwner(ownerId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('owner_management_fee_assignments')
    .delete()
    .eq('owner_id', ownerId)
    .eq('template_id', templateId);

  if (error) {
    console.error('Error unassigning template from owner:', error);
    return false;
  }

  return true;
}

export async function getTemplatesByOwner(ownerId: string): Promise<ManagementFeeTemplateWithItems[]> {
  const { data: assignments, error } = await supabase
    .from('owner_management_fee_assignments')
    .select('template_id')
    .eq('owner_id', ownerId);

  if (error || !assignments) {
    console.error('Error fetching owner templates:', error);
    return [];
  }

  const templates: ManagementFeeTemplateWithItems[] = [];
  for (const assignment of assignments) {
    const template = await getManagementFeeTemplateWithItems(String(assignment.template_id));
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
    const { data: ships } = await supabase
      .from('ships')
      .select('id')
      .eq('fleet_id', entityId);

    if (ships && ships.length > 0) {
      const shipIds = ships.map(s => String(s.id));

      const allShipAssignments = await getShipManagementFeeAssignments();
      const toRemove = allShipAssignments.filter(a => shipIds.includes(String(a.ship_id)));

      for (const assignment of toRemove) {
        const success = await unassignTemplateFromShip(assignment.ship_id, assignment.template_id);
        if (success) removedShips++;
      }
    }
  } else if (level === 'owner') {
    const { data: fleets } = await supabase
      .from('fleets')
      .select('id')
      .eq('owner_id', entityId);

    const fleetIds = (fleets || []).map(f => String(f.id));

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

    if (fleetIds.length > 0) {
      const allFleetAssignments = await getFleetManagementFeeAssignments();
      const fleetsToRemove = allFleetAssignments.filter(a => fleetIds.includes(String(a.fleet_id)));

      for (const assignment of fleetsToRemove) {
        const success = await unassignTemplateFromFleet(assignment.fleet_id, assignment.template_id);
        if (success) removedFleets++;
      }
    }

    if (ownerShipIds.length > 0) {
      const allShipAssignments = await getShipManagementFeeAssignments();
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
export async function getEffectiveTemplateForShip(shipId: string): Promise<ManagementFeeTemplateWithItems | null> {
  const shipAssignments = await getShipManagementFeeAssignments(shipId);
  if (shipAssignments.length > 0) {
    return await getManagementFeeTemplateWithItems(shipAssignments[0].template_id);
  }

  const { data: ship, error: shipError } = await supabase
    .from('ships')
    .select('fleet_id, owner_id')
    .eq('id', shipId)
    .single();

  if (shipError || !ship) {
    console.error('Error fetching ship:', shipError);
    return null;
  }

  if (ship.fleet_id) {
    const fleetAssignments = await getFleetManagementFeeAssignments(String(ship.fleet_id));
    if (fleetAssignments.length > 0) {
      return await getManagementFeeTemplateWithItems(fleetAssignments[0].template_id);
    }
  }

  if (ship.owner_id) {
    const ownerAssignments = await getOwnerManagementFeeAssignments(String(ship.owner_id));
    if (ownerAssignments.length > 0) {
      return await getManagementFeeTemplateWithItems(ownerAssignments[0].template_id);
    }
  }

  return null;
}

// 여러 선박의 배정된(유효) 관리비 템플릿을 한 번에 계산 (선박마다 개별 조회하지 않도록 벌크 처리)
export async function getEffectiveTemplateMapForShips(
  ships: { id: string; fleet_id?: string | null; owner_id?: string | null }[]
): Promise<Record<string, ManagementFeeTemplate | null>> {
  const [shipAssignments, fleetAssignments, ownerAssignments, templates] = await Promise.all([
    getShipManagementFeeAssignments(),
    getFleetManagementFeeAssignments(),
    getOwnerManagementFeeAssignments(),
    getManagementFeeTemplates(),
  ]);

  const templateMap = new Map(templates.map(t => [t.id, t]));
  const byShip = new Map<string, ShipManagementFeeAssignment[]>();
  shipAssignments.forEach(a => { const arr = byShip.get(a.ship_id) || []; arr.push(a); byShip.set(a.ship_id, arr); });
  const byFleet = new Map<string, FleetManagementFeeAssignment[]>();
  fleetAssignments.forEach(a => { const arr = byFleet.get(a.fleet_id) || []; arr.push(a); byFleet.set(a.fleet_id, arr); });
  const byOwner = new Map<string, OwnerManagementFeeAssignment[]>();
  ownerAssignments.forEach(a => { const arr = byOwner.get(a.owner_id) || []; arr.push(a); byOwner.set(a.owner_id, arr); });

  const result: Record<string, ManagementFeeTemplate | null> = {};
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
}
