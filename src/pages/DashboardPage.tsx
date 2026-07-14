import { useState, useEffect } from 'react';
import { getShips, getCrewMembers, getJobPostings, getJobApplications, getCurrentUser } from '@/lib/store';
import type { User, Ship, CrewMember, JobPosting, JobApplication } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Ship as ShipIcon, Users, Briefcase, FileText, AlertTriangle, Inbox, ChevronRight } from 'lucide-react';
import { UrgentBadge } from '@/components/ui/urgent-badge';
import { useTabContext } from '@/contexts/TabContext';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { approvalService } from '@/services/approval.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import type { JobPostingGroupWithDetails, CrewRecommendationWithDetails } from '@/types/models';

interface MyPendingItem {
  id: string;
  kind: 'crew' | 'document';
  title: string;
  requesterName: string;
  createdAt: string;
}

const REC_STATUS_LABELS: Record<string, string> = { pending: '검토 대기', reviewed: '결재중', accepted: '수락', rejected: '거절' };
const REC_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  reviewed: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function DashboardPage() {
  const { openNewTab } = useTabContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ships, setShips] = useState<Ship[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

  // 매닝사 대시보드 전용 데이터 — 채용공고 위젯 + 채용과정(내 추천 현황)
  const [postings, setPostings] = useState<JobPostingGroupWithDetails[]>([]);
  const [myRecs, setMyRecs] = useState<CrewRecommendationWithDetails[]>([]);

  // 내 결재함 위젯 — 지금 내 차례인 결재 건 (선원추천 + 일반 문서)
  const [myPendingApprovals, setMyPendingApprovals] = useState<MyPendingItem[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          return; // Layout will handle redirect
        }
        setCurrentUser(user);

        const [shipsData, crewData, jobsData, appsData] = await Promise.all([
          getShips(),
          getCrewMembers(),
          getJobPostings(),
          getJobApplications(),
        ]);

        setShips(shipsData);
        setCrewMembers(crewData);
        setJobPostings(jobsData);
        setJobApplications(appsData);

        if (user.role === 'manning_agency' && user.company_id) {
          const [postingsData, recsData] = await Promise.all([
            jobPostingGroupService.getAll(),
            crewRecommendationService.getByManningAgency(user.company_id),
          ]);
          setPostings(postingsData.filter(p => p.status === 'active'));
          setMyRecs(recsData);
        }

        // 결재함에 접근 가능한 역할(default-menu.ts의 approval-inbox roles)만 내 결재함 위젯을 계산한다.
        // 관리자 계정이라도 실제로 내 차례인 건만 보여준다 — 계정 권한(admin/system_admin)과
        // 결재라인상 실제 담당자는 별개다(결재함 화면과 동일한 기준).
        if (['ship_manager', 'manning_agency', 'admin', 'system_admin'].includes(user.role)) {
          await loadMyPendingApprovals(user);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // 내 결재함 위젯 — 사이드바/결재함과 같은 이벤트를 구독해, 결재를 처리하거나(승인/반려)
  // 참조 문서를 열람하는 즉시(60초 폴링을 기다리지 않고) 대시보드에도 반영되게 한다.
  const loadMyPendingApprovals = async (user: User) => {
    const members = await orgChartService.getOrgMembers();
    const myOrgUnitIds = members.find(m => m.id === user.id)?.org_unit_ids || [];

    const [crewApprovals, documents] = await Promise.all([
      approvalService.getMyRelatedApprovals(user.id),
      approvalDocumentService.getMyRelatedDocuments(user.id, myOrgUnitIds),
    ]);

    const myTurnCrew: MyPendingItem[] = crewApprovals
      .filter(a => a.status === 'pending' && a.current_approver?.approver_id === user.id)
      .map(a => ({ id: a.id, kind: 'crew', title: '선원추천 결재', requesterName: a.requester_name, createdAt: a.created_at }));

    const myTurnDocs: MyPendingItem[] = documents
      .filter(d => d.status === 'pending' && d.steps.some(s => s.step_order === d.current_step && s.approver_id === user.id && s.status === 'pending'))
      .map(d => ({ id: d.id, kind: 'document', title: d.title, requesterName: d.creator_name, createdAt: d.created_at }));

    setMyPendingApprovals(
      [...myTurnCrew, ...myTurnDocs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );
  };

  useEffect(() => {
    if (!currentUser || !['ship_manager', 'manning_agency', 'admin', 'system_admin'].includes(currentUser.role)) return;
    const handler = () => loadMyPendingApprovals(currentUser).catch(e => console.error('내 결재함 위젯 갱신 실패', e));
    window.addEventListener('approval-inbox-data-changed', handler);
    window.addEventListener('dispatch-approval-inbox-data-changed', handler);
    return () => {
      window.removeEventListener('approval-inbox-data-changed', handler);
      window.removeEventListener('dispatch-approval-inbox-data-changed', handler);
    };
  }, [currentUser]);

  // 공고별 내 추천 현황 (상태별 건수) — 채용과정 표시용
  const recsByGroup = new Map<string, CrewRecommendationWithDetails[]>();
  for (const rec of myRecs) {
    if (!rec.job_posting_group_id) continue;
    if (!recsByGroup.has(rec.job_posting_group_id)) recsByGroup.set(rec.job_posting_group_id, []);
    recsByGroup.get(rec.job_posting_group_id)!.push(rec);
  }
  const sortedPostings = [...postings].sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === 'urgent' ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const getStats = () => {
    if (!currentUser) return [];
    
    switch (currentUser.role) {
      case 'ship_owner': {
        const myShips = ships.filter(s => s.owner_id === currentUser.company_id);
        const myJobs = jobPostings.filter(j => myShips.some(s => s.id === j.ship_id));
        const myApplications = jobApplications.filter(a => 
          myJobs.some(j => j.id === a.job_posting_id)
        );
        return [
          { label: '보유 선박', value: myShips.length, icon: ShipIcon },
          { label: '구인 중', value: myJobs.filter(j => j.status === 'open').length, icon: Briefcase },
          { label: '대기 지원', value: myApplications.filter(a => a.status === 'sent_to_owner').length, icon: FileText },
        ];
      }
      case 'ship_manager':
        return [
          { label: '전체 선박', value: ships.length, icon: ShipIcon },
          { label: '전체 선원', value: crewMembers.length, icon: Users },
          { label: '구인 공고', value: jobPostings.length, icon: Briefcase },
          { label: '지원서', value: jobApplications.length, icon: FileText },
        ];
      case 'manning_agency': {
        const myCrews = crewMembers.filter(c => c.manning_agency_id === currentUser.company_id);
        return [
          { label: '소속 선원', value: myCrews.length, icon: Users },
          { label: '진행중 공고', value: postings.length, icon: Briefcase },
          { label: '긴급 공고', value: postings.filter(p => p.urgency === 'urgent').length, icon: AlertTriangle },
          { label: '내 추천 건수', value: myRecs.length, icon: FileText },
        ];
      }
      case 'crew': {
        const myApplications = jobApplications.filter(a => a.crew_member_id === currentUser.id);
        return [
          { label: '지원 공고', value: myApplications.length, icon: Briefcase },
          { label: '검토 중', value: myApplications.filter(a => a.status === 'under_review').length, icon: FileText },
          { label: '최종 단계', value: myApplications.filter(a => a.status === 'sent_to_owner').length, icon: ShipIcon },
        ];
      }
      default:
        return [];
    }
  };

  const getRoleDescription = () => {
    if (!currentUser) return '';
    
    switch (currentUser.role) {
      case 'ship_owner':
        return '선박 및 구인 현황을 확인하고 선원 고용을 승인/거절하세요.';
      case 'ship_manager':
        return '선박·선원 현황을 확인하고 업무를 처리하세요.';
      case 'manning_agency':
        return '소속 선원을 대신하여 구인 공고에 지원하고 관리하세요.';
      case 'crew':
        return '구직 활동을 하고 지원 현황을 확인하세요.';
      case 'admin':
      case 'system_admin':
        return '전체 시스템을 관리하고 운영하세요.';
      default:
        return '시스템에 오신 것을 환영합니다.';
    }
  };

  if (loading || !currentUser) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </>
    );
  }

  const stats = getStats();

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {/* Compact Welcome */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            환영합니다, {currentUser.name}님
          </h2>
          <p className="text-sm text-gray-600">{getRoleDescription()}</p>
        </div>

        {/* 내 결재함 — 지금 내 차례인 결재 건. 가장 시급한 정보이므로 최상단에 배치 */}
        {['ship_manager', 'manning_agency', 'admin', 'system_admin'].includes(currentUser.role) && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Inbox className="w-4 h-4" />내 결재함 — 결재 대기 ({myPendingApprovals.length})
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openNewTab('/approval-inbox', '결재함')}>
                  전체 보기<ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {myPendingApprovals.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">지금 결재할 문서가 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {myPendingApprovals.slice(0, 5).map(item => (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className="flex items-center justify-between p-2.5 border rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => openNewTab('/approval-inbox', '결재함')}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.kind === 'crew' ? <Users className="w-4 h-4 text-blue-500 shrink-0" /> : <FileText className="w-4 h-4 text-blue-500 shrink-0" />}
                        <span className="text-sm font-medium truncate">{item.title}</span>
                        <span className="text-xs text-gray-400 shrink-0">{item.requesterName} 기안</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{new Date(item.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                  ))}
                  {myPendingApprovals.length > 5 && (
                    <p className="text-xs text-gray-400 text-center pt-1">외 {myPendingApprovals.length - 5}건 더 있습니다.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 매닝사: 채용공고 위젯 — 가장 중요한 정보이므로 최상단에 배치 */}
        {currentUser.role === 'manning_agency' && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="w-4 h-4" />채용 공고 ({sortedPostings.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {sortedPostings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">현재 진행중인 채용 공고가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {sortedPostings.map(posting => {
                    const recs = recsByGroup.get(posting.id) || [];
                    const statusCounts = recs.reduce<Record<string, number>>((acc, r) => {
                      acc[r.status] = (acc[r.status] || 0) + 1;
                      return acc;
                    }, {});
                    return (
                      <div
                        key={posting.id}
                        className="border rounded-md p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => openNewTab('/job-postings', '구인 공고')}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{posting.ship_name || '선박 미정'}</span>
                            <span className="text-xs text-gray-400">
                              {posting.company_name}{posting.fleet_name ? ` · ${posting.fleet_name}` : ''}
                            </span>
                            {posting.urgency === 'urgent' && <UrgentBadge />}
                          </div>
                          <span className="text-xs text-gray-400">
                            승선(예정)일 {new Date(posting.embarkation_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {posting.ranks.map(r => (
                            <span key={r.id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              {r.rank_code} ({r.positions_available}명)
                            </span>
                          ))}
                        </div>
                        {recs.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-gray-500">채용과정:</span>
                            {Object.entries(statusCounts).map(([status, count]) => (
                              <span key={status} className={`px-1.5 py-0.5 rounded-full ${REC_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                                {REC_STATUS_LABELS[status] || status} {count}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">아직 추천한 선원이 없습니다.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Compact Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-0.5">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Compact Role Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {currentUser.role === 'ship_owner' && '선주 권한 안내'}
              {currentUser.role === 'ship_manager' && '최근 활동'}
              {currentUser.role === 'manning_agency' && '매닝사 권한 안내'}
              {currentUser.role === 'crew' && '선원 권한 안내'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {currentUser.role === 'ship_owner' && (
              <div className="space-y-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-blue-600 mb-1">✓ 조회 가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>본인 소유 선박 정보</li>
                    <li>해당 선박의 급여표</li>
                    <li>해당 선박에 지원한 선원 정보</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-green-600 mb-1">✓ 승인/거절 가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>선원 고용 승인/거절</li>
                    <li>승인/거절/대기중인 선원 목록 확인</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-red-600 mb-1">✗ 불가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>선박 생성/수정/삭제</li>
                    <li>급여표 생성/수정</li>
                    <li>선원 정보 수정</li>
                  </ul>
                </div>
              </div>
            )}
            {currentUser.role === 'ship_manager' && (
              <div className="text-center py-6 text-gray-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">최근 활동 내역이 여기에 표시됩니다</p>
              </div>
            )}
            {currentUser.role === 'manning_agency' && (
              <div className="space-y-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-blue-600 mb-1">✓ 조회 가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>선박 목록 및 정보</li>
                    <li>급여표 확인</li>
                    <li>구인 공고 확인</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-green-600 mb-1">✓ 생성 가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>선원을 대신한 구직 지원</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-red-600 mb-1">✗ 불가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>선박 수정/삭제</li>
                    <li>급여 수정</li>
                    <li>선원 정보 수정</li>
                  </ul>
                </div>
              </div>
            )}
            {currentUser.role === 'crew' && (
              <div className="space-y-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-blue-600 mb-1">✓ 조회 가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>본인이 지원한 구직 현황</li>
                    <li>본인의 지원 상태</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-green-600 mb-1">✓ 생성 가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>구직 지원</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-red-600 mb-1">✗ 불가능</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-3">
                    <li>다른 선원 정보 조회</li>
                    <li>선박/급여 정보 접근</li>
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
