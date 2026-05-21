import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getCrewMembers } from '@/services/crew.service';
import { getShips } from '@/services/ship.service';
import {
  getSeaServiceRecords,
  getTrainingRecords,
  getMedicalRecords,
  getCrewSalaryRecords,
  deleteSeaServiceRecord,
} from '@/services/crew-extended.service';
import { updateCrewStatus, getCrewStatusHistory } from '@/services/crew-status.service';
import { getCrewCertificates, deleteCrewCertificate } from '@/services/crew-certificate.service';
import { getAppointmentsByCrew } from '@/services/crew-appointment.service';
import type { User, CrewMember, Ship } from '@/types/models';
import type {
  SeaServiceRecord,
  TrainingRecord,
  MedicalRecord,
  CrewSalaryRecord,
} from '@/types/crew-extended';
import type { CrewStatus, CrewStatusHistory } from '@/types/crew-status';
import type { CrewCertificateWithType } from '@/types/crew-certificate';
import type { CrewAppointment } from '@/types/crew-appointment';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/Layout';
import { ArrowLeft, Plus, RefreshCw, History, Trash2, FileText, AlertCircle, Edit } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import CrewStatusBadge from '@/components/crew/CrewStatusBadge';
import CrewStatusDialog from '@/components/crew/CrewStatusDialog';
import CrewCertificateDialog from '@/components/crew/CrewCertificateDialog';
import SeaServiceDialog from '@/components/crew/SeaServiceDialog';
import { CREW_STATUS_LABELS } from '@/types/crew-status';
import { useToast } from '@/hooks/use-toast';

interface AdditionalStatusData {
  current_ship_id?: string;
  onboard_date?: string;
  offboard_date?: string;
}

