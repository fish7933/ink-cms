import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Search, Calendar, Ship, User } from 'lucide-react';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import type { CrewRecommendationWithDetails } from '@/types/models';

export default function CrewRecommendationsPage() {
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { loadRecommendations(); }, []);
  useEffect(() => { filterRecommendations(); }, [recommendations, searchTerm, statusFilter]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      const data = await crewRecommendationService.getAll();
      setRecommendations(data);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRecommendations = () => {
    let filtered = [...recommendations];
    if (statusFilter !== 'all') filtered = filtered.filter(r => r.status === statusFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.crew_name.toLowerCase().includes(term) ||
        r.rank_name.toLowerCase().includes(term) ||
        r.rank_code.toLowerCase().includes(term) ||
        r.manning_agency_name.toLowerCase().includes(term) ||
        r.ship_name?.toLowerCase().includes(term) ||
        r.company_name?.toLowerCase().includes(term)
      );
    }
    setFilteredRecommendations(filtered);
  };

  const handleStatusChange = async (id: string, newStatus: CrewRecommendationWithDetails['status']) => {
    try {
      await crewRecommendationService.updateStatus(id, newStatus);
      await loadRecommendations();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('상태 변경에 실패했습니다.');
    }
  };

  const getStatusBadge = (status: string) => {
    const cfg = {
      pending: { label: '검토 대기', variant: 'secondary' as const },
      reviewed: { label: '검토 완료', variant: 'default' as const },
      accepted: { label: '수락', variant: 'default' as const },
      rejected: { label: '거절', variant: 'destructive' as const },
    };
    const c = cfg[status as keyof typeof cfg] || cfg.pending;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const departmentColors = {
    deck: 'bg-blue-100 text-blue-700 border-blue-300',
    engine: 'bg-green-100 text-green-700 border-green-300',
    catering: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">선원 추천 관리</h1>
        <p className="text-muted-foreground">매닝사로부터 받은 선원 추천을 확인하고 관리합니다.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="선원명, 직급, 매닝사, 선박명으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="상태 필터" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="pending">검토 대기</SelectItem>
                  <SelectItem value="reviewed">검토 완료</SelectItem>
                  <SelectItem value="accepted">수락</SelectItem>
                  <SelectItem value="rejected">거절</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '전체 추천', value: recommendations.length, color: '' },
          { label: '검토 대기', value: recommendations.filter(r => r.status === 'pending').length, color: '' },
          { label: '수락', value: recommendations.filter(r => r.status === 'accepted').length, color: 'text-green-600' },
          { label: '거절', value: recommendations.filter(r => r.status === 'rejected').length, color: 'text-red-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle></CardHeader>
            <CardContent><div className={`text-2xl font-bold ${s.color}`}>{s.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {filteredRecommendations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchTerm || statusFilter !== 'all' ? '검색 조건에 맞는 추천이 없습니다.' : '아직 받은 선원 추천이 없습니다.'}
            </CardContent>
          </Card>
        ) : (
          filteredRecommendations.map(rec => (
            <Card key={rec.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{rec.crew_name}</h3>
                      <Badge className={departmentColors[rec.department as keyof typeof departmentColors]}>{rec.rank_code}</Badge>
                      {getStatusBadge(rec.status)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" /><span>{rec.manning_agency_name}</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /><span>생년월일: {new Date(rec.crew_birth_date).toLocaleDateString('ko-KR')}</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /><span>출국가능: {new Date(rec.available_date).toLocaleDateString('ko-KR')}</span></div>
                      {rec.ship_name && <div className="flex items-center gap-2 text-muted-foreground"><Ship className="h-4 w-4" /><span>{rec.ship_name}</span></div>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  <div><span className="text-muted-foreground">직급:</span><span className="ml-2 font-medium">{rec.rank_name}</span></div>
                  <div><span className="text-muted-foreground">희망급여:</span><span className="ml-2 font-medium">{rec.desired_currency} {rec.desired_salary.toLocaleString()}</span></div>
                  <div><span className="text-muted-foreground">계약기간:</span><span className="ml-2 font-medium">{rec.desired_contract_months}개월</span></div>
                  <div><span className="text-muted-foreground">이력서:</span><span className="ml-2 font-medium">{rec.resume_files.length}개 파일</span></div>
                </div>
                {rec.company_name && (
                  <div className="mb-4 text-sm">
                    <span className="text-muted-foreground">선주사:</span><span className="ml-2 font-medium">{rec.company_name}</span>
                    {rec.fleet_name && <><span className="mx-2 text-muted-foreground">|</span><span className="text-muted-foreground">선대:</span><span className="ml-2 font-medium">{rec.fleet_name}</span></>}
                  </div>
                )}
                {rec.remarks && (
                  <div className="mb-4 p-3 bg-muted rounded-md text-sm">
                    <div className="font-medium mb-1">비고:</div>
                    <div className="text-muted-foreground whitespace-pre-wrap">{rec.remarks}</div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {rec.resume_files.map((file, index) => (
                    <Button key={index} variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" />이력서 {index + 1}</Button>
                  ))}
                  <div className="flex-1" />
                  <Select value={rec.status} onValueChange={v => handleStatusChange(rec.id, v as CrewRecommendationWithDetails['status'])}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">검토 대기</SelectItem>
                      <SelectItem value="reviewed">검토 완료</SelectItem>
                      <SelectItem value="accepted">수락</SelectItem>
                      <SelectItem value="rejected">거절</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}