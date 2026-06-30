import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { msg } from '@/lib/messages';
import {
  getCurrentUser,
  getShips,
  getCrewMembers,
  getJobApplications,
  getRanks,
  addJobApplication,
  updateJobApplicationStatus,
  getCompanies,
  getFleets
} from '@/lib/store';
import { getJobPostings, addJobPosting, updateJobPosting, deleteJobPosting } from '@/services/job.service';
import { supervisorService } from '@/services/supervisor.service';
import type { User, Ship, CrewMember, JobPosting, JobApplication, Rank, Company, Fleet } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Briefcase, Plus, Send } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import JobPostingTable from '@/components/job/JobPostingTable';
import JobPostingDialog from '@/components/job/JobPostingDialog';
import JobApplicationTable from '@/components/job/JobApplicationTable';
import ApplicationDetailsDialog from '@/components/job/ApplicationDetailsDialog';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';

type ViewMode = 'list' | 'apply';

export default function JobPostingPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [supervisedOwners, setSupervisedOwners] = useState<Company[]>([]);
  const [supervisedFleets, setSupervisedFleets] = useState<Fleet[]>([]);
  const [supervisedShips, setSupervisedShips] = useState<Ship[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);

  const permissions = usePermissions('jobs');

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [selectedRankId, setSelectedRankId] = useState<string>('');
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);

  const [postFormData, setPostFormData] = useState({
    ship_id: '',
    embarkation_date: '',
    contract_period: '',
    salary_range: '',
    special_requirements: '',
    status: 'open' as 'open' | 'closed',
    positions: [] as Array<{ rank_id: string; positions_count: number }>,
  });

  const [applyFormData, setApplyFormData] = useState({
    crew_member_id: '',
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/dashboard');
        return;
      }
      setCurrentUser(user);
      setApplyFormData({ crew_member_id: user.role === 'crew' ? user.id : '' });
      loadData(user);
    };

    loadUser();
  }, [navigate]);

  const loadData = async (user: User) => {
    try {
      const [companiesData, fleetsData, shipsData, crewData, jobsData, appsData, ranksData] = await Promise.all([
        getCompanies(),
        getFleets(),
        getShips(),
        getCrewMembers(),
        getJobPostings(),
        getJobApplications(),
        getRanks(),
      ]);

      setCompanies(companiesData);
      setFleets(fleetsData);
      setShips(shipsData);
      setCrewMembers(crewData);
      setJobPostings(jobsData);
      setJobApplications(appsData);
      setRanks(ranksData);

      console.log('🔍 [JobPostingPage] 사용자 정보:', {
        name: user.name,
        email: user.email,
        role: user.role,
      });
      console.log('📊 [JobPostingPage] 전체 데이터:', {
        companies: companiesData.length,
        fleets: fleetsData.length,
        ships: shipsData.length,
      });

      // Load supervised entities for ship_manager role
      if (user.role === 'ship_manager') {
        try {
          const [supervisedOwnerIds, supervisedFleetIds, supervisedShipIds] = await Promise.all([
            supervisorService.getSupervisedOwners(user.id),
            supervisorService.getSupervisedFleets(user.id),
            supervisorService.getSupervisedShips(user.id),
          ]);

          console.log('🎯 [JobPostingPage] 담당 감독 ID 목록:', {
            ownerIds: supervisedOwnerIds,
            fleetIds: supervisedFleetIds,
            shipIds: supervisedShipIds,
          });

          const filteredOwners = companiesData.filter(company => supervisedOwnerIds.includes(company.id));
          const filteredFleets = fleetsData.filter(fleet => supervisedFleetIds.includes(fleet.id));
          const filteredShips = shipsData.filter(ship => supervisedShipIds.includes(ship.id));

          setSupervisedOwners(filteredOwners);
          setSupervisedFleets(filteredFleets);
          setSupervisedShips(filteredShips);

          console.log('✅ [JobPostingPage] 필터링 완료:', {
            owners: filteredOwners.length,
            fleets: filteredFleets.length,
            ships: filteredShips.length,
          });
          console.log('📋 [JobPostingPage] 필터링된 선주사:', filteredOwners.map(o => o.name));
          console.log('📋 [JobPostingPage] 필터링된 선대:', filteredFleets.map(f => f.name));
          console.log('📋 [JobPostingPage] 필터링된 선박:', filteredShips.map(s => s.name));
        } catch (error) {
          console.error('❌ [JobPostingPage] 담당 감독 데이터 로드 실패:', error);
          setSupervisedOwners([]);
          setSupervisedFleets([]);
          setSupervisedShips([]);
        }
      } else if (user.role === 'ship_owner') {
        // For ship owners, show their own companies, fleets, and ships
        const userCompanies = companiesData.filter(c => c.id === user.company_id);
        const userFleets = fleetsData.filter(f => f.owner_id === user.company_id);
        const userShips = shipsData.filter(s => s.owner_id === user.company_id);

        setSupervisedOwners(userCompanies);
        setSupervisedFleets(userFleets);
        setSupervisedShips(userShips);

        console.log('👔 [JobPostingPage] 선주 데이터:', {
          owners: userCompanies.length,
          fleets: userFleets.length,
          ships: userShips.length,
        });
      } else {
        // For other roles, show all
        setSupervisedOwners(companiesData);
        setSupervisedFleets(fleetsData);
        setSupervisedShips(shipsData);

        console.log('🌐 [JobPostingPage] 전체 데이터 표시 (역할: ' + user.role + ')');
      }
    } catch (error) {
      console.error('❌ [JobPostingPage] 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const canCreateJob = ['ship_owner', 'ship_manager'].includes(currentUser.role);
  const canApply = ['crew', 'manning_agency'].includes(currentUser.role);
  const canReview = ['ship_manager', 'ship_owner'].includes(currentUser.role);

  const availableJobs = jobPostings.filter(job => job.status === 'open');

  const myApplications = currentUser.role === 'crew'
    ? jobApplications.filter(app => app.crew_member_id === currentUser.id)
    : currentUser.role === 'manning_agency'
    ? jobApplications.filter(app => app.applied_by === currentUser.id)
    : jobApplications;

  const myCrews = currentUser.role === 'manning_agency'
    ? crewMembers.filter(c => c.manning_agency_id === currentUser.company_id)
    : [];

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();

    if (postFormData.positions.length === 0) {
      alert('최소 1개 이상의 직급을 추가해주세요');
      return;
    }

    console.log('🚀 [JobPostingPage] 구인 공고 제출 시도:', {
      ship_id: postFormData.ship_id,
      positions: postFormData.positions.length,
    });

    const jobData = {
      ship_id: postFormData.ship_id,
      embarkation_date: postFormData.embarkation_date,
      contract_period: postFormData.contract_period,
      salary_range: postFormData.salary_range,
      special_requirements: postFormData.special_requirements,
      status: postFormData.status,
      created_by: currentUser.id,
    };

    try {
      if (editingJob) {
        await updateJobPosting(editingJob, jobData, postFormData.positions);
      } else {
        await addJobPosting(jobData, postFormData.positions);
      }

      console.log('✅ [JobPostingPage] 구인 공고 제출 성공');
      await loadData(currentUser);
      setIsPostDialogOpen(false);
      resetPostForm();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '공고 등록 중 오류가 발생했습니다.';
      console.error('❌ [JobPostingPage] 구인 공고 제출 실패:', error);
      alert(errorMessage);
    }
  };

  const handleEditJob = (job: JobPosting) => {
    setPostFormData({
      ship_id: job.ship_id || '',
      embarkation_date: job.embarkation_date,
      contract_period: job.contract_period,
      salary_range: job.salary_range,
      special_requirements: job.special_requirements || '',
      status: job.status,
      positions: job.positions?.map(p => ({
        rank_id: p.rank_id,
        positions_count: p.positions_count,
      })) || [],
    });
    setEditingJob(job.id);
    setIsPostDialogOpen(true);
  };

  const handleDeleteJob = async (id: string) => {
    if (confirm('이 구인 공고를 삭제하시겠습니까?')) {
      await deleteJobPosting(id);
      await loadData(currentUser);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || !selectedRankId) return;

    await addJobApplication({
      job_posting_id: selectedJob.id,
      rank_id: selectedRankId,
      crew_member_id: applyFormData.crew_member_id,
      applied_by: currentUser.id,
      status: 'received',
    });
    await loadData(currentUser);
    setViewMode('list');
    setSelectedJob(null);
    setSelectedRankId('');
    resetApplyForm();
  };

  const handleViewApplicationDetails = (application: JobApplication) => {
    setSelectedApplication(application);
    setIsDetailsDialogOpen(true);
  };

  const handleUpdateApplicationStatus = async (id: string, status: JobApplication['status']) => {
    await updateJobApplicationStatus(id, status);
    await loadData(currentUser);
  };

  const resetPostForm = () => {
    setPostFormData({
      ship_id: '',
      embarkation_date: '',
      contract_period: '',
      salary_range: '',
      special_requirements: '',
      status: 'open',
      positions: [],
    });
    setEditingJob(null);
  };

  const resetApplyForm = () => {
    setApplyFormData({
      crew_member_id: currentUser?.role === 'crew' ? currentUser.id : '',
    });
  };

  const getShipName = (shipId: string | null | undefined) => {
    if (!shipId) return 'Unknown';
    return ships.find(s => s.id === shipId)?.name || 'Unknown';
  };

  const getRankName = (rankId: string) => {
    return ranks.find(r => r.id === rankId)?.name || 'Unknown';
  };

  const selectedCrewMember = selectedApplication
    ? crewMembers.find(c => c.id === selectedApplication.crew_member_id)
    : null;

  // --- Inline apply view ---
  if (viewMode === 'apply') {
    return (
      <ProtectedRoute resource="jobs">
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setViewMode('list');
                  setSelectedJob(null);
                  setSelectedRankId('');
                  resetApplyForm();
                }}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                뒤로가기
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>구직 지원</CardTitle>
                {selectedJob && selectedRankId && (
                  <CardDescription>
                    {getShipName(selectedJob.ship_id)} - {getRankName(selectedRankId)} 직급에 지원합니다
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {selectedJob && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-2">
                    <h3 className="font-semibold text-lg">{getShipName(selectedJob.ship_id)}</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedJob.positions?.map((pos, idx) => (
                        <Badge key={idx} variant={pos.rank_id === selectedRankId ? 'default' : 'secondary'}>
                          {getRankName(pos.rank_id)} x {pos.positions_count}명
                        </Badge>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div>승선일: {selectedJob.embarkation_date}</div>
                      <div>계약기간: {selectedJob.contract_period}</div>
                      <div>급여: {selectedJob.salary_range}</div>
                    </div>
                    {selectedJob.special_requirements && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">특별요구사항:</span> {selectedJob.special_requirements}
                      </p>
                    )}
                  </div>
                )}

                <form onSubmit={handleApply} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="crew_member_id">선원 선택 *</Label>
                    <select
                      id="crew_member_id"
                      value={applyFormData.crew_member_id}
                      onChange={(e) => setApplyFormData({crew_member_id: e.target.value})}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                      required
                      disabled={currentUser.role === 'crew'}
                    >
                      <option value="">선택하세요</option>
                      {currentUser.role === 'crew' ? (
                        <option value={currentUser.id}>본인</option>
                      ) : (
                        myCrews.map(crew => (
                          <option key={crew.id} value={crew.id}>
                            {crew.name} ({crew.rank})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1">지원</Button>
                    <Button type="button" variant="outline" onClick={() => {
                      setViewMode('list');
                      setSelectedJob(null);
                      setSelectedRankId('');
                      resetApplyForm();
                    }}>
                      취소
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  // --- Default list view ---
  return (
    <ProtectedRoute resource="jobs">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs defaultValue={canCreateJob ? 'postings' : 'available'} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              {canCreateJob && <TabsTrigger value="postings">내 구인 공고</TabsTrigger>}
              {canApply && <TabsTrigger value="available">구인 공고</TabsTrigger>}
              <TabsTrigger value="applications">지원 현황</TabsTrigger>
            </TabsList>

            {/* My Job Postings */}
            {canCreateJob && (
              <TabsContent value="postings">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>구인 공고 관리</CardTitle>
                        <CardDescription>
                          {currentUser.role === 'ship_manager' && supervisedShips.length > 0
                            ? msg.ship.supervisedPostings(supervisedShips.length)
                            : currentUser.role === 'ship_manager'
                            ? '담당 감독으로 지정된 선박의 구인 공고를 관리하세요'
                            : '등록한 구인 공고를 관리하세요'}
                        </CardDescription>
                      </div>
                      {permissions.canCreate && (
                        <Button
                          className="gap-2"
                          onClick={() => {
                            console.log('🔘 [JobPostingPage] 구인 공고 등록 버튼 클릭');
                            console.log('📋 [JobPostingPage] 다이얼로그에 전달될 데이터:', {
                              owners: supervisedOwners.length,
                              fleets: supervisedFleets.length,
                              ships: supervisedShips.length,
                            });
                            setIsPostDialogOpen(true);
                          }}
                          disabled={currentUser.role === 'ship_manager' && supervisedShips.length === 0}
                        >
                          <Plus className="w-4 h-4" />
                          구인 공고 등록
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {currentUser.role === 'ship_manager' && supervisedShips.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p className="font-medium mb-2">담당 선박이 없습니다</p>
                        <p className="text-sm">담당 감독으로 지정된 선박만 공고를 등록할 수 있습니다.</p>
                        <p className="text-sm">선주에게 요청하여 담당 선박을 할당받으세요.</p>
                      </div>
                    ) : (
                      <JobPostingTable
                        jobPostings={jobPostings}
                        ships={ships}
                        ranks={ranks}
                        onEdit={handleEditJob}
                        onDelete={handleDeleteJob}
                        onViewApplications={(jobId) => {
                          const tab = document.querySelector('[value="applications"]') as HTMLElement;
                          tab?.click();
                        }}
                        canEdit={permissions.canEdit}
                        canDelete={permissions.canDelete}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Available Jobs */}
            {canApply && (
              <TabsContent value="available">
                <Card>
                  <CardHeader>
                    <CardTitle>구인 공고</CardTitle>
                    <CardDescription>지원 가능한 구인 공고를 확인하세요</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {availableJobs.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                          <p>현재 모집 중인 공고가 없습니다</p>
                        </div>
                      ) : (
                        availableJobs.map((job) => (
                          <Card key={job.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-6">
                              <div className="space-y-4">
                                <div className="flex justify-between items-start">
                                  <div className="space-y-2 flex-1">
                                    <h3 className="text-lg font-semibold">{getShipName(job.ship_id)}</h3>
                                    <div className="flex flex-wrap gap-2">
                                      {job.positions?.map((pos, idx) => (
                                        <Badge key={idx} variant="secondary">
                                          {getRankName(pos.rank_id)} x {pos.positions_count}명
                                        </Badge>
                                      ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                                      <div>승선일: {job.embarkation_date}</div>
                                      <div>계약기간: {job.contract_period}</div>
                                      <div>급여: {job.salary_range}</div>
                                    </div>
                                    {job.special_requirements && (
                                      <p className="text-sm text-gray-600 mt-2">
                                        <span className="font-medium">특별요구사항:</span> {job.special_requirements}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2 border-t">
                                  {job.positions?.map((pos) => (
                                    <Button
                                      key={pos.id}
                                      size="sm"
                                      className="gap-2"
                                      onClick={() => {
                                        setSelectedJob(job);
                                        setSelectedRankId(pos.rank_id);
                                        setViewMode('apply');
                                      }}
                                    >
                                      <Send className="w-4 h-4" />
                                      {getRankName(pos.rank_id)} 지원하기
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Applications */}
            <TabsContent value="applications">
              <Card>
                <CardHeader>
                  <CardTitle>지원 현황</CardTitle>
                  <CardDescription>
                    {canReview ? '접수된 지원서를 검토하고 관리하세요' : '지원한 공고의 진행 상황을 확인하세요'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <JobApplicationTable
                    applications={myApplications}
                    crewMembers={crewMembers}
                    ranks={ranks}
                    onViewDetails={handleViewApplicationDetails}
                    onUpdateStatus={handleUpdateApplicationStatus}
                    canUpdateStatus={canReview}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <JobPostingDialog
            open={isPostDialogOpen}
            onOpenChange={(open) => {
              setIsPostDialogOpen(open);
              if (!open) resetPostForm();
            }}
            formData={postFormData}
            onFormDataChange={setPostFormData}
            onSubmit={handleCreateJob}
            isEditing={!!editingJob}
            companies={supervisedOwners}
            fleets={supervisedFleets}
            ships={supervisedShips}
            ranks={ranks}
          />

          <ApplicationDetailsDialog
            open={isDetailsDialogOpen}
            onOpenChange={setIsDetailsDialogOpen}
            application={selectedApplication}
            crewMember={selectedCrewMember}
          />
        </main>
      </div>
    </ProtectedRoute>
  );
}
