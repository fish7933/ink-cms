import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTabContext } from '@/contexts/TabContext';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { getCurrentUser } from '@/lib/store';
import type { JobPostingGroupWithDetails, User, CrewRecommendationWithDetails } from '@/types/models';

type RecommendationSortField = 'rank' | 'available_date' | 'manning_agency';

function getDepartmentColor(department: string) {
  switch (department) {
    case 'deck': return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'engine': return 'bg-green-100 text-green-700 border-green-300';
    case 'catering': return 'bg-orange-100 text-orange-700 border-orange-300';
    default: return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

function getRecommendationStatusBadge(status: string) {
  switch (status) {
    case 'pending': return <Badge variant="secondary" className="text-xs">검토대기</Badge>;
    case 'reviewed': return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">검토완료</Badge>;
    case 'accepted': return <Badge variant="default" className="text-xs bg-green-600">수락</Badge>;
    case 'rejected': return <Badge variant="destructive" className="text-xs">거절</Badge>;
    default: return null;
  }
}

export default function JobPostingRecommendationsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { closeTab, activeTabId, openTab, updateTab } = useTabContext();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [posting, setPosting] = useState<JobPostingGroupWithDetails | null>(null);
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const [sortField, setSortField] = useState<RecommendationSortField>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      setLoading(true);
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);

        const postingData = await jobPostingGroupService.getById(groupId);
        setPosting(postingData);
        if (postingData && activeTabId) {
          updateTab(activeTabId, { title: `선원 추천 현황: ${postingData.ship_name}` });
        }

        const recs = user?.role === 'manning_agency' && user.company_id
          ? await crewRecommendationService.getByJobPostingGroupAndAgency(groupId, user.company_id)
          : await crewRecommendationService.getByJobPostingGroup(groupId);
        setRecommendations(recs);
      } catch (error) {
        console.error('Failed to load recommendations:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isManningOrCrew = currentUser?.role === 'manning_agency' || currentUser?.role === 'crew';

  const handleSort = (field: RecommendationSortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...recommendations].sort((a, b) => {
      if (sortField === 'available_date') return dir * a.available_date.localeCompare(b.available_date);
      if (sortField === 'manning_agency') return dir * a.manning_agency_name.localeCompare(b.manning_agency_name, 'ko');
      return dir * a.rank_code.localeCompare(b.rank_code);
    });
  }, [recommendations, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: RecommendationSortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const goToList = () => {
    if (activeTabId) closeTab(activeTabId);
    openTab('/job-postings', '구인 공고');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={goToList} className="h-8 px-2">
          <ArrowLeft className="w-4 h-4 mr-1" />목록
        </Button>
        <h1 className="text-2xl font-bold">
          {isManningOrCrew ? '내 회사 선원 추천 현황' : '선원 추천 현황'} - {posting?.ship_name}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        {recommendations.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {isManningOrCrew ? '아직 추천한 선원이 없습니다.' : '아직 받은 선원 추천이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('rank')}>
                    <span className="flex items-center gap-1">직급<SortIcon field="rank" /></span>
                  </TableHead>
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap">이름</TableHead>
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap">생년월일</TableHead>
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('available_date')}>
                    <span className="flex items-center gap-1">출국가능일<SortIcon field="available_date" /></span>
                  </TableHead>
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap">희망급여</TableHead>
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap">계약기간</TableHead>
                  {!isManningOrCrew && (
                    <TableHead className="text-xs py-1 px-2 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('manning_agency')}>
                      <span className="flex items-center gap-1">매닝사<SortIcon field="manning_agency" /></span>
                    </TableHead>
                  )}
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap">추천일</TableHead>
                  <TableHead className="text-xs py-1 px-2 whitespace-nowrap">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((rec) => (
                  <TableRow key={rec.id} className="hover:bg-muted/50">
                    <TableCell className="py-1 px-2">
                      <Badge variant="outline" className={`text-xs ${getDepartmentColor(rec.department)}`}>
                        {rec.rank_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1 px-2 whitespace-nowrap font-medium">{rec.crew_name}</TableCell>
                    <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                      {new Date(rec.crew_birth_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                      {new Date(rec.available_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                      {rec.desired_currency} {rec.desired_salary.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs py-1 px-2 whitespace-nowrap">{rec.desired_contract_months}개월</TableCell>
                    {!isManningOrCrew && (
                      <TableCell className="text-xs py-1 px-2 whitespace-nowrap">{rec.manning_agency_name}</TableCell>
                    )}
                    <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                      {new Date(rec.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="py-1 px-2">{getRecommendationStatusBadge(rec.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