export default function CrewDetailPage() {
  const navigate = useNavigate();
  const { crewId } = useParams<{ crewId: string }>();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [crewMember, setCrewMember] = useState<CrewMember | null>(null);
  const [certificates, setCertificates] = useState<CrewCertificateWithType[]>([]);
  const [seaService, setSeaService] = useState<SeaServiceRecord[]>([]);
  const [training, setTraining] = useState<TrainingRecord[]>([]);
  const [medical, setMedical] = useState<MedicalRecord[]>([]);
  const [salary, setSalary] = useState<CrewSalaryRecord[]>([]);
  const [appointments, setAppointments] = useState<CrewAppointment[]>([]);
  const [statusHistory, setStatusHistory] = useState<CrewStatusHistory[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isCertificateDialogOpen, setIsCertificateDialogOpen] = useState(false);
  const [isSeaServiceDialogOpen, setIsSeaServiceDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<CrewCertificateWithType | undefined>(undefined);
  const [editingSeaService, setEditingSeaService] = useState<SeaServiceRecord | undefined>(undefined);

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'ship_owner', 'manning_agency'].includes(user.role)) {
        navigate('/dashboard');
        return;
      }
      setCurrentUser(user);
      if (crewId) {
        loadData(crewId);
      }
    };
    
    loadUser();
  }, [navigate, crewId]);

  const loadData = async (id: string) => {
    try {
      const [crewData, shipsData] = await Promise.all([
        getCrewMembers(),
        getShips(),
      ]);
      
      const crew = crewData.find(c => c.id === id);
      if (!crew) {
        navigate('/crew');
        return;
      }
      setCrewMember(crew);
      setShips(shipsData);

      const [certsData, seaData, trainData, medData, salData, appointData, historyData] = await Promise.all([
        getCrewCertificates(id),
        getSeaServiceRecords(id),
        getTrainingRecords(id),
        getMedicalRecords(id),
        getCrewSalaryRecords(id),
        getAppointmentsByCrew(id),
        getCrewStatusHistory(id),
      ]);

      setCertificates(certsData);
      setSeaService(seaData);
      setTraining(trainData);
      setMedical(medData);
      setSalary(salData);
      setAppointments(appointData);
      setStatusHistory(historyData);
    } catch (error) {
      console.error('Error loading crew data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: CrewStatus, notes: string, additionalData?: AdditionalStatusData) => {
    if (!crewMember || !currentUser) return;

    try {
      await updateCrewStatus(crewMember.id, newStatus, currentUser.id, notes, additionalData);
      await loadData(crewMember.id);
    } catch (error) {
      console.error('Error updating status:', error);
      throw error;
    }
  };

  const handleDeleteCertificate = async (certId: string) => {
    if (!confirm('이 증서를 삭제하시겠습니까?')) return;

    try {
      await deleteCrewCertificate(certId);
      if (crewId) {
        await loadData(crewId);
      }
    } catch (error) {
      console.error('Error deleting certificate:', error);
      toast({
        title: '삭제 실패',
        description: '증서 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleEditCertificate = (cert: CrewCertificateWithType) => {
    setEditingCertificate(cert);
    setIsCertificateDialogOpen(true);
  };

  const handleAddCertificate = () => {
    setEditingCertificate(undefined);
    setIsCertificateDialogOpen(true);
  };

  const handleAddSeaService = () => {
    setEditingSeaService(undefined);
    setIsSeaServiceDialogOpen(true);
  };

  const handleEditSeaService = (record: SeaServiceRecord) => {
    setEditingSeaService(record);
    setIsSeaServiceDialogOpen(true);
  };

  const handleDeleteSeaService = async (recordId: string) => {
    if (!confirm('이 승선 기록을 삭제하시겠습니까?')) return;

    try {
      await deleteSeaServiceRecord(recordId);
      if (crewId) {
        await loadData(crewId);
        toast({
          title: '삭제 완료',
          description: '승선 기록이 삭제되었습니다.',
        });
      }
    } catch (error) {
      console.error('Error deleting sea service record:', error);
      toast({
        title: '삭제 실패',
        description: '승선 기록 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const getCertificateStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      valid: { label: '유효', color: 'bg-green-500' },
      expiring_soon: { label: '만료임박', color: 'bg-yellow-500' },
      expired: { label: '만료', color: 'bg-red-500' },
      pending: { label: '대기중', color: 'bg-gray-500' },
    };
    const info = statusMap[status] || { label: status, color: 'bg-gray-500' };
    return <Badge className={`text-xs ${info.color}`}>{info.label}</Badge>;
  };

  const getRecordTypeBadge = (type: string) => {
    return type === 'pre_company' ? (
      <Badge variant="outline" className="text-xs">입사 전</Badge>
    ) : (
      <Badge className="text-xs bg-blue-500">회사 배치</Badge>
    );
  };

  const getAppointmentTypeBadge = (type: string) => {
    return type === 'boarding' ? (
      <Badge className="text-xs bg-blue-500">승선</Badge>
    ) : (
      <Badge className="text-xs bg-orange-500">하선</Badge>
    );
  };

  const getAppointmentStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      draft: { label: '초안', color: 'bg-gray-500' },
      pending_approval: { label: '승인대기', color: 'bg-yellow-500' },
      approved: { label: '승인됨', color: 'bg-green-500' },
      rejected: { label: '거절됨', color: 'bg-red-500' },
      executed: { label: '실행됨', color: 'bg-blue-500' },
      cancelled: { label: '취소됨', color: 'bg-gray-400' },
    };
    const info = statusMap[status] || { label: status, color: 'bg-gray-500' };
    return <Badge className={`text-xs ${info.color}`}>{info.label}</Badge>;
  };

  const calculateServiceDuration = (signOn: string, signOff?: string) => {
    const startDate = new Date(signOn);
    const endDate = signOff ? new Date(signOff) : new Date();
    const months = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return `${months}개월`;
  };

  if (!currentUser || loading || !crewMember) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/crew')}
            className="gap-1.5 h-8 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            선원 목록으로
          </Button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {crewMember.name}
                <CrewStatusBadge status={crewMember.status as CrewStatus} />
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {crewMember.rank} | {crewMember.nationality}
              </p>
              {crewMember.reviewer_name && crewMember.status === 'under_review' && (
                <p className="text-xs text-blue-600 mt-1">
                  검토자: {crewMember.reviewer_name}
                </p>
              )}
              {crewMember.current_ship_name && crewMember.status === 'onboard' && (
                <p className="text-xs text-cyan-600 mt-1">
                  승선 선박: {crewMember.current_ship_name}
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => setIsStatusDialogOpen(true)}
              className="gap-1.5 h-8"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              상태 변경
            </Button>
          </div>
        </div>

        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-8 h-9">
            <TabsTrigger value="status" className="text-xs">상태</TabsTrigger>
            <TabsTrigger value="biodata" className="text-xs">Bio-Data</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              증서 ({certificates.length})
            </TabsTrigger>
            <TabsTrigger value="sea_service" className="text-xs">
              승선기록 ({seaService.length})
            </TabsTrigger>
            <TabsTrigger value="training" className="text-xs">
              교육훈련 ({training.length})
            </TabsTrigger>
            <TabsTrigger value="medical" className="text-xs">
              상병 ({medical.length})
            </TabsTrigger>
            <TabsTrigger value="salary" className="text-xs">
              급여 ({salary.length})
            </TabsTrigger>
            <TabsTrigger value="appointments" className="text-xs">
              발령 ({appointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">현재 상태</CardTitle>
                  <CardDescription className="text-xs">선원의 현재 처리 상태</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">상태:</span>
                      <CrewStatusBadge status={crewMember.status as CrewStatus} />
                    </div>
                    {crewMember.reviewer_name && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">검토자:</span>
                        <span className="text-sm font-medium">{crewMember.reviewer_name}</span>
                      </div>
                    )}
                    {crewMember.review_started_at && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">검토 시작:</span>
                        <span className="text-sm">{new Date(crewMember.review_started_at).toLocaleString('ko-KR')}</span>
                      </div>
                    )}
                    {crewMember.current_ship_name && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">현재 선박:</span>
                        <span className="text-sm font-medium">{crewMember.current_ship_name}</span>
                      </div>
                    )}
                    {crewMember.status_notes && (
                      <div className="pt-2 border-t">
                        <span className="text-sm text-gray-600 block mb-1">비고:</span>
                        <p className="text-sm">{crewMember.status_notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" />
                    상태 변경 이력
                  </CardTitle>
                  <CardDescription className="text-xs">선원 상태의 모든 변경 기록</CardDescription>
                </CardHeader>
                <CardContent>
                  {statusHistory.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">
                      상태 변경 이력이 없습니다
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {statusHistory.map((history) => (
                        <div key={history.id} className="p-3 bg-gray-50 rounded-lg border text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex gap-2">
                              {history.from_status && (
                                <>
                                  <Badge variant="outline" className="text-xs">
                                    {CREW_STATUS_LABELS[history.from_status as CrewStatus]}
                                  </Badge>
                                  <span className="text-gray-400">→</span>
                                </>
                              )}
                              <CrewStatusBadge status={history.to_status as CrewStatus} />
                            </div>
                          </div>
                          <p className="text-gray-600">
                            {new Date(history.changed_at).toLocaleString('ko-KR')}
                          </p>
                          {history.notes && (
                            <p className="mt-1 text-gray-700">{history.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="biodata" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Bio-Data</CardTitle>
                <CardDescription className="text-xs">선원의 기본 신체 정보 및 비상 연락처</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">신체 정보</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">키:</span>
                        <span>{crewMember.height ? `${crewMember.height}cm` : '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">몸무게:</span>
                        <span>{crewMember.weight ? `${crewMember.weight}kg` : '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">혈액형:</span>
                        <span>{crewMember.blood_type || '-'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">비상 연락처</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-600 block">가족 연락처:</span>
                        <span className="font-medium">{crewMember.next_of_kin || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certificates" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base">증서 관리</CardTitle>
                    <CardDescription className="text-xs">선원의 각종 증서 및 자격증</CardDescription>
                  </div>
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleAddCertificate}>
                    <Plus className="w-3.5 h-3.5" />
                    증서 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {certificates.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    등록된 증서가 없습니다
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">증서 유형</TableHead>
                          <TableHead className="text-xs">증서번호</TableHead>
                          <TableHead className="text-xs">발급일</TableHead>
                          <TableHead className="text-xs">만료일</TableHead>
                          <TableHead className="text-xs">발급기관</TableHead>
                          <TableHead className="text-xs">상태</TableHead>
                          <TableHead className="text-right text-xs w-32">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {certificates.map(cert => (
                          <TableRow key={cert.id}>
                            <TableCell className="text-sm">
                              <div>
                                <div className="font-medium">{cert.certificate_type?.type_name_ko}</div>
                                <Badge variant="outline" className="text-xs mt-1">
                                  {cert.certificate_type?.category}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{cert.certificate_number}</TableCell>
                            <TableCell className="text-sm">
                              {new Date(cert.issue_date).toLocaleDateString('ko-KR')}
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(cert.expiry_date).toLocaleDateString('ko-KR')}
                            </TableCell>
                            <TableCell className="text-sm">{cert.issuing_authority || '-'}</TableCell>
                            <TableCell>
                              {getCertificateStatusBadge(cert.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                {cert.file_url && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => window.open(cert.file_url!, '_blank')}
                                    className="h-7 px-2"
                                  >
                                    <FileText className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditCertificate(cert)}
                                  className="h-7 px-2"
                                >
                                  수정
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteCertificate(cert.id)}
                                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sea_service" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base">승선 기록</CardTitle>
                    <CardDescription className="text-xs">선원의 승선 이력 관리</CardDescription>
                  </div>
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleAddSeaService}>
                    <Plus className="w-3.5 h-3.5" />
                    승선 기록 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {seaService.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    등록된 승선 기록이 없습니다
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">유형</TableHead>
                          <TableHead className="text-xs">선박명</TableHead>
                          <TableHead className="text-xs">선종</TableHead>
                          <TableHead className="text-xs">직급</TableHead>
                          <TableHead className="text-xs">승선일</TableHead>
                          <TableHead className="text-xs">하선일</TableHead>
                          <TableHead className="text-xs">기간</TableHead>
                          <TableHead className="text-right text-xs w-24">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {seaService.map(record => (
                          <TableRow key={record.id}>
                            <TableCell>
                              {getRecordTypeBadge(record.record_type)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">{record.ship_name}</TableCell>
                            <TableCell className="text-sm">{record.ship_type || '-'}</TableCell>
                            <TableCell className="text-sm">{record.rank}</TableCell>
                            <TableCell className="text-sm">
                              {new Date(record.sign_on_date).toLocaleDateString('ko-KR')}
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.sign_off_date ? new Date(record.sign_off_date).toLocaleDateString('ko-KR') : '승선 중'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {calculateServiceDuration(record.sign_on_date, record.sign_off_date)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditSeaService(record)}
                                  className="h-7 px-2"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteSeaService(record.id)}
                                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="training" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">교육훈련 기록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-sm text-gray-500">
                  교육훈련 내용
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medical" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">상병 기록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-sm text-gray-500">
                  상병 내용
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="salary" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">급여 기록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-sm text-gray-500">
                  급여 내용
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base">승/하선 발령</CardTitle>
                    <CardDescription className="text-xs">선원의 승선 및 하선 발령 기록</CardDescription>
                  </div>
                  <Button size="sm" className="gap-1.5 h-8">
                    <Plus className="w-3.5 h-3.5" />
                    발령 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {appointments.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    발령 기록이 없습니다
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">발령 유형</TableHead>
                          <TableHead className="text-xs">선박</TableHead>
                          <TableHead className="text-xs">직급</TableHead>
                          <TableHead className="text-xs">발령일</TableHead>
                          <TableHead className="text-xs">항구</TableHead>
                          <TableHead className="text-xs">상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map(appointment => {
                          const ship = ships.find(s => s.id === appointment.ship_id);
                          return (
                            <TableRow key={appointment.id}>
                              <TableCell>
                                {getAppointmentTypeBadge(appointment.appointment_type)}
                              </TableCell>
                              <TableCell className="text-sm">{ship?.name || '-'}</TableCell>
                              <TableCell className="text-sm">{appointment.rank_id}</TableCell>
                              <TableCell className="text-sm">
                                {new Date(appointment.appointment_date).toLocaleDateString('ko-KR')}
                              </TableCell>
                              <TableCell className="text-sm">
                                {appointment.port_name ? `${appointment.port_name}, ${appointment.port_country}` : '-'}
                              </TableCell>
                              <TableCell>
                                {getAppointmentStatusBadge(appointment.status)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <CrewStatusDialog
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        currentStatus={crewMember.status as CrewStatus}
        onSubmit={handleStatusChange}
        ships={ships}
      />

      {crewId && (
        <>
          <CrewCertificateDialog
            open={isCertificateDialogOpen}
            onOpenChange={setIsCertificateDialogOpen}
            crewId={crewId}
            certificate={editingCertificate}
            onSuccess={() => {
              loadData(crewId);
              setIsCertificateDialogOpen(false);
            }}
          />

          <SeaServiceDialog
            open={isSeaServiceDialogOpen}
            onOpenChange={setIsSeaServiceDialogOpen}
            crewId={crewId}
            record={editingSeaService}
            onSuccess={() => {
              loadData(crewId);
              setIsSeaServiceDialogOpen(false);
            }}
          />
        </>
      )}
    </Layout>
  );
}