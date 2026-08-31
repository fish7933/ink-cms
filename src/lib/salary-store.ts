import { supabase } from './supabase';
import { sortRanksByDisplayOrder } from './rank-order';
import { getCurrentUser } from './store';

// Types
export interface SalaryComponent {
  id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  component_type: 'earning' | 'deduction'; // 급여 구성 항목 vs 공제 항목
  payment_type: 'monthly' | 'deferred';    // 매월 지급 vs 후불성(하선 후) — 선원에게 지급하는 시점
  owner_billing_basis: 'monthly' | 'on_disembark'; // 선주에게 청구하는 시점 — payment_type과 독립적
  skip_deduction_on_partial_month: boolean; // 공제 항목: 승/하선 등 부분월(일할계산 대상)에는 공제하지 않고 0으로 처리
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
  effective_from: string; // 이 버전의 적용 시작일
  effective_until?: string | null; // null = 현재 활성 버전, 값이 있으면 갱신되어 종료된 과거 버전
  root_template_id?: string | null; // 최초 원본 템플릿 id (null이면 이 행 자체가 원본)
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
  rank_grade?: string | null; // null = 해당 직급 전체 공통 금액, 값이 있으면 그 등급 전용
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
    .select('id, name, description, display_order, is_active, component_type, payment_type, owner_billing_basis, skip_deduction_on_partial_month, created_at, updated_at')
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
    owner_billing_basis: (item.owner_billing_basis ?? 'monthly') as 'monthly' | 'on_disembark',
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
    .is('effective_until', null) // 현재 활성 버전만 (갱신되어 종료된 과거 버전은 이력에서만 조회)
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

  // 직급은 항상 직급 관리 화면과 같은 순서(부서별 그룹 + display_order)로 정렬해서 반환
  const { data: allRanks } = await supabase.from('ranks').select('name, department, display_order');
  const sortedRanks = sortRanksByDisplayOrder(allRanks || []);
  const rankOrder = new Map(sortedRanks.map((r, i) => [r.name, i]));
  const ranks = (templateRanks?.map(tr => tr.rank) || [])
    .sort((a, b) => (rankOrder.get(a) ?? 999) - (rankOrder.get(b) ?? 999));

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
  template: { name: string; description?: string; currency: string; is_active: boolean; effective_from?: string },
  ranks: string[],
  items: { rank: string; rank_grade?: string | null; component_id: string; amount: number }[]
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
      rank_grade: item.rank_grade || null,
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
  items?: { rank: string; rank_grade?: string | null; component_id: string; amount: number }[]
): Promise<SalaryTemplate | null> {
  // 적용 시작일(effective_from)이 변경되면, 직전 이력 버전의 종료일(effective_until)도 그에 맞춰 자동 조정
  // (두 버전 사이에 공백/중복 기간이 생기지 않도록 항상 하루 단위로 이어지게 유지)
  if (template.effective_from) {
    const { data: existing, error: existingError } = await supabase
      .from('salary_templates')
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
        .from('salary_templates')
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
          console.error('Error updating salary template: effective_from must be after the previous version\'s effective_from', predecessor.effective_from);
          return null;
        }
        const dayBefore = new Date(template.effective_from);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const newPredecessorUntil = dayBefore.toISOString().slice(0, 10);

        const { error: predUpdateError } = await supabase
          .from('salary_templates')
          .update({ effective_until: newPredecessorUntil })
          .eq('id', predecessor.id);

        if (predUpdateError) {
          console.error('Error adjusting previous version\'s effective_until:', predUpdateError);
          return null;
        }
      }
    }
  }

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
        rank_grade: item.rank_grade || null,
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

// 삭제하려는 템플릿(들)이 선박/플릿/선주에 할당되어 있는지 미리 확인 — 삭제해도 배정 행 자체는
// 남아있어 조용히 비활성 템플릿을 계속 참조하게 되므로, 삭제 전에 경고를 보여주기 위해 사용한다.
export async function getTemplateAssignmentSummary(templateIds: string[]): Promise<{ shipCount: number; fleetCount: number; ownerCount: number; total: number }> {
  if (templateIds.length === 0) return { shipCount: 0, fleetCount: 0, ownerCount: 0, total: 0 };
  const [ship, fleet, owner] = await Promise.all([
    supabase.from('ship_salary_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
    supabase.from('fleet_salary_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
    supabase.from('owner_salary_assignments').select('id', { count: 'exact', head: true }).in('template_id', templateIds),
  ]);
  const shipCount = ship.count || 0;
  const fleetCount = fleet.count || 0;
  const ownerCount = owner.count || 0;
  return { shipCount, fleetCount, ownerCount, total: shipCount + fleetCount + ownerCount };
}

// 특정 템플릿(어느 버전이든)의 전체 이력(원본 + 갱신된 모든 버전)을 최신순으로 조회
export async function getSalaryTemplateHistory(templateId: string): Promise<SalaryTemplate[]> {
  const { data: current, error: currentError } = await supabase
    .from('salary_templates')
    .select('id, root_template_id')
    .eq('id', templateId)
    .single();

  if (currentError || !current) {
    console.error('Error fetching template for history:', currentError);
    return [];
  }

  const root = current.root_template_id ? String(current.root_template_id) : String(current.id);

  const { data, error } = await supabase
    .from('salary_templates')
    .select('*')
    .or(`id.eq.${root},root_template_id.eq.${root}`)
    .order('effective_from', { ascending: false });

  if (error) {
    console.error('Error fetching salary template history:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    id: String(item.id),
    company_id: item.company_id ? String(item.company_id) : undefined,
  })) as SalaryTemplate[];
}

// 갱신 히스토리 중 종료된(과거) 버전 삭제. 삭제 후 앞뒤 버전의 유효기간이 빈 틈 없이 이어붙도록 자동 조정.
export async function deleteSalaryTemplateHistoryVersion(versionId: string): Promise<boolean> {
  const { data: version, error: versionError } = await supabase
    .from('salary_templates')
    .select('id, effective_from, effective_until, root_template_id')
    .eq('id', versionId)
    .single();

  if (versionError || !version) {
    console.error('Error fetching template version to delete:', versionError);
    return false;
  }
  if (!version.effective_until) {
    console.error('Error deleting salary template version: cannot delete the current active version', versionId);
    return false;
  }

  const root = version.root_template_id ? String(version.root_template_id) : versionId;

  const { data: lineage, error: lineageError } = await supabase
    .from('salary_templates')
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
    // 직전 버전의 종료일을 직후 버전의 시작일 하루 전으로 이어붙임 (직후 버전이 없으면 현재 버전이라는 뜻이므로 열어둠)
    let newUntil: string | null = null;
    if (successor) {
      const d = new Date(successor.effective_from);
      d.setDate(d.getDate() - 1);
      newUntil = d.toISOString().slice(0, 10);
    }
    const { error } = await supabase.from('salary_templates').update({ effective_until: newUntil }).eq('id', predecessor.id);
    if (error) {
      console.error('Error extending predecessor version while deleting history:', error);
      return false;
    }
  } else if (successor) {
    // 삭제 대상이 계보의 원본(root)인 경우: 직후 버전이 새 원본이 되고, 시작일을 삭제되는 버전의 시작일까지 흡수
    const { error: rootError } = await supabase
      .from('salary_templates')
      .update({ root_template_id: null, effective_from: version.effective_from })
      .eq('id', successor.id);
    if (rootError) {
      console.error('Error promoting successor to new root while deleting history:', rootError);
      return false;
    }

    const otherDescendantIds = others.filter(v => String(v.id) !== String(successor.id)).map(v => String(v.id));
    if (otherDescendantIds.length > 0) {
      const { error: repointError } = await supabase
        .from('salary_templates')
        .update({ root_template_id: successor.id })
        .in('id', otherDescendantIds);
      if (repointError) {
        console.error('Error repointing lineage to new root while deleting history:', repointError);
        return false;
      }
    }
  }

  await supabase.from('salary_template_items').delete().eq('template_id', versionId);
  await supabase.from('salary_template_ranks').delete().eq('template_id', versionId);
  const { error: deleteError } = await supabase.from('salary_templates').delete().eq('id', versionId);
  if (deleteError) {
    console.error('Error deleting salary template version:', deleteError);
    return false;
  }

  return true;
}

