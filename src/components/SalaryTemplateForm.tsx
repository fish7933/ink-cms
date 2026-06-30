import { useState, useEffect } from 'react';
import { Save, X, CheckSquare, Square, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  getSalaryComponents,
  getSalaryTemplates,
  getSalaryTemplateWithItems,
  addSalaryTemplate,
  updateSalaryTemplate,
  type SalaryComponent,
  type SalaryTemplate,
  type SalaryTemplateWithItems,
} from '@/lib/salary-store';
import { getRanks } from '@/lib/store';
import type { Rank } from '@/types/models';

interface SalaryTemplateFormProps {
  template?: SalaryTemplateWithItems | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function SalaryTemplateForm({ template, onSuccess, onCancel }: SalaryTemplateFormProps) {
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    currency: 'USD',
  });
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [rankSalaries, setRankSalaries] = useState<{ [rank: string]: { [componentId: string]: number } }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copyFromTemplateId, setCopyFromTemplateId] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        currency: template.currency,
      });
      
      // Load ranks from template
      setSelectedRanks(template.ranks || []);
      
      // Load components and amounts - ensure string IDs
      const componentIds = [...new Set(template.items.map(item => String(item.component_id)))];
      setSelectedComponents(componentIds);
      
      // Build rank salaries structure
      const salaries: { [rank: string]: { [componentId: string]: number } } = {};
      template.items.forEach(item => {
        const rank = item.rank || template.rank || '';
        if (!salaries[rank]) {
          salaries[rank] = {};
        }
        salaries[rank][String(item.component_id)] = item.amount;
      });
      setRankSalaries(salaries);
    } else {
      // For new template, select all ranks and components by default
      loadData().then(() => {
        // This will be set after data loads
      });
    }
  }, [template]);

  const loadData = async () => {
    const [componentsData, ranksData, templatesData] = await Promise.all([
      getSalaryComponents(),
      getRanks(),
      getSalaryTemplates(),
    ]);
    setComponents(componentsData);
    setRanks(ranksData);
    setTemplates(templatesData);

    // If creating new template, select all by default
    if (!template) {
      const allRankNames = ranksData.map(r => r.name);
      const allComponentIds = componentsData.map(c => String(c.id));
      
      setSelectedRanks(allRankNames);
      setSelectedComponents(allComponentIds);

      // Initialize rank salaries with 0
      const initialSalaries: { [rank: string]: { [componentId: string]: number } } = {};
      allRankNames.forEach(rank => {
        initialSalaries[rank] = {};
        allComponentIds.forEach(compId => {
          initialSalaries[rank][compId] = 0;
        });
      });
      setRankSalaries(initialSalaries);
    }
  };

  const handleCopyFromTemplate = async (templateId: string) => {
    if (!templateId) return;

    const sourceTemplate = await getSalaryTemplateWithItems(templateId);
    if (!sourceTemplate) return;

    // Copy currency
    setFormData(prev => ({
      ...prev,
      currency: sourceTemplate.currency,
    }));

    // Copy ranks
    setSelectedRanks(sourceTemplate.ranks || []);

    // Copy components
    const componentIds = [...new Set(sourceTemplate.items.map(item => String(item.component_id)))];
    setSelectedComponents(componentIds);

    // Copy salary amounts
    const salaries: { [rank: string]: { [componentId: string]: number } } = {};
    sourceTemplate.items.forEach(item => {
      const rank = item.rank || sourceTemplate.rank || '';
      if (!salaries[rank]) {
        salaries[rank] = {};
      }
      salaries[rank][String(item.component_id)] = item.amount;
    });
    setRankSalaries(salaries);

    setCopyFromTemplateId('');
  };

  const handleRankToggle = (rankName: string) => {
    setSelectedRanks(prev => {
      if (prev.includes(rankName)) {
        const newRanks = prev.filter(r => r !== rankName);
        // Remove salary data for deselected rank
        const newRankSalaries = { ...rankSalaries };
        delete newRankSalaries[rankName];
        setRankSalaries(newRankSalaries);
        return newRanks;
      } else {
        // Initialize salary data for new rank
        const newRankSalaries = { ...rankSalaries };
        newRankSalaries[rankName] = {};
        selectedComponents.forEach(compId => {
          newRankSalaries[rankName][compId] = 0;
        });
        setRankSalaries(newRankSalaries);
        return [...prev, rankName];
      }
    });
  };

  const handleSelectAllRanks = () => {
    const allRankNames = ranks.map(r => r.name);
    setSelectedRanks(allRankNames);

    // Initialize salary data for all ranks
    const newRankSalaries = { ...rankSalaries };
    allRankNames.forEach(rank => {
      if (!newRankSalaries[rank]) {
        newRankSalaries[rank] = {};
        selectedComponents.forEach(compId => {
          newRankSalaries[rank][compId] = 0;
        });
      }
    });
    setRankSalaries(newRankSalaries);
  };

  const handleDeselectAllRanks = () => {
    setSelectedRanks([]);
    setRankSalaries({});
  };

  const handleComponentToggle = (componentId: string) => {
    setSelectedComponents(prev => {
      if (prev.includes(componentId)) {
        // Remove component from all ranks
        const newRankSalaries = { ...rankSalaries };
        Object.keys(newRankSalaries).forEach(rank => {
          delete newRankSalaries[rank][componentId];
        });
        setRankSalaries(newRankSalaries);
        return prev.filter(c => c !== componentId);
      } else {
        // Add component to all selected ranks
        const newRankSalaries = { ...rankSalaries };
        selectedRanks.forEach(rank => {
          if (!newRankSalaries[rank]) {
            newRankSalaries[rank] = {};
          }
          newRankSalaries[rank][componentId] = 0;
        });
        setRankSalaries(newRankSalaries);
        return [...prev, componentId];
      }
    });
  };

  const handleSelectAllComponents = () => {
    const allComponentIds = components.map(c => String(c.id));
    setSelectedComponents(allComponentIds);

    // Add all components to all selected ranks
    const newRankSalaries = { ...rankSalaries };
    selectedRanks.forEach(rank => {
      if (!newRankSalaries[rank]) {
        newRankSalaries[rank] = {};
      }
      allComponentIds.forEach(compId => {
        if (!(compId in newRankSalaries[rank])) {
          newRankSalaries[rank][compId] = 0;
        }
      });
    });
    setRankSalaries(newRankSalaries);
  };

  const handleDeselectAllComponents = () => {
    setSelectedComponents([]);
    // Clear all component data from rank salaries
    const newRankSalaries: { [rank: string]: { [componentId: string]: number } } = {};
    Object.keys(rankSalaries).forEach(rank => {
      newRankSalaries[rank] = {};
    });
    setRankSalaries(newRankSalaries);
  };

  const handleAmountChange = (rank: string, componentId: string, value: string) => {
    const amount = parseFloat(value) || 0;
    setRankSalaries(prev => ({
      ...prev,
      [rank]: {
        ...prev[rank],
        [componentId]: amount,
      },
    }));
  };

  const getRankTotal = (rank: string) => {
    if (!rankSalaries[rank]) return 0;
    return selectedComponents.reduce((sum, compId) => {
      const comp = components.find(c => String(c.id) === compId);
      if (comp?.component_type === 'earning') return sum + (rankSalaries[rank]?.[compId] || 0);
      return sum;
    }, 0);
  };

  const getRankDeferred = (rank: string) =>
    selectedComponents.reduce((sum, compId) => {
      const comp = components.find(c => String(c.id) === compId);
      if (comp?.component_type === 'earning' && comp?.payment_type === 'deferred')
        return sum + (rankSalaries[rank]?.[compId] || 0);
      return sum;
    }, 0);

  const getRankDeduction = (rank: string) =>
    selectedComponents.reduce((sum, compId) => {
      const comp = components.find(c => String(c.id) === compId);
      if (comp?.component_type === 'deduction') return sum + (rankSalaries[rank]?.[compId] || 0);
      return sum;
    }, 0);

  const getRankMonthlyPay = (rank: string) =>
    getRankTotal(rank) - getRankDeferred(rank) - getRankDeduction(rank);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: formData.currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('템플릿명을 입력해주세요.');
      return;
    }

    if (selectedRanks.length === 0) {
      setError('최소 1개 이상의 직급을 선택해주세요.');
      return;
    }

    if (selectedComponents.length === 0) {
      setError('최소 1개 이상의 급여 항목을 선택해주세요.');
      return;
    }

    setLoading(true);

    try {
      const templateData = {
        name: formData.name,
        description: formData.description,
        currency: formData.currency,
        is_active: true,
      };

      // Build items array with rank information
      const itemsData: { rank: string; component_id: string; amount: number }[] = [];
      selectedRanks.forEach(rank => {
        selectedComponents.forEach(componentId => {
          itemsData.push({
            rank: rank,
            component_id: componentId,
            amount: rankSalaries[rank]?.[componentId] || 0,
          });
        });
      });

      if (template) {
        // Update existing template
        const updated = await updateSalaryTemplate(String(template.id), templateData, selectedRanks, itemsData);
        if (!updated) {
          setError('급여 템플릿 수정에 실패했습니다.');
          setLoading(false);
          return;
        }
      } else {
        // Add new template
        const added = await addSalaryTemplate(templateData, selectedRanks, itemsData);
        if (!added) {
          setError('급여 템플릿 추가에 실패했습니다.');
          setLoading(false);
          return;
        }
      }

      onSuccess();
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
      console.error('Error saving template:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group ranks by department
  const ranksByDepartment = {
    deck: ranks.filter(r => r.department === 'deck'),
    engine: ranks.filter(r => r.department === 'engine'),
    catering: ranks.filter(r => r.department === 'catering'),
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm">템플릿명 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="예: 2024 급여표"
            required
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency" className="text-sm">통화</Label>
          <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="KRW">KRW</SelectItem>
              <SelectItem value="JPY">JPY</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-sm">설명</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="템플릿에 대한 설명을 입력하세요"
          rows={2}
          className="text-sm"
        />
      </div>

      {!template && templates.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="copyFrom" className="text-sm">기존 템플릿 복사</Label>
          <div className="flex gap-2">
            <Select value={copyFromTemplateId} onValueChange={setCopyFromTemplateId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="복사할 템플릿 선택" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={String(t.id)} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCopyFromTemplate(copyFromTemplateId)}
              disabled={!copyFromTemplateId}
              className="gap-1.5 h-9"
              size="sm"
            >
              <Copy className="h-3.5 w-3.5" />
              복사
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm">직급 선택 * ({selectedRanks.length}개 선택됨)</Label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAllRanks}
              className="gap-1 h-7 text-xs"
            >
              <CheckSquare className="h-3 w-3" />
              전체
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeselectAllRanks}
              className="gap-1 h-7 text-xs"
            >
              <Square className="h-3 w-3" />
              해제
            </Button>
          </div>
        </div>
        <div className="border rounded-md p-3 space-y-2">
          {/* Deck Department */}
          {ranksByDepartment.deck.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5 text-blue-700">갑판부</h4>
              <div className="flex flex-wrap gap-1.5">
                {ranksByDepartment.deck.map((rank) => (
                  <Badge
                    key={rank.id}
                    variant={selectedRanks.includes(rank.name) ? "default" : "outline"}
                    className="cursor-pointer text-xs px-2 py-0.5 h-6"
                    onClick={() => handleRankToggle(rank.name)}
                  >
                    {rank.rank_code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Engine Department */}
          {ranksByDepartment.engine.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5 text-green-700">기관부</h4>
              <div className="flex flex-wrap gap-1.5">
                {ranksByDepartment.engine.map((rank) => (
                  <Badge
                    key={rank.id}
                    variant={selectedRanks.includes(rank.name) ? "default" : "outline"}
                    className="cursor-pointer text-xs px-2 py-0.5 h-6"
                    onClick={() => handleRankToggle(rank.name)}
                  >
                    {rank.rank_code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Catering Department */}
          {ranksByDepartment.catering.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5 text-orange-700">사무부</h4>
              <div className="flex flex-wrap gap-1.5">
                {ranksByDepartment.catering.map((rank) => (
                  <Badge
                    key={rank.id}
                    variant={selectedRanks.includes(rank.name) ? "default" : "outline"}
                    className="cursor-pointer text-xs px-2 py-0.5 h-6"
                    onClick={() => handleRankToggle(rank.name)}
                  >
                    {rank.rank_code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {ranks.length === 0 && (
            <div className="text-center py-4 text-sm text-gray-500">
              등록된 직급이 없습니다. 직급을 먼저 등록해주세요.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm">급여 항목 선택 * ({selectedComponents.length}개 선택됨)</Label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAllComponents}
              className="gap-1 h-7 text-xs"
            >
              <CheckSquare className="h-3 w-3" />
              전체
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeselectAllComponents}
              className="gap-1 h-7 text-xs"
            >
              <Square className="h-3 w-3" />
              해제
            </Button>
          </div>
        </div>
        <div className="border rounded-md p-3 space-y-2">
          {/* 급여 구성 항목 */}
          {components.filter(c => c.component_type === 'earning').length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1.5">급여 구성</div>
              <div className="flex flex-wrap gap-1.5">
                {components.filter(c => c.component_type === 'earning').map((component) => (
                  <Badge
                    key={component.id}
                    variant={selectedComponents.includes(String(component.id)) ? "default" : "outline"}
                    className="cursor-pointer text-xs px-2 py-0.5 h-6 gap-1"
                    onClick={() => handleComponentToggle(String(component.id))}
                  >
                    {component.name}
                    <span className={`text-[10px] opacity-70 ${component.payment_type === 'deferred' ? 'text-amber-300' : ''}`}>
                      {component.payment_type === 'deferred' ? '후불' : '매월'}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {/* 공제 항목 */}
          {components.filter(c => c.component_type === 'deduction').length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-500 mb-1.5">공제</div>
              <div className="flex flex-wrap gap-1.5">
                {components.filter(c => c.component_type === 'deduction').map((component) => (
                  <Badge
                    key={component.id}
                    variant={selectedComponents.includes(String(component.id)) ? "destructive" : "outline"}
                    className="cursor-pointer text-xs px-2 py-0.5 h-6"
                    onClick={() => handleComponentToggle(String(component.id))}
                  >
                    {component.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          </div>
          {components.length === 0 && (
            <div className="text-center py-4 text-sm text-gray-500">
              등록된 급여 항목이 없습니다. 급여 항목을 먼저 등록해주세요.
            </div>
          )}
        </div>
      </div>

      {selectedRanks.length > 0 && selectedComponents.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm">직급별 급여 금액 입력 *</Label>
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-9">
                    <TableHead className="w-24 sticky left-0 bg-white z-10 text-xs py-2">직급</TableHead>
                    {selectedComponents.map(compId => {
                      const comp = components.find(c => String(c.id) === compId);
                      return (
                        <TableHead key={compId} className="text-right min-w-[120px] text-xs py-2">
                          <div>{comp?.name}</div>
                          {comp && (
                            <div className={`text-[10px] font-normal ${
                              comp.component_type === 'deduction' ? 'text-red-400' :
                              comp.payment_type === 'deferred' ? 'text-amber-500' : 'text-blue-400'
                            }`}>
                              {comp.component_type === 'deduction' ? '공제' :
                               comp.payment_type === 'deferred' ? '후불성' : '매월'}
                            </div>
                          )}
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-right font-bold min-w-[120px] text-xs py-2">월 급여 총액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRanks.map(rankName => {
                    const rank = ranks.find(r => r.name === rankName);
                    return (
                      <TableRow key={rankName} className="h-10">
                        <TableCell className="font-medium sticky left-0 bg-white text-xs py-1">
                          {rank?.rank_code || rankName}
                        </TableCell>
                        {selectedComponents.map(compId => (
                          <TableCell key={compId} className="py-1">
                            <Input
                              type="number"
                              value={rankSalaries[rankName]?.[compId] || 0}
                              onChange={(e) => handleAmountChange(rankName, compId, e.target.value)}
                              min="0"
                              step="0.01"
                              className="text-right h-8 text-xs"
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold text-xs py-1">
                          {formatCurrency(getRankTotal(rankName))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* 급여 자동 계산 요약 */}
      {selectedRanks.length > 0 && selectedComponents.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm">급여 계산 요약</Label>
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-9 bg-gray-50">
                    <TableHead className="w-24 sticky left-0 bg-gray-50 text-xs py-2">직급</TableHead>
                    <TableHead className="text-right text-xs py-2">월 급여 총액</TableHead>
                    <TableHead className="text-right text-xs text-amber-600 py-2">후불성</TableHead>
                    <TableHead className="text-right text-xs text-red-500 py-2">공제</TableHead>
                    <TableHead className="text-right text-xs font-bold text-blue-700 py-2">월 실지급액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRanks.map(rankName => {
                    const rank = ranks.find(r => r.name === rankName);
                    const total = getRankTotal(rankName);
                    const deferred = getRankDeferred(rankName);
                    const deduction = getRankDeduction(rankName);
                    const monthlyPay = getRankMonthlyPay(rankName);
                    return (
                      <TableRow key={rankName} className="h-9">
                        <TableCell className="font-medium sticky left-0 bg-white text-xs py-1">
                          {rank?.rank_code || rankName}
                        </TableCell>
                        <TableCell className="text-right text-xs py-1">{formatCurrency(total)}</TableCell>
                        <TableCell className="text-right text-xs text-amber-600 py-1">
                          {deferred > 0 ? `-${formatCurrency(deferred)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs text-red-500 py-1">
                          {deduction > 0 ? `-${formatCurrency(deduction)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-blue-700 py-1">
                          {formatCurrency(monthlyPay)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            월 실지급액 = 월 급여 총액 − 후불성(하선 후 지급) − 공제
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading} size="sm" className="h-9">
          <X className="h-3.5 w-3.5 mr-1.5" />
          취소
        </Button>
        <Button type="submit" disabled={loading} size="sm" className="h-9">
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {loading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}