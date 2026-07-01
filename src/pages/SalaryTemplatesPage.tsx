import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import {
  getSalaryTemplates,
  getSalaryTemplateWithItems,
  deleteSalaryTemplate,
  getSalaryComponents,
  type SalaryTemplate,
  type SalaryTemplateWithItems,
  type SalaryComponent,
} from '@/lib/salary-store';
import { useTabContext } from '@/contexts/TabContext';

export default function SalaryTemplatesPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<SalaryTemplateWithItems | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner'].includes(user.role || '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    const [tmpl, comp] = await Promise.all([getSalaryTemplates(), getSalaryComponents()]);
    setTemplates(tmpl);
    setComponents(comp);
    setLoading(false);
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setExpandedData(null); return; }
    const full = await getSalaryTemplateWithItems(id);
    setExpandedId(id);
    setExpandedData(full);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteSalaryTemplate(id);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">급여 템플릿 관리</CardTitle>
            <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/salary/templates/new', '급여 템플릿 추가')}>
              <Plus className="h-4 w-4" />템플릿 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {templates.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">등록된 급여 템플릿이 없습니다.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">템플릿명</TableHead>
                    <TableHead className="text-xs">통화</TableHead>
                    <TableHead className="text-xs">설명</TableHead>
                    <TableHead className="text-xs">상태</TableHead>
                    <TableHead className="text-right text-xs">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map(t => (
                    <>
                      <TableRow key={t.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium text-sm">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600"
                            onClick={() => toggleExpand(t.id)}
                          >
                            {expandedId === t.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {t.name}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">{t.currency}</TableCell>
                        <TableCell className="text-gray-600 text-sm">{t.description || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-xs">
                            {t.is_active ? '활성' : '비활성'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="gap-1 h-7 px-2"
                              onClick={() => openNewTab(`/salary/templates/${t.id}/edit`, `템플릿 수정: ${t.name}`)}
                            >
                              <Edit2 className="h-3.5 w-3.5" /><span className="text-xs">수정</span>
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(t.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* 상세 보기 */}
                      {expandedId === t.id && expandedData && (
                        <TableRow key={`${t.id}-exp`}>
                          <TableCell colSpan={5} className="bg-gray-50 p-4">
                            <div className="text-xs font-medium mb-3 text-gray-600">직급별 급여 현황</div>
                            {expandedData.ranks.length === 0 ? (
                              <p className="text-xs text-gray-400">등록된 직급 없음</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="text-xs border rounded w-full bg-white">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="text-left p-2 border-r font-semibold sticky left-0 bg-gray-100">직급</th>
                                      {components
                                        .filter(c => expandedData.items.some(i => i.component_id === c.id))
                                        .map(comp => {
                                          const isDeduction = comp.component_type === 'deduction';
                                          return (
                                            <th key={comp.id} className={`text-right p-2 border-r font-semibold min-w-24 ${isDeduction ? 'text-red-600' : ''}`}>
                                              {comp.name}
                                              {isDeduction && <span className="block text-[10px] font-normal text-red-400">공제</span>}
                                            </th>
                                          );
                                        })}
                                      <th className="text-right p-2 font-semibold min-w-20 border-l-2 border-l-gray-300">
                                        <div className="text-[10px] font-bold text-gray-500">TW</div>
                                        <div>월 총액</div>
                                      </th>
                                      <th className="text-right p-2 font-semibold min-w-20 text-blue-700 bg-blue-50">
                                        <div className="text-[10px] font-bold text-blue-500">AW</div>
                                        <div>월 실지급액</div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedData.ranks.map(r => {
                                      // display_order 유지: components 배열 순서로 필터링
                                      const orderedComps = components.filter(c =>
                                        expandedData.items.some(i => i.component_id === c.id)
                                      );
                                      const earningTotal = orderedComps.reduce((s, comp) => {
                                        if ((comp.component_type ?? 'earning') !== 'earning') return s;
                                        return s + (expandedData.items.find(i => i.rank === r && i.component_id === comp.id)?.amount || 0);
                                      }, 0);
                                      const deferred = orderedComps.reduce((s, comp) => {
                                        if ((comp.component_type ?? 'earning') !== 'earning' || comp.payment_type !== 'deferred') return s;
                                        return s + (expandedData.items.find(i => i.rank === r && i.component_id === comp.id)?.amount || 0);
                                      }, 0);
                                      const deduction = orderedComps.reduce((s, comp) => {
                                        if (comp.component_type !== 'deduction') return s;
                                        return s + (expandedData.items.find(i => i.rank === r && i.component_id === comp.id)?.amount || 0);
                                      }, 0);
                                      return (
                                        <tr key={r} className="border-t">
                                          <td className="p-2 border-r font-medium text-gray-700 bg-gray-50 sticky left-0">{r}</td>
                                          {orderedComps.map(comp => {
                                            const item = expandedData.items.find(i => i.rank === r && i.component_id === comp.id);
                                            const isDeduction = comp.component_type === 'deduction';
                                            return (
                                              <td key={comp.id} className={`p-2 border-r text-right ${isDeduction ? 'text-red-600 bg-red-50/20' : ''}`}>
                                                {item ? item.amount.toLocaleString() : '-'}
                                              </td>
                                            );
                                          })}
                                          <td className="p-2 text-right font-semibold border-l-2 border-l-gray-300 bg-gray-50">
                                            {earningTotal.toLocaleString()}
                                          </td>
                                          <td className="p-2 text-right font-bold text-blue-700 bg-blue-50">
                                            {(earningTotal - deferred - deduction).toLocaleString()}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
