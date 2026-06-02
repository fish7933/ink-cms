import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { approvalService } from '@/services/approval.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { CrewRecommendationApprovalWithDetails, CrewRecommendationApproval } from '@/types/approval';
import type { CrewRecommendation } from '@/types/crew-recommendation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Clock, FileText, User, Ship, Calendar, Send } from 'lucide-react';

type ApprovalWithRecommendation = CrewRecommendationApprovalWithDetails & {
  recommendation?: CrewRecommendation;
};

export default function ApprovalManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [allApprovals, setAllApprovals] = useState<ApprovalWithRecommendation[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalWithRecommendation | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      setLoading(true);

      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }

      setCurrentUserId(currentUser.id);

      let approvalDetails: CrewRecommendationApprovalWithDetails[];

      if (currentUser.role === 'admin') {
        // 관리자: 모든 결재 문서 조회
        const { data: allData, error } = await supabase
          .from('crew_recommendation_approvals')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!allData || allData.length === 0) {
          setAllApprovals([]);
          setLoading(false);
          return;
        }
        approvalDetails = await approvalService.getApprovalDetails(allData.map(a => a.id));
      } else {
        // 일반 사용자: 본인이 요청하거나 결재자인 문서만
        const { data: myRequestedApprovals, error: requestedError } = await supabase
          .from('crew_recommendation_approvals')
          .select('*')
          .eq('requester_id', currentUser.id);

        if (requestedError) throw requestedError;

        const { data: myApproverSteps, error: stepsError } = await supabase
          .from('approval_line_steps')
          .select('approval_line_id')
          .eq('approver_id', currentUser.id);

        if (stepsError) throw stepsError;

        const myApprovalLineIds = [...new Set((myApproverSteps || []).map(s => s.approval_line_id))];

        let myApproverApprovals: CrewRecommendationApproval[] = [];
        if (myApprovalLineIds.length > 0) {
          const { data, error: approverApprovalsError } = await supabase
            .from('crew_recommendation_approvals')
            .select('*')
            .in('approval_line_id', myApprovalLineIds);

          if (approverApprovalsError) throw approverApprovalsError;
          myApproverApprovals = data || [];
        }

        const allApprovalIds = new Set([
          ...(myRequestedApprovals || []).map(a => a.id),
          ...myApproverApprovals.map(a => a.id),
        ]);

        if (allApprovalIds.size === 0) {
          setAllApprovals([]);
          setLoading(false);
          return;
        }

        approvalDetails = await approvalService.getApprovalDetails(Array.from(allApprovalIds));
      }

      // Get crew recommendation details
      const crewRecIds = [...new Set(approvalDetails.map(a => a.crew_recommendation_id))];
      const { data: crewRecs, error: creError } = await supabase
        .from('crew_recommendations')
        .select('*')
        .in('id', crewRecIds);

      if (creError) throw creError;

      const crewRecsMap = new Map((crewRecs || []).map(cr => [cr.id, cr]));

      // Combine approval details with crew recommendation data
      const allApprovalsData: ApprovalWithRecommendation[] = approvalDetails.map(approval => ({
        ...approval,
        recommendation: crewRecsMap.get(approval.crew_recommendation_id),
      }));

      // Sort by created_at descending
      allApprovalsData.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setAllApprovals(allApprovalsData);
    } catch (error) {
      console.error('Error loading approvals:', error);
      toast({
        title: '오류',
        description: '결재 문서를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedApproval || !currentUserId) return;

    try {
      setProcessing(true);
      await approvalService.approveStep(selectedApproval.id, currentUserId, comment);
      
      toast({
        title: '승인 완료',
        description: '결재가 승인되었습니다.',
      });

      setSelectedApproval(null);
      setActionType(null);
      setComment('');
      await loadApprovals();
    } catch (error) {
      console.error('Error approving:', error);
      toast({
        title: '오류',
        description: '승인 처리에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApproval || !currentUserId || !comment.trim()) {
      toast({
        title: '오류',
        description: '반려 사유를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      await approvalService.rejectStep(selectedApproval.id, currentUserId, comment);
      
      toast({
        title: '반려 완료',
        description: '결재가 반려되었습니다.',
      });

      setSelectedApproval(null);
      setActionType(null);
      setComment('');
      await loadApprovals();
    } catch (error) {
      console.error('Error rejecting:', error);
      toast({
        title: '오류',
        description: '반려 처리에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />결재중</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />승인</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />반려</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">취소</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isMyTurn = (approval: ApprovalWithRecommendation) => {
    if (approval.status !== 'pending' || !currentUserId) return false;
    return approval.current_approver?.approver_id === currentUserId;
  };

  const renderApprovalCard = (approval: ApprovalWithRecommendation) => {
    const myTurn = isMyTurn(approval);
    const rec = approval.recommendation;

    return (
      <Card key={approval.id} className={myTurn ? 'border-blue-500 border-2' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="text-lg">
                  {rec?.crew_name || '선원 추천'}
                </CardTitle>
                {myTurn && <Badge variant="default" className="bg-blue-500">내 차례</Badge>}
                {getStatusBadge(approval.status)}
              </div>
              <CardDescription className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  <span>결재선: {approval.approval_line.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4" />
                  <span>요청자: {approval.requester_name} {approval.requester_role}</span>
                </div>
                {rec && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <Ship className="w-4 h-4" />
                      <span>선박: {rec.ship_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>승선가능일: {format(new Date(rec.available_date), 'yyyy-MM-dd', { locale: ko })}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>요청일: {format(new Date(approval.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</span>
                </div>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Approval Progress */}
            <div>
              <h4 className="text-sm font-semibold mb-2">결재 진행</h4>
              <div className="space-y-2">
                {/* Requester */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-100 text-blue-700">
                    기안
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{approval.requester_name}</span>
                      <span className="text-sm text-gray-500">{approval.requester_role}</span>
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(approval.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                    </p>
                  </div>
                </div>

                {/* Approvers */}
                {approval.approval_line.steps.map((step, index) => {
                  const action = approval.actions.find(a => a.step_order === step.step_order);
                  const isCurrent = approval.current_step === step.step_order && approval.status === 'pending';
                  
                  return (
                    <div key={step.id} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                        action?.action === 'approved' ? 'bg-green-100 text-green-700' :
                        action?.action === 'rejected' ? 'bg-red-100 text-red-700' :
                        isCurrent ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{step.approver_name}</span>
                          <span className="text-sm text-gray-500">{step.approver_role}</span>
                          {action?.action === 'approved' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                          {action?.action === 'rejected' && <XCircle className="w-4 h-4 text-red-600" />}
                          {isCurrent && <Badge variant="outline" className="text-xs">대기중</Badge>}
                        </div>
                        {action?.comment && (
                          <p className="text-sm text-gray-600 mt-1">{action.comment}</p>
                        )}
                        {action?.created_at && (
                          <p className="text-xs text-gray-400 mt-1">
                            {format(new Date(action.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            {myTurn && (
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => {
                    setSelectedApproval(approval);
                    setActionType('approve');
                  }}
                  className="flex-1"
                >
                  승인
                </Button>
                <Button
                  onClick={() => {
                    setSelectedApproval(approval);
                    setActionType('reject');
                  }}
                  variant="destructive"
                  className="flex-1"
                >
                  반려
                </Button>
              </div>
            )}

            {/* View Details Button for non-pending or not my turn */}
            {(!myTurn || approval.status !== 'pending') && (
              <Button
                onClick={() => setSelectedApproval(approval)}
                variant="outline"
                className="w-full"
              >
                상세보기
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const myRequestedApprovals = allApprovals.filter(a => a.requester_id === currentUserId);
  const pendingApprovals = allApprovals.filter(a => a.status === 'pending');
  const approvedApprovals = allApprovals.filter(a => a.status === 'approved');
  const rejectedApprovals = allApprovals.filter(a => a.status === 'rejected');

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">결재 관리</h1>
          <p className="text-gray-600 mt-2">모든 결재 문서를 확인하고 관리할 수 있습니다.</p>
        </div>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : (
          <>
            <Tabs defaultValue="my-requests" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="my-requests" className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  내가 요청한 문서 ({myRequestedApprovals.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  전체 ({allApprovals.length})
                </TabsTrigger>
                <TabsTrigger value="pending" className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  결재중 ({pendingApprovals.length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  승인 ({approvedApprovals.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  반려 ({rejectedApprovals.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="my-requests" className="space-y-4">
                {myRequestedApprovals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Send className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-gray-600">요청한 결재 문서가 없습니다.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {myRequestedApprovals.map(renderApprovalCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all" className="space-y-4">
                {allApprovals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileText className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-gray-600">결재 문서가 없습니다.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {allApprovals.map(renderApprovalCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pending" className="space-y-4">
                {pendingApprovals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Clock className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-gray-600">결재중인 문서가 없습니다.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {pendingApprovals.map(renderApprovalCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="approved" className="space-y-4">
                {approvedApprovals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CheckCircle2 className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-gray-600">승인된 문서가 없습니다.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {approvedApprovals.map(renderApprovalCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="rejected" className="space-y-4">
                {rejectedApprovals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <XCircle className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-gray-600">반려된 문서가 없습니다.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {rejectedApprovals.map(renderApprovalCard)}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Action Dialog */}
            <Dialog open={actionType !== null} onOpenChange={() => {
              setActionType(null);
              setSelectedApproval(null);
              setComment('');
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {actionType === 'approve' ? '결재 승인' : '결재 반려'}
                  </DialogTitle>
                  <DialogDescription>
                    {actionType === 'approve' 
                      ? '이 결재를 승인하시겠습니까?' 
                      : '이 결재를 반려하시겠습니까? 반려 사유를 입력해주세요.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="comment">
                      {actionType === 'approve' ? '의견 (선택사항)' : '반려 사유 (필수)'}
                    </Label>
                    <Textarea
                      id="comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={actionType === 'approve' ? '의견을 입력하세요...' : '반려 사유를 입력하세요...'}
                      rows={4}
                      className="mt-2"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionType(null);
                      setSelectedApproval(null);
                      setComment('');
                    }}
                    disabled={processing}
                  >
                    취소
                  </Button>
                  <Button
                    onClick={actionType === 'approve' ? handleApprove : handleReject}
                    disabled={processing || (actionType === 'reject' && !comment.trim())}
                    variant={actionType === 'approve' ? 'default' : 'destructive'}
                  >
                    {processing ? '처리중...' : actionType === 'approve' ? '승인' : '반려'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Detail View Dialog - Simplified for brevity */}
            <Dialog open={selectedApproval !== null && actionType === null} onOpenChange={() => setSelectedApproval(null)}>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>결재 상세</DialogTitle>
                </DialogHeader>
                {selectedApproval && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">결재 문서 상세 정보</p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </Layout>
  );
}