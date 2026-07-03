import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getRanks } from '@/lib/store';
import type { Rank } from '@/types/models';
import {
  getSalaryTemplateWithItems,
  getSalaryComponents,
  type SalaryTemplateWithItems,
  type SalaryComponent,
} from '@/lib/salary-store';
import SalaryTemplateMatrixTable from './SalaryTemplateMatrixTable';

interface SalaryTemplateViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateName?: string;
}

/**
 * 급여 템플릿 상세(직급/등급별 급여 현황) 보기 모달.
 * ShipDialog(선박 상세)와 ShipTable(선박 목록, 배정된 템플릿 클릭)에서 공용으로 사용.
 */
export default function SalaryTemplateViewDialog({ open, onOpenChange, templateId, templateName }: SalaryTemplateViewDialogProps) {
  const [data, setData] = useState<SalaryTemplateWithItems | null>(null);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  const loadData = async (id: string) => {
    const [full, comp, rnk] = await Promise.all([getSalaryTemplateWithItems(id), getSalaryComponents(), getRanks()]);
    setData(full);
    setComponents(comp);
    setRanks(rnk);
  };

  useEffect(() => {
    if (open && templateId) {
      setData(null);
      loadData(templateId);
    }
  }, [open, templateId]);

  // 다른 탭에서 템플릿을 수정/저장하면 열려있는 모달도 최신화
  useEffect(() => {
    const handler = () => { if (open && templateId) loadData(templateId); };
    window.addEventListener('salary-template-data-changed', handler);
    return () => window.removeEventListener('salary-template-data-changed', handler);
  }, [open, templateId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{data?.name || templateName} — 직급별 급여 현황</DialogTitle>
        </DialogHeader>
        {!data ? (
          <p className="text-xs text-gray-400 py-6 text-center">불러오는 중...</p>
        ) : (
          <div className="overflow-auto">
            <SalaryTemplateMatrixTable template={data} components={components} ranks={ranks} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
