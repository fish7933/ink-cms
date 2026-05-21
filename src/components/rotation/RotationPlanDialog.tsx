import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { rotationService } from '@/services/rotation.service';
import { getCurrentUser } from '@/lib/store';
import type {
  CrewRotationPlanWithDetails,
  CrewRotationAssignmentInput,
  CrewMemberForRotation,
} from '@/types/rotation';
import type { Company } from '@/types/models';
import type { Fleet } from '@/types/models';
import type { Ship } from '@/types/models';
import { supabase } from '@/lib/supabase';

interface RotationPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: CrewRotationPlanWithDetails | null;
  onSuccess: () => void;
}

export function RotationPlanDialog({
  open,
  onOpenChange,
  plan,
  onSuccess,
}: RotationPlanDialogProps) {
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [onboardCrew, setOnboardCrew] = useState<CrewMemberForRotation[]>([]);
  const [standbyCrew, setStandbyCrew] = useState<CrewMemberForRotation[]>([]);

  const [formData, setFormData] = useState({
    owner_id: '',
    fleet_id: '',
    ship_id: '',
    plan_name: '',
    rotation_date: '',
    notes: '',
  });

  const [assignments, setAssignments] = useState<CrewRotationAssignmentInput[]>([]);

  useEffect(() => {
    if (open) {
      loadOwners();
      loadStandbyCrew();
      if (plan) {
        setFormData({
          owner_id: plan.owner_id,
          fleet_id: plan.fleet_id || '',
          ship_id: plan.ship_id,
          plan_name: plan.plan_name,
          rotation_date: plan.rotation_date,
          notes: plan.notes || '',
        });
        setAssignments(
          plan.assignments.map((a) => ({
            off_crew_id: a.off_crew_id,
            off_rank_id: a.off_rank_id,
            on_crew_id: a.on_crew_id,
            on_rank_id: a.on_rank_id,
            contract_months: a.contract_months,
            salary_template_id: a.salary_template_id,
            salary_amount: a.salary_amount,
            salary_currency: a.salary_currency,
            embark_date: a.embark_date,
            notes: a.notes,
          }))
        );
      } else {
        resetForm();
      }
    }
  }, [open, plan]);

  useEffect(() => {
    if (formData.owner_id) {
      loadFleets(formData.owner_id);
    }
  }, [formData.owner_id]);

  useEffect(() => {
    if (formData.fleet_id) {
      loadShips(formData.fleet_id);
    }
  }, [formData.fleet_id]);

  useEffect(() => {
    if (formData.ship_id) {
      loadOnboardCrew(formData.ship_id);
    }
  }, [formData.ship_id]);

  const resetForm = () => {
    setFormData({
      owner_id: '',
      fleet_id: '',
      ship_id: '',
      plan_name: '',
      rotation_date: '',
      notes: '',
    });
    setAssignments([]);
  };

  const loadOwners = async () => {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('company_type', 'owner')
      .order('name');
    if (data) setOwners(data);
  };

  const loadFleets = async (ownerId: string) => {
    const { data } = await supabase
      .from('fleets')
      .select('*')
      .eq('owner_id', ownerId)
      .order('name');
    if (data) setFleets(data);
  };

  const loadShips = async (fleetId: string) => {
    const { data } = await supabase
      .from('ships')
      .select('*')
      .eq('fleet_id', fleetId)
      .order('name');
    if (data) setShips(data);
  };

  const loadOnboardCrew = async (shipId: string) => {
    const crew = await rotationService.getOnboardCrew(shipId);
    setOnboardCrew(crew);
  };

  const loadStandbyCrew = async () => {
    const crew = await rotationService.getStandbyCrew();
    setStandbyCrew(crew);
  };

  const handleAddAssignment = () => {
    setAssignments([
      ...assignments,
      {
        off_crew_id: null,
        off_rank_id: null,
        on_crew_id: null,
        on_rank_id: null,
        contract_months: null,
        salary_template_id: null,
        salary_amount: null,
        salary_currency: 'USD',
        embark_date: formData.rotation_date || '',
        notes: null,
      },
    ]);
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleAssignmentChange = (
    index: number,
    field: keyof CrewRotationAssignmentInput,
    value: string | number | null
  ) => {
    const updated = [...assignments];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-fill rank when selecting off-signing crew
    if (field === 'off_crew_id' && value) {
      const crew = onboardCrew.find((c) => c.id === value);
      if (crew) {
        updated[index].off_rank_id = crew.rank_id;
      }
    }

    // Auto-fill rank when selecting on-signing crew
    if (field === 'on_crew_id' && value) {
      const crew = standbyCrew.find((c) => c.id === value);
      if (crew) {
        updated[index].on_rank_id = crew.rank_id;
      }
    }

    setAssignments(updated);
  };

  const handleSubmit = async () => {
    // Validate at least one assignment
    if (assignments.length === 0) {
      alert('최소 1명의 교대 배정을 추가해주세요.');
      return;
    }

    // Validate each assignment has at least one crew member
    const invalidAssignments = assignments.filter(
      (a) => !a.off_crew_id && !a.on_crew_id
    );
    if (invalidAssignments.length > 0) {
      alert('각 교대 배정에는 하선자 또는 승선자 중 최소 1명이 필요합니다.');
      return;
    }

    // Validate on-signing crew has required fields
    const invalidOnCrew = assignments.filter(
      (a) => a.on_crew_id && (!a.on_rank_id || !a.contract_months)
    );
    if (invalidOnCrew.length > 0) {
      alert('승선자의 직급과 계약기간을 입력해주세요.');
      return;
    }

    setLoading(true);

    const user = await getCurrentUser();
    if (!user) {
      alert('사용자 정보를 불러올 수 없습니다.');
      setLoading(false);
      return;
    }

    const planData = {
      ...formData,
      fleet_id: formData.fleet_id || null,
      created_by: user.id,
    };

    let success = false;
    if (plan) {
      success = await rotationService.updateRotationPlan(plan.id, planData, assignments);
    } else {
      success = await rotationService.createRotationPlan(planData, assignments);
    }

    setLoading(false);

    if (success) {
      onSuccess();
      onOpenChange(false);
    } else {
      alert('교대 계획 저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? '교대 계획 수정' : '새 교대 계획 작성'}</DialogTitle>
          <DialogDescription>
            선원 승선/하선 교대 계획을 작성합니다. 하선만, 승선만, 또는 교대 모두 가능합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>선주사 *</Label>
              <Select
                value={formData.owner_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, owner_id: value, fleet_id: '', ship_id: '' })
                }
                disabled={!!plan}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선주사 선택" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>플릿</Label>
              <Select
                value={formData.fleet_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, fleet_id: value, ship_id: '' })
                }
                disabled={!formData.owner_id || !!plan}
              >
                <SelectTrigger>
                  <SelectValue placeholder="플릿 선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent>
                  {fleets.map((fleet) => (
                    <SelectItem key={fleet.id} value={String(fleet.id)}>
                      {fleet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>선박 *</Label>
              <Select
                value={formData.ship_id}
                onValueChange={(value) => setFormData({ ...formData, ship_id: value })}
                disabled={!formData.fleet_id || !!plan}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선박 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ships.map((ship) => (
                    <SelectItem key={ship.id} value={String(ship.id)}>
                      {ship.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>계획명 *</Label>
              <Input
                value={formData.plan_name}
                onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                placeholder="예: 2024년 1월 교대"
              />
            </div>

            <div className="space-y-2">
              <Label>교대일 *</Label>
              <Input
                type="date"
                value={formData.rotation_date}
                onChange={(e) => setFormData({ ...formData, rotation_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>비고</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="추가 메모"
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">교대 배정</h3>
              <Button type="button" onClick={handleAddAssignment} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                교대 추가
              </Button>
            </div>

            {assignments.map((assignment, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">교대 #{index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAssignment(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>하선자 (선택사항)</Label>
                      <Select
                        value={assignment.off_crew_id || ''}
                        onValueChange={(value) =>
                          handleAssignmentChange(index, 'off_crew_id', value || null)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="하선자 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">선택 안함</SelectItem>
                          {onboardCrew.map((crew) => (
                            <SelectItem key={crew.id} value={String(crew.id)}>
                              {crew.name} ({crew.rank_name})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>승선자 (선택사항)</Label>
                      <Select
                        value={assignment.on_crew_id || ''}
                        onValueChange={(value) =>
                          handleAssignmentChange(index, 'on_crew_id', value || null)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="승선자 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">선택 안함</SelectItem>
                          {standbyCrew.map((crew) => (
                            <SelectItem key={crew.id} value={String(crew.id)}>
                              {crew.name} ({crew.rank_name})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {assignment.on_crew_id && (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>계약기간 (개월) *</Label>
                          <Input
                            type="number"
                            value={assignment.contract_months || ''}
                            onChange={(e) =>
                              handleAssignmentChange(
                                index,
                                'contract_months',
                                e.target.value ? parseInt(e.target.value) : null
                              )
                            }
                            placeholder="6"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>급여</Label>
                          <Input
                            type="number"
                            value={assignment.salary_amount || ''}
                            onChange={(e) =>
                              handleAssignmentChange(
                                index,
                                'salary_amount',
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            placeholder="3000"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>통화</Label>
                          <Select
                            value={assignment.salary_currency}
                            onValueChange={(value) =>
                              handleAssignmentChange(index, 'salary_currency', value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="KRW">KRW</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>승선일</Label>
                        <Input
                          type="date"
                          value={assignment.embark_date}
                          onChange={(e) =>
                            handleAssignmentChange(index, 'embark_date', e.target.value)
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label>비고</Label>
                    <Textarea
                      value={assignment.notes || ''}
                      onChange={(e) =>
                        handleAssignmentChange(index, 'notes', e.target.value || null)
                      }
                      placeholder="추가 메모"
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            {assignments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                교대 배정을 추가해주세요
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '저장 중...' : plan ? '수정' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}