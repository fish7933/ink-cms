import { useState, useEffect } from 'react';
import { msg } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { X, GripVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { orgChartService } from '@/services/org-chart.service';
import type { OrgUnit, OrgMember } from '@/types/org-chart';

interface ApprovalStep {
  step_order: number;
  approver_id: string;
  approver_name: string;
  approver_role: string;
}

interface ApprovalLineFormProps {
  approvalLine?: {
    id?: string;
    name: string;
    description?: string;
    approval_type?: string;
    is_active: boolean;
    steps: ApprovalStep[];
  };
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ApprovalLineForm({ approvalLine, onSuccess, onCancel }: ApprovalLineFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(approvalLine?.name || '');
  const [description, setDescription] = useState(approvalLine?.description || '');
  const [approvalType, setApprovalType] = useState(approvalLine?.approval_type || 'hiring');
  const [isActive, setIsActive] = useState(approvalLine?.is_active ?? true);
  const [steps, setSteps] = useState<ApprovalStep[]>(approvalLine?.steps || []);
  const [loading, setLoading] = useState(false);

  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState('_none');

  useEffect(() => {
    loadOrgChart();
  }, []);

  const loadOrgChart = async () => {
    try {
      const [u, m] = await Promise.all([orgChartService.getOrgUnits(), orgChartService.getOrgMembers()]);
      setOrgUnits(u);
      setOrgMembers(m);
    } catch (error) {
      console.error('Error loading org chart:', error);
      toast({
        title: '오류',
        description: '조직도/사용자 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const generateFromDept = () => {
    if (selectedDeptId === '_none') { alert('부서를 선택해주세요.'); return; }
    const chain = orgChartService.buildApprovalChain(selectedDeptId, orgUnits, orgMembers);
    if (chain.length === 0) {
      alert('선택한 부서에서 결재라인을 구성할 수 없습니다. 부서장(또는 소속 인원)이 지정되어 있는지 확인해주세요.');
      return;
    }
    setSteps(chain.map((c, i) => ({
      step_order: i + 1,
      approver_id: c.approver_id,
      approver_name: c.approver_name,
      approver_role: c.approver_role,
    })));
  };

  const addStep = () => {
    const newStep: ApprovalStep = {
      step_order: steps.length + 1,
      approver_id: '',
      approver_name: '',
      approver_role: '',
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    // Reorder steps
    newSteps.forEach((step, i) => {
      step.step_order = i + 1;
    });
    setSteps(newSteps);
  };

  const updateStep = (index: number, approverId: string) => {
    const member = orgMembers.find(m => m.id === approverId);
    if (!member) return;

    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      approver_id: approverId,
      approver_name: member.name,
      approver_role: member.position_name || '미지정',
    };
    setSteps(newSteps);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === steps.length - 1)
    ) {
      return;
    }

    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    
    // Update step orders
    newSteps.forEach((step, i) => {
      step.step_order = i + 1;
    });
    
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: '오류',
        description: '결재 라인 이름을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (steps.length === 0) {
      toast({
        title: '오류',
        description: '최소 1명의 결재자를 추가해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (steps.some(step => !step.approver_id)) {
      toast({
        title: '오류',
        description: '모든 단계의 결재자를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);

      const currentUser = await getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      if (approvalLine?.id) {
        // Update existing approval line
        const { error: updateError } = await supabase
          .from('approval_lines')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            approval_type: approvalType,
            is_active: isActive,
          })
          .eq('id', approvalLine.id);

        if (updateError) {
          console.error('Error updating approval line:', updateError);
          throw updateError;
        }

        // Delete existing steps
        const { error: deleteError } = await supabase
          .from('approval_line_steps')
          .delete()
          .eq('approval_line_id', approvalLine.id);

        if (deleteError) {
          console.error('Error deleting existing steps:', deleteError);
          throw deleteError;
        }

        // Insert new steps with all required fields
        const stepsToInsert = steps.map(step => ({
          approval_line_id: approvalLine.id,
          step_order: step.step_order,
          approver_id: step.approver_id,
          approver_name: step.approver_name,
          approver_role: step.approver_role,
        }));

        const { error: insertError } = await supabase
          .from('approval_line_steps')
          .insert(stepsToInsert);

        if (insertError) {
          console.error('Error inserting steps:', insertError);
          throw insertError;
        }
      } else {
        // Create new approval line
        const { data: newLine, error: lineError } = await supabase
          .from('approval_lines')
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            approval_type: approvalType,
            is_active: isActive,
            company_id: currentUser.company_id,
            created_by: currentUser.id,
          })
          .select()
          .single();

        if (lineError) {
          console.error('Error creating approval line:', lineError);
          throw lineError;
        }

        if (!newLine) {
          throw new Error('Failed to create approval line');
        }

        // Insert steps with all required fields
        const stepsToInsert = steps.map(step => ({
          approval_line_id: newLine.id,
          step_order: step.step_order,
          approver_id: step.approver_id,
          approver_name: step.approver_name,
          approver_role: step.approver_role,
        }));

        const { error: insertError } = await supabase
          .from('approval_line_steps')
          .insert(stepsToInsert);

        if (insertError) {
          console.error('Error inserting steps:', insertError);
          throw insertError;
        }
      }

      toast({
        title: '성공',
        description: msg.approval.lineChanged(!!approvalLine?.id),
      });

      onSuccess();
    } catch (error) {
      console.error('Error submitting form:', error);
      
      // Provide more detailed error message
      let errorMessage = '결재 라인 저장 중 오류가 발생했습니다.';
      if (error instanceof Error) {
        errorMessage += ` (${error.message})`;
      }
      
      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">결재 라인 이름 *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 선원 채용 결재"
            required
          />
        </div>

        <div>
          <Label htmlFor="approval_type">결재 유형 *</Label>
          <Select value={approvalType} onValueChange={setApprovalType}>
            <SelectTrigger id="approval_type">
              <SelectValue placeholder="결재 유형 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hiring">채용</SelectItem>
              <SelectItem value="salary_change">급여 변경</SelectItem>
              <SelectItem value="contract">계약</SelectItem>
              <SelectItem value="general">일반</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="description">설명</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="결재 라인에 대한 설명을 입력하세요"
            rows={3}
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="is_active" className="cursor-pointer">활성화</Label>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border bg-gray-50 p-3 space-y-2">
          <Label className="text-sm">조직도에서 자동 생성</Label>
          <p className="text-xs text-gray-500">
            부서를 선택하면 그 부서장 → 상위 부서장 → … 순서로 결재 단계가 자동으로 채워집니다. 생성 후에도 아래에서 자유롭게 추가/삭제/순서 변경할 수 있습니다.
          </p>
          <div className="flex items-center gap-2">
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="부서 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— 부서 선택 —</SelectItem>
                {orgUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" onClick={generateFromDept} disabled={selectedDeptId === '_none'}>
              자동 생성
            </Button>
          </div>
          {orgUnits.length === 0 && (
            <p className="text-xs text-amber-600">등록된 부서가 없습니다. 설정 &gt; 조직도 관리에서 먼저 부서를 만들어주세요.</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Label>결재 단계</Label>
          <Button type="button" onClick={addStep} size="sm">
            단계 추가
          </Button>
        </div>

        {steps.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              결재 단계를 추가해주세요
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveStep(index, 'up')}
                        disabled={index === 0}
                        className="h-6 w-6 p-0"
                      >
                        ▲
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveStep(index, 'down')}
                        disabled={index === steps.length - 1}
                        className="h-6 w-6 p-0"
                      >
                        ▼
                      </Button>
                    </div>

                    <GripVertical className="h-5 w-5 text-gray-400" />

                    <div className="flex-1 flex items-center gap-4">
                      <div className="font-semibold text-lg w-8">
                        {step.step_order}.
                      </div>

                      <Select
                        value={step.approver_id}
                        onValueChange={(value) => updateStep(index, value)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="결재자 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {orgMembers.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-gray-500">
                              선박관리사 직원이 없습니다
                            </div>
                          ) : (
                            orgMembers.map((member) => (
                              <SelectItem key={member.id} value={String(member.id)}>
                                {member.name} ({member.position_name || '직급 미지정'})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStep(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}