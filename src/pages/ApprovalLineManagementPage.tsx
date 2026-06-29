import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { ApprovalLine } from '@/types/approval';
import ApprovalLineForm from '@/components/approval/ApprovalLineForm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ApprovalLineWithSteps extends ApprovalLine {
  steps: Array<{
    id: string;
    step_order: number;
    approver_id: string;
    approver_name: string;
    approver_role: string;
  }>;
}

interface StepData {
  order: number;
  user_id: string;
  name: string;
  role: string;
  required: boolean;
}

interface ApprovalUsageInfo {
  canModify: boolean;
  inProgressCount: number;
  completedCount: number;
  totalCount: number;
  message: string;
}

export default function ApprovalLineManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedLine, setSelectedLine] = useState<ApprovalLineWithSteps | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<ApprovalUsageInfo | null>(null);

  useEffect(() => {
    loadApprovalLines();
  }, []);

  const loadApprovalLines = async () => {
    try {
      setLoading(true);
      
      // Use custom getCurrentUser instead of supabase.auth.getUser
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        console.log('❌ No user found in ApprovalLineManagementPage, redirecting to login');
        navigate('/login');
        return;
      }

      console.log('✅ User authenticated in ApprovalLineManagementPage:', currentUser.username);

      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', currentUser.id)
        .single();

      if (!userData) return;

      // Load approval lines
      const { data: lines, error: linesError } = await supabase
        .from('approval_lines')
        .select('*')
        .eq('company_id', userData.company_id)
        .order('created_at', { ascending: false });

      if (linesError) throw linesError;

      // Load steps for each line from approval_line_steps table
      const linesWithSteps = await Promise.all(
        (lines || []).map(async (line) => {
          // Get steps from approval_line_steps table
          const { data: steps, error: stepsError } = await supabase
            .from('approval_line_steps')
            .select('id, step_order, approver_id, approver_name, approver_role')
            .eq('approval_line_id', line.id)
            .order('step_order', { ascending: true });

          if (stepsError) {
            console.error('Error loading steps:', stepsError);
            return {
              ...line,
              steps: [],
            };
          }

          return {
            ...line,
            steps: steps || [],
          };
        })
      );

      setApprovalLines(linesWithSteps);
    } catch (error) {
      console.error('Error loading approval lines:', error);
      toast({
        title: '오류',
        description: '결재 라인을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkApprovalLineUsage = async (approvalLineId: string): Promise<ApprovalUsageInfo> => {
    try {
      console.log('🔍 Checking approval line usage for:', approvalLineId);
      
      // Check if this approval line is being used in any approval requests
      const { data: approvals, error: checkError } = await supabase
        .from('crew_recommendation_approvals')
        .select('id, status')
        .eq('approval_line_id', approvalLineId);

      console.log('📊 Query result:', { 
        approvals, 
        error: checkError,
        count: approvals?.length || 0 
      });

      if (checkError) {
        console.error('❌ Error checking approval line usage:', checkError);
        return {
          canModify: false,
          inProgressCount: 0,
          completedCount: 0,
          totalCount: 0,
          message: `데이터베이스 조회 중 오류가 발생했습니다: ${checkError.message}`,
        };
      }

      if (!approvals || approvals.length === 0) {
        console.log('✅ No approvals found - safe to delete');
        return {
          canModify: true,
          inProgressCount: 0,
          completedCount: 0,
          totalCount: 0,
          message: '',
        };
      }

      // Count approvals by status
      const inProgressCount = approvals.filter(
        (a) => a.status === 'pending' || a.status === 'in_progress'
      ).length;
      const completedCount = approvals.filter(
        (a) => a.status === 'approved' || a.status === 'rejected'
      ).length;
      const totalCount = approvals.length;

      console.log('📈 Usage stats:', { inProgressCount, completedCount, totalCount });

      let message = `이 결재 라인은 총 ${totalCount}건의 결재에서 사용되고 있습니다.\n`;
      
      if (inProgressCount > 0) {
        message += `• 진행 중인 결재: ${inProgressCount}건\n`;
      }
      if (completedCount > 0) {
        message += `• 완료된 결재: ${completedCount}건\n`;
      }
      
      message += '\n결재 라인을 삭제하려면 먼저 관련된 모든 결재 건을 삭제해주세요.';

      return {
        canModify: false,
        inProgressCount,
        completedCount,
        totalCount,
        message,
      };
    } catch (error) {
      console.error('❌ Exception in checkApprovalLineUsage:', error);
      return {
        canModify: false,
        inProgressCount: 0,
        completedCount: 0,
        totalCount: 0,
        message: '사용 여부 확인 중 오류가 발생했습니다.',
      };
    }
  };

  const handleCreate = () => {
    setSelectedLine(undefined);
    setShowDialog(true);
  };

  const handleEdit = async (line: ApprovalLineWithSteps) => {
    console.log('✏️ Attempting to edit approval line:', line.id);
    
    // Check if the approval line is being used
    const usage = await checkApprovalLineUsage(line.id);
    
    if (!usage.canModify && usage.inProgressCount > 0) {
      // Block editing if there are in-progress approvals
      console.log('⚠️ Edit blocked - in-progress approvals exist');
      toast({
        title: '수정할 수 없습니다',
        description: `이 결재 라인은 현재 ${usage.inProgressCount}건의 진행 중인 결재에서 사용 중입니다. 진행 중인 결재가 완료될 때까지 수정할 수 없습니다.`,
        variant: 'destructive',
      });
      return;
    }

    if (!usage.canModify && usage.completedCount > 0) {
      // Show warning but allow editing if only completed approvals exist
      console.log('⚠️ Edit allowed with warning - only completed approvals exist');
      toast({
        title: '주의',
        description: `이 결재 라인은 ${usage.completedCount}건의 완료된 결재에서 사용되었습니다. 수정 시 기존 결재 이력에는 영향을 주지 않습니다.`,
        variant: 'default',
      });
    }

    console.log('✅ Opening edit dialog');
    setSelectedLine(line);
    setShowDialog(true);
  };

  const handleDelete = async () => {
    if (!lineToDelete) return;

    try {
      console.log('🗑️ Attempting to delete approval line:', lineToDelete);
      
      // Check usage again before deleting
      const usage = await checkApprovalLineUsage(lineToDelete);
      console.log('📋 Final usage check result:', usage);

      if (!usage.canModify) {
        console.log('⚠️ Delete blocked - line is in use');
        toast({
          title: '삭제할 수 없습니다',
          description: usage.message,
          variant: 'destructive',
        });
        setDeleteDialogOpen(false);
        setLineToDelete(null);
        setUsageInfo(null);
        return;
      }

      console.log('✅ Safe to delete - proceeding with deletion');

      // First delete all steps associated with this approval line
      console.log('🔄 Deleting approval line steps...');
      const { error: stepsError } = await supabase
        .from('approval_line_steps')
        .delete()
        .eq('approval_line_id', lineToDelete);

      if (stepsError) {
        console.error('❌ Error deleting steps:', stepsError);
        throw stepsError;
      }

      console.log('✅ Steps deleted successfully');

      // Then delete the approval line
      console.log('🔄 Deleting approval line...');
      const { error: lineError } = await supabase
        .from('approval_lines')
        .delete()
        .eq('id', lineToDelete);

      if (lineError) {
        console.error('❌ Error deleting approval line:', lineError);
        throw lineError;
      }

      console.log('✅ Approval line deleted successfully');

      toast({
        title: '성공',
        description: '결재 라인이 삭제되었습니다.',
      });

      loadApprovalLines();
    } catch (error) {
      console.error('❌ Error in handleDelete:', error);
      
      let errorMessage = '결재 라인 삭제 중 오류가 발생했습니다.';
      
      // Check for foreign key constraint error
      if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
        console.error('❌ Foreign key constraint violation detected');
        errorMessage = '이 결재 라인은 다른 결재 건에서 사용 중입니다. 먼저 관련 결재 건을 삭제해주세요.';
      } else if (error instanceof Error) {
        errorMessage += ` (${error.message})`;
      }
      
      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setLineToDelete(null);
      setUsageInfo(null);
    }
  };

  const confirmDelete = async (lineId: string) => {
    console.log('🔔 Delete confirmation requested for:', lineId);
    
    // Check usage before showing delete dialog
    const usage = await checkApprovalLineUsage(lineId);
    console.log('📋 Pre-delete usage check:', usage);
    
    setUsageInfo(usage);
    setLineToDelete(lineId);
    setDeleteDialogOpen(true);
  };

  const toggleActive = async (line: ApprovalLineWithSteps) => {
    try {
      const { error } = await supabase
        .from('approval_lines')
        .update({ is_active: !line.is_active })
        .eq('id', line.id);

      if (error) throw error;

      toast({
        title: '성공',
        description: `결재 라인이 ${!line.is_active ? '활성화' : '비활성화'}되었습니다.`,
      });

      loadApprovalLines();
    } catch (error) {
      console.error('Error toggling approval line:', error);
      toast({
        title: '오류',
        description: '결재 라인 상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">결재 라인 관리</h1>
            <p className="text-gray-600 mt-1">선원 채용 결재 라인을 관리합니다</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            새 결재 라인
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : approvalLines.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-4">등록된 결재 라인이 없습니다</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                첫 결재 라인 만들기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {approvalLines.map((line) => (
              <Card key={line.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle>{line.name}</CardTitle>
                        <Badge variant={line.is_active ? 'default' : 'secondary'}>
                          {line.is_active ? '활성' : '비활성'}
                        </Badge>
                      </div>
                      {line.description && (
                        <p className="text-sm text-gray-600">{line.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(line)}
                      >
                        {line.is_active ? '비활성화' : '활성화'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(line)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => confirmDelete(line.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-700">결재 단계:</p>
                    {line.steps && line.steps.length > 0 ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {line.steps.map((step, index) => (
                          <div key={step.id} className="flex items-center">
                            <Badge variant="outline" className="py-1">
                              <span className="font-semibold mr-2">{step.step_order}단계:</span>
                              {step.approver_name}
                              <span className="text-xs text-gray-500 ml-1">
                                ({step.approver_role})
                              </span>
                            </Badge>
                            {index < line.steps.length - 1 && (
                              <span className="mx-2 text-gray-400">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">결재 단계가 설정되지 않았습니다</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedLine ? '결재 라인 수정' : '새 결재 라인 만들기'}
              </DialogTitle>
            </DialogHeader>
            <ApprovalLineForm
              approvalLine={selectedLine}
              onSuccess={() => {
                setShowDialog(false);
                loadApprovalLines();
              }}
              onCancel={() => setShowDialog(false)}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>결재 라인 삭제</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>이 결재 라인을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
                
                {usageInfo && !usageInfo.canModify && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <p className="text-yellow-800 font-medium text-sm mb-2">
                      ⚠️ 삭제할 수 없습니다
                    </p>
                    <p className="text-yellow-700 text-sm whitespace-pre-line">
                      {usageInfo.message}
                    </p>
                    {usageInfo.totalCount > 0 && (
                      <div className="mt-3 text-sm text-yellow-700">
                        <p className="font-medium mb-1">사용 현황:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {usageInfo.inProgressCount > 0 && (
                            <li>진행 중인 결재: {usageInfo.inProgressCount}건</li>
                          )}
                          {usageInfo.completedCount > 0 && (
                            <li>완료된 결재: {usageInfo.completedCount}건</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {usageInfo && usageInfo.canModify && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-green-800 text-sm">
                      ✅ 이 결재 라인은 현재 사용 중인 결재가 없어 안전하게 삭제할 수 있습니다.
                    </p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                disabled={usageInfo ? !usageInfo.canModify : false}
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}