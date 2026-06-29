import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getCertificateTypes, addCertificateType, updateCertificateType, deleteCertificateType } from '@/services/certificate-type.service';
import type { User } from '@/types/models';
import type { CertificateType } from '@/types/certificate-type';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export default function CertificateTypeManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [certificateTypes, setCertificateTypes] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<CertificateType | null>(null);
  
  const [formData, setFormData] = useState({
    category: 'stcw' as 'stcw' | 'national' | 'medical' | 'safety' | 'technical' | 'other',
    type_code: '',
    type_name_en: '',
    type_name_ko: '',
    description: '',
    validity_period_months: undefined as number | undefined,
    is_mandatory: false,
    is_active: true,
    display_order: 999,
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== 'ship_manager') {
        navigate('/dashboard');
        return;
      }
      setCurrentUser(user);
      loadData();
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    try {
      const data = await getCertificateTypes(false);
      setCertificateTypes(data);
    } catch (error) {
      console.error('Error loading certificate types:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: 'stcw',
      type_code: '',
      type_name_en: '',
      type_name_ko: '',
      description: '',
      validity_period_months: undefined,
      is_mandatory: false,
      is_active: true,
      display_order: 999,
    });
    setEditingType(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (type: CertificateType) => {
    setEditingType(type);
    setFormData({
      category: type.category,
      type_code: type.type_code,
      type_name_en: type.type_name_en,
      type_name_ko: type.type_name_ko,
      description: type.description || '',
      validity_period_months: type.validity_period_months || undefined,
      is_mandatory: type.is_mandatory || false,
      is_active: type.is_active !== false,
      display_order: type.display_order || 999,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        ...formData,
        validity_period_months: formData.validity_period_months || null,
      };

      if (editingType) {
        await updateCertificateType(editingType.id, submitData);
      } else {
        await addCertificateType(submitData);
      }
      
      setIsDialogOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      console.error('Error saving certificate type:', error);
      alert('증서 유형 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 증서 유형을 삭제하시겠습니까?')) return;
    
    try {
      await deleteCertificateType(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting certificate type:', error);
      alert('증서 유형 삭제 중 오류가 발생했습니다.');
    }
  };

  const getCategoryName = (category: string) => {
    const categoryMap: Record<string, string> = {
      stcw: 'STCW 증서',
      national: '자국/기국 증서',
      medical: '건강/의료 증서',
      safety: '안전 교육',
      technical: '기술 교육',
      other: '기타',
    };
    return categoryMap[category] || category;
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

  const categories = ['stcw', 'national', 'medical', 'safety', 'technical', 'other'];

  return (
    <>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-6 h-6" />
                증서 유형 관리
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                선원 증서 카테고리 및 유형 관리
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={openAddDialog}
            >
              <Plus className="w-3.5 h-3.5" />
              증서 유형 추가
            </Button>
          </div>
        </div>

        <Tabs defaultValue="stcw" className="w-full">
          <TabsList className="grid w-full grid-cols-6 h-9">
            {categories.map(cat => {
              const count = certificateTypes.filter(t => t.category === cat).length;
              return (
                <TabsTrigger key={cat} value={cat} className="text-xs">
                  {getCategoryName(cat)} ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categories.map(category => {
            const typesInCategory = certificateTypes.filter(t => t.category === category);
            
            return (
              <TabsContent key={category} value={category} className="mt-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{getCategoryName(category)}</CardTitle>
                    <CardDescription className="text-xs">
                      총 {typesInCategory.length}개 증서 유형
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {typesInCategory.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-500">
                        등록된 증서 유형이 없습니다
                      </div>
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-20">순서</TableHead>
                              <TableHead className="text-xs w-32">코드</TableHead>
                              <TableHead className="text-xs">영문명</TableHead>
                              <TableHead className="text-xs">한글명</TableHead>
                              <TableHead className="text-xs w-24">유효기간</TableHead>
                              <TableHead className="text-xs w-20">필수</TableHead>
                              <TableHead className="text-xs w-20">상태</TableHead>
                              <TableHead className="text-right text-xs w-32">작업</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {typesInCategory.map(type => (
                              <TableRow key={type.id}>
                                <TableCell className="text-sm">{type.display_order}</TableCell>
                                <TableCell className="text-sm font-mono">{type.type_code}</TableCell>
                                <TableCell className="text-sm">{type.type_name_en}</TableCell>
                                <TableCell className="text-sm font-medium">{type.type_name_ko}</TableCell>
                                <TableCell className="text-sm">
                                  {type.validity_period_months ? `${type.validity_period_months}개월` : '무기한'}
                                </TableCell>
                                <TableCell>
                                  {type.is_mandatory ? (
                                    <Badge variant="destructive" className="text-xs">필수</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">선택</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {type.is_active ? (
                                    <Badge variant="secondary" className="text-xs">활성</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">비활성</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex gap-1 justify-end">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openEditDialog(type)}
                                      className="h-7 px-2"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDelete(type.id)}
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
            );
          })}
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">
                {editingType ? '증서 유형 수정' : '증서 유형 추가'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {editingType ? '증서 유형 정보를 수정합니다' : '새로운 증서 유형을 등록합니다'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-3 py-3">
                <div className="space-y-1.5">
                  <Label htmlFor="category" className="text-xs">카테고리 *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: 'stcw' | 'national' | 'medical' | 'safety' | 'technical' | 'other') => 
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stcw" className="text-sm">STCW 증서</SelectItem>
                      <SelectItem value="national" className="text-sm">자국/기국 증서</SelectItem>
                      <SelectItem value="medical" className="text-sm">건강/의료 증서</SelectItem>
                      <SelectItem value="safety" className="text-sm">안전 교육</SelectItem>
                      <SelectItem value="technical" className="text-sm">기술 교육</SelectItem>
                      <SelectItem value="other" className="text-sm">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="type_code" className="text-xs">증서 코드 *</Label>
                  <Input
                    id="type_code"
                    value={formData.type_code}
                    onChange={(e) => setFormData({ ...formData, type_code: e.target.value.toUpperCase() })}
                    placeholder="예: STCW_BST, KR_PASSPORT"
                    required
                    disabled={!!editingType}
                    className="h-9 text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="type_name_en" className="text-xs">영문명 *</Label>
                  <Input
                    id="type_name_en"
                    value={formData.type_name_en}
                    onChange={(e) => setFormData({ ...formData, type_name_en: e.target.value })}
                    placeholder="예: Basic Safety Training"
                    required
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="type_name_ko" className="text-xs">한글명 *</Label>
                  <Input
                    id="type_name_ko"
                    value={formData.type_name_ko}
                    onChange={(e) => setFormData({ ...formData, type_name_ko: e.target.value })}
                    placeholder="예: STCW 기본안전교육"
                    required
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs">설명</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="증서에 대한 설명을 입력하세요"
                    className="text-sm min-h-[60px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="validity_period_months" className="text-xs">
                    유효기간 (개월) - 비워두면 무기한
                  </Label>
                  <Input
                    id="validity_period_months"
                    type="number"
                    value={formData.validity_period_months || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      validity_period_months: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                    placeholder="예: 60 (5년)"
                    min={1}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="display_order" className="text-xs">표시 순서</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 999 })}
                    min={1}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_mandatory"
                    checked={formData.is_mandatory}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, is_mandatory: checked === true })
                    }
                  />
                  <Label htmlFor="is_mandatory" className="text-xs cursor-pointer">
                    필수 증서
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, is_active: checked === true })
                    }
                  />
                  <Label htmlFor="is_active" className="text-xs cursor-pointer">
                    활성 상태
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="h-8"
                >
                  취소
                </Button>
                <Button type="submit" size="sm" className="h-8">
                  {editingType ? '수정' : '추가'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}