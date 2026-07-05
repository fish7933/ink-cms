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

interface User {
  id: string;
  name: string;
  username: string;
  company_id: string;
  user_groups?: {
    id: string;
    name: string;
  };
  companies?: {
    name: string;
  };
}

export default function ApprovalLineForm({ approvalLine, onSuccess, onCancel }: ApprovalLineFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(approvalLine?.name || '');
  const [description, setDescription] = useState(approvalLine?.description || '');
  const [approvalType, setApprovalType] = useState(approvalLine?.approval_type || 'hiring');
  const [isActive, setIsActive] = useState(approvalLine?.is_active ?? true);
  const [steps, setSteps] = useState<ApprovalStep[]>(approvalLine?.steps || []);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      console.log('🔍 Loading users for approval line form...');
      
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        console.log('❌ No current user found');
        return;
      }

      console.log('✅ Current user:', currentUser.username, 'Company ID:', currentUser.company_id);

      // First, get the "선박관리사" group ID
      const { data: shipManagerGroup, error: groupError } = await supabase
        .from('user_groups')
        .select('id, name')
        .eq('name', '선박관리사')
        .single();

      if (groupError) {
        console.error('❌ Error loading 선박관리사 group:', groupError);
      }

      console.log('📋 선박관리사 group:', shipManagerGroup);

      // Get all users with "선박관리사" role, regardless of company
      // Using the correct foreign key relationship: users_company_id_fkey
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          name,
          username,
          company_id,
          user_groups (
            id,
            name
          ),
          companies!users_company_id_fkey (
            name
          )
        `)
        .eq('user_group_id', shipManagerGroup?.id)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('❌ Error loading users:', error);
        throw error;
      }

      console.log('✅ Loaded 선박관리사 users:', data?.length || 0);
      console.log('📋 Users:', data);
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: '오류',
        description: '사용자 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
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
    const user = users.find(u => u.id === approverId);
    if (!user) return;

    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      approver_id: approverId,
      approver_name: user.name,
      approver_role: user.user_groups?.name || '미지정',
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
                          {users.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-gray-500">
                              선박관리사 역할을 가진 사용자가 없습니다
                            </div>
                          ) : (
                            users.map((user) => (
                              <SelectItem key={user.id} value={String(user.id)}>
                                {user.name} ({user.companies?.name || '회사 미지정'}) - {user.user_groups?.name || '미지정'}
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