import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrgUnit, OrgMember } from '@/types/org-chart';

interface OrgUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: OrgUnit | null; // null = 신규 생성
  defaultParentId: string | null;
  units: OrgUnit[]; // 상위 부서 선택지 (자기 자신 및 하위 부서 제외 처리는 호출부에서)
  unitMembers: OrgMember[]; // 이 부서 소속 인원 (부서장 후보)
  onSave: (data: { name: string; parent_id: string | null; head_user_id: string | null; display_order: number }) => Promise<void>;
}

export function OrgUnitDialog({ open, onOpenChange, unit, defaultParentId, units, unitMembers, onSave }: OrgUnitDialogProps) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('_none');
  const [headUserId, setHeadUserId] = useState<string>('_auto');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(unit?.name || '');
    setParentId(unit ? (unit.parent_id || '_none') : (defaultParentId || '_none'));
    setHeadUserId(unit?.head_user_id || '_auto');
    setDisplayOrder(unit?.display_order ?? 0);
  }, [open, unit, defaultParentId]);

  const handleSave = async () => {
    if (!name.trim()) { alert('부서명을 입력해주세요.'); return; }
    try {
      setSaving(true);
      await onSave({
        name: name.trim(),
        parent_id: parentId === '_none' ? null : parentId,
        head_user_id: headUserId === '_auto' ? null : headUserId,
        display_order: displayOrder,
      });
      onOpenChange(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{unit ? '부서 수정' : '부서 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">부서명 *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: 인사팀" className="h-8 text-sm" disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">상위 부서</Label>
            <Select value={parentId} onValueChange={setParentId} disabled={saving}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="상위 부서 선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— 최상위 부서 —</SelectItem>
                {units.map(u => <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">부서장 <span className="text-gray-400 font-normal">(지정 안 하면 소속 인원 중 최상위 직급이 자동 부서장)</span></Label>
            <Select value={headUserId} onValueChange={setHeadUserId} disabled={saving}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="자동" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_auto">— 자동(최상위 직급) —</SelectItem>
                {unitMembers.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-sm">{m.name}{m.position_name ? ` (${m.position_name})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unitMembers.length === 0 && (
              <p className="text-xs text-gray-400">아직 이 부서에 소속된 인원이 없습니다. 먼저 구성원을 추가하면 부서장으로 지정할 수 있습니다.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">표시 순서</Label>
            <Input type="number" value={displayOrder} onChange={e => setDisplayOrder(parseInt(e.target.value) || 0)} className="h-8 text-sm" disabled={saving} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
