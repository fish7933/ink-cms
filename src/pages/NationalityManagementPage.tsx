import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getNationalities, addNationality, updateNationality, deleteNationality } from '@/services/nationality.service';
import type { User } from '@/types/models';
import type { Nationality } from '@/types/nationality';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Globe, ArrowLeft, Save } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export default function NationalityManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    country_code: '',
    country_name_en: '',
    country_name_ko: '',
    region: 'asia' as 'asia' | 'europe' | 'americas' | 'africa' | 'oceania',
    is_major_supplier: false,
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
      const data = await getNationalities(false);
      setNationalities(data);
    } catch (error) {
      console.error('Error loading nationalities:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      country_code: '',
      country_name_en: '',
      country_name_ko: '',
      region: 'asia',
      is_major_supplier: false,
      is_active: true,
      display_order: 999,
    });
  };

  const openForm = (nationality?: Nationality) => {
    if (nationality) {
      setFormData({
        country_code: nationality.country_code,
        country_name_en: nationality.country_name_en,
        country_name_ko: nationality.country_name_ko,
        region: nationality.region || 'asia',
        is_major_supplier: nationality.is_major_supplier || false,
        is_active: nationality.is_active !== false,
        display_order: nationality.display_order || 999,
      });
      setFormView({ id: nationality.id });
    } else {
      resetForm();
      setFormView({});
    }
  };

  const closeForm = () => {
    setFormView(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (formView?.id) {
        await updateNationality(formView.id, formData);
      } else {
        await addNationality(formData);
      }

      closeForm();
      resetForm();
      await loadData();
    } catch (error) {
      console.error('Error saving nationality:', error);
      alert('국적 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 국적을 삭제하시겠습니까?')) return;

    try {
      await deleteNationality(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting nationality:', error);
      alert('국적 삭제 중 오류가 발생했습니다.');
    }
  };

  const getRegionName = (region?: string) => {
    const regionMap: Record<string, string> = {
      asia: '아시아',
      europe: '유럽',
      americas: '아메리카',
      africa: '아프리카',
      oceania: '오세아니아',
    };
    return region ? regionMap[region] || region : '-';
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

  const majorSuppliers = nationalities.filter(n => n.is_major_supplier);
  const otherCountries = nationalities.filter(n => !n.is_major_supplier);

  const renderNationalityTable = (items: Nationality[], emptyMessage: string) => (
    items.length === 0 ? (
      <div className="text-center py-8 text-sm text-gray-500">
        {emptyMessage}
      </div>
    ) : (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-20">순서</TableHead>
              <TableHead className="text-xs w-24">코드</TableHead>
              <TableHead className="text-xs">영문명</TableHead>
              <TableHead className="text-xs">한글명</TableHead>
              <TableHead className="text-xs">지역</TableHead>
              <TableHead className="text-xs">상태</TableHead>
              <TableHead className="text-right text-xs w-24">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(nationality => (
              <TableRow key={nationality.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openForm(nationality)}>
                <TableCell className="text-sm">{nationality.display_order}</TableCell>
                <TableCell className="text-sm font-mono font-semibold">{nationality.country_code}</TableCell>
                <TableCell className="text-sm">{nationality.country_name_en}</TableCell>
                <TableCell className="text-sm font-medium">{nationality.country_name_ko}</TableCell>
                <TableCell className="text-sm">{getRegionName(nationality.region)}</TableCell>
                <TableCell>
                  {nationality.is_active ? (
                    <Badge variant="secondary" className="text-xs">활성</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">비활성</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(nationality.id)}
                    className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  );

  return (
    <>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {formView !== null && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}>
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    {formView !== null ? (formView.id ? '국적 수정' : '국적 추가') : '선원 국적 관리'}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formView !== null ? '국적 정보를 입력하세요' : '주요 선원 송출국 및 국적 데이터 관리'}
                  </p>
                </div>
              </div>
              {formView !== null ? (
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />
                  {saving ? '저장 중...' : '저장'}
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}>
                  <Plus className="w-3.5 h-3.5" />
                  국적 추가
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {formView !== null ? (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="country_code" className="text-xs">
                      국가 코드 * (ISO 3166-1 alpha-2)
                    </Label>
                    <Input
                      id="country_code"
                      value={formData.country_code}
                      onChange={(e) => setFormData({ ...formData, country_code: e.target.value.toUpperCase() })}
                      placeholder="예: KR, PH, US"
                      maxLength={2}
                      required
                      disabled={!!formView.id}
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="region" className="text-xs">지역 *</Label>
                    <Select
                      value={formData.region}
                      onValueChange={(value: 'asia' | 'europe' | 'americas' | 'africa' | 'oceania') =>
                        setFormData({ ...formData, region: value })
                      }
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asia" className="text-sm">아시아</SelectItem>
                        <SelectItem value="europe" className="text-sm">유럽</SelectItem>
                        <SelectItem value="americas" className="text-sm">아메리카</SelectItem>
                        <SelectItem value="africa" className="text-sm">아프리카</SelectItem>
                        <SelectItem value="oceania" className="text-sm">오세아니아</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="country_name_en" className="text-xs">영문명 *</Label>
                    <Input
                      id="country_name_en"
                      value={formData.country_name_en}
                      onChange={(e) => setFormData({ ...formData, country_name_en: e.target.value })}
                      placeholder="예: South Korea"
                      required
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country_name_ko" className="text-xs">한글명 *</Label>
                    <Input
                      id="country_name_ko"
                      value={formData.country_name_ko}
                      onChange={(e) => setFormData({ ...formData, country_name_ko: e.target.value })}
                      placeholder="예: 대한민국"
                      required
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="display_order" className="text-xs">표시 순서</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 999 })}
                    min={1}
                    className="h-9 text-sm w-32"
                  />
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_major_supplier"
                      checked={formData.is_major_supplier}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_major_supplier: checked === true })
                      }
                    />
                    <Label htmlFor="is_major_supplier" className="text-xs cursor-pointer">
                      주요 선원 송출국
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
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">주요 선원 송출국 ({majorSuppliers.length})</h3>
                  {renderNationalityTable(majorSuppliers, '등록된 주요 송출국이 없습니다')}
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">기타 국가 ({otherCountries.length})</h3>
                  {renderNationalityTable(otherCountries, '등록된 기타 국가가 없습니다')}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
