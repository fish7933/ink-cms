import { useState, useEffect } from 'react';
import { getShips, getCrewMembers, getJobPostings, getJobApplications, getCurrentUser } from '@/lib/store';
import type { User, Ship, CrewMember, JobPosting, JobApplication } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship as ShipIcon, Users, Briefcase, FileText } from 'lucide-react';
import Layout from '@/components/Layout';

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ships, setShips] = useState<Ship[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

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
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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
        const myApplications = jobApplications.filter(a => a.applied_by === currentUser.id);
        return [
          { label: '소속 선원', value: myCrews.length, icon: Users },
          { label: '지원 공고', value: myApplications.length, icon: Briefcase },
          { label: '검토 중', value: myApplications.filter(a => a.status === 'under_review').length, icon: FileText },
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
        return '전체 시스템을 관리하고 운영하세요.';
      case 'manning_agency':
        return '소속 선원을 대신하여 구인 공고에 지원하고 관리하세요.';
      case 'crew':
        return '구직 활동을 하고 지원 현황을 확인하세요.';
      default:
        return '시스템에 오신 것을 환영합니다.';
    }
  };

  if (loading || !currentUser) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const stats = getStats();

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {/* Compact Welcome */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            환영합니다, {currentUser.name}님
          </h2>
          <p className="text-sm text-gray-600">{getRoleDescription()}</p>
        </div>

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
    </Layout>
  );
}