// 급여 인상 등에 대응하기 위한 템플릿 갱신: 새 유효기간 버전을 생성하고, 기존 배정(선박/플릿/선주)을 자동으로 새 버전으로 이전
export async function renewSalaryTemplate(templateId: string, newEffectiveFrom: string): Promise<SalaryTemplate | null> {
  const current = await getSalaryTemplateWithItems(templateId);
  if (!current) {
    console.error('Error renewing salary template: template not found', templateId);
    return null;
  }
  if (current.effective_until) {
    console.error('Error renewing salary template: cannot renew an already-closed historical version', templateId);
    return null;
  }
  if (newEffectiveFrom <= current.effective_from) {
    console.error('Error renewing salary template: new effective_from must be after current effective_from');
    return null;
  }

  const root = current.root_template_id || current.id;

  const newTemplate = await addSalaryTemplate(
    {
      name: current.name,
      description: current.description,
      currency: current.currency,
      is_active: true,
      effective_from: newEffectiveFrom,
    },
    current.ranks,
    current.items.map(i => ({ rank: i.rank || '', rank_grade: i.rank_grade, component_id: i.component_id, amount: i.amount })),
  );

  if (!newTemplate) {
    console.error('Error renewing salary template: failed to create new version');
    return null;
  }

  const { error: rootError } = await supabase
    .from('salary_templates')
    .update({ root_template_id: root, company_id: current.company_id ?? null })
    .eq('id', newTemplate.id);
  if (rootError) console.error('Error linking renewed template to root:', rootError);

  const dayBefore = new Date(newEffectiveFrom);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const effectiveUntil = dayBefore.toISOString().slice(0, 10);

  const { error: closeError } = await supabase
    .from('salary_templates')
    .update({ effective_until: effectiveUntil })
    .eq('id', templateId);
  if (closeError) console.error('Error closing previous template version:', closeError);

  // 기존 배정을 새 버전으로 자동 이전
  const { error: shipError } = await supabase.from('ship_salary_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
  if (shipError) console.error('Error migrating ship salary assignments to renewed template:', shipError);
  const { error: fleetError } = await supabase.from('fleet_salary_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
  if (fleetError) console.error('Error migrating fleet salary assignments to renewed template:', fleetError);
  const { error: ownerError } = await supabase.from('owner_salary_assignments').update({ template_id: newTemplate.id }).eq('template_id', templateId);
  if (ownerError) console.error('Error migrating owner salary assignments to renewed template:', ownerError);

  return { ...newTemplate, root_template_id: root };
}

// 유사한 급여 템플릿을 새로 만들 때 쓰는 복사: 직급 구성/급여 항목을 그대로 복제한 완전히 독립된
// 새 템플릿을 만든다 (renewSalaryTemplate과 달리 root_template_id로 원본과 연결되지 않음 — 별개 템플릿).
export async function copySalaryTemplate(templateId: string, newName: string): Promise<SalaryTemplate | null> {
  const source = await getSalaryTemplateWithItems(templateId);
  if (!source) {
    console.error('Error copying salary template: template not found', templateId);
    return null;
  }

  return addSalaryTemplate(
    {
      name: newName,
      description: source.description,
      currency: source.currency,
      is_active: true,
      effective_from: new Date().toISOString().slice(0, 10),
    },
    source.ranks,
    source.items.map(i => ({ rank: i.rank || '', rank_grade: i.rank_grade, component_id: i.component_id, amount: i.amount })),
  );
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

// 여러 선박의 배정된(유효) 급여 템플릿을 한 번에 계산 (선박 목록에서 선박마다 개별 조회하지 않도록 벌크 처리)
export async function getEffectiveTemplateMapForShips(
  ships: { id: string; fleet_id?: string | null; owner_id?: string | null }[]
): Promise<Record<string, SalaryTemplate | null>> {
  const [shipAssignments, fleetAssignments, ownerAssignments, templates] = await Promise.all([
    getShipSalaryAssignments(),
    getFleetSalaryAssignments(),
    getOwnerSalaryAssignments(),
    getSalaryTemplates(),
  ]);

  const templateMap = new Map(templates.map(t => [t.id, t]));
  const byShip = new Map<string, ShipSalaryAssignment[]>();
  shipAssignments.forEach(a => { const arr = byShip.get(a.ship_id) || []; arr.push(a); byShip.set(a.ship_id, arr); });
  const byFleet = new Map<string, FleetSalaryAssignment[]>();
  fleetAssignments.forEach(a => { const arr = byFleet.get(a.fleet_id) || []; arr.push(a); byFleet.set(a.fleet_id, arr); });
  const byOwner = new Map<string, OwnerSalaryAssignment[]>();
  ownerAssignments.forEach(a => { const arr = byOwner.get(a.owner_id) || []; arr.push(a); byOwner.set(a.owner_id, arr); });

  const result: Record<string, SalaryTemplate | null> = {};
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