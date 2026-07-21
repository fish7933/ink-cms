import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PasteableTableField from '@/components/document/PasteableTableField';
import type { DocumentFormField } from '@/types/approval-document';

interface DynamicDocumentFormProps {
  fields: DocumentFormField[];
  values: Record<string, string | number | null>;
  onChange: (key: string, value: string | number | null) => void;
  disabled?: boolean;
}

// field_schema를 기반으로 문서유형별 구조화 입력폼을 그린다 (기안서 작성 화면에서 사용).
export default function DynamicDocumentForm({ fields, values, onChange, disabled }: DynamicDocumentFormProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(field => {
        const value = values[field.key] ?? '';
        const span = field.type === 'textarea' || field.type === 'table' ? 'col-span-2' : 'col-span-1';
        return (
          <div key={field.key} className={`space-y-1.5 ${span}`}>
            <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
            {field.type === 'textarea' ? (
              <Textarea value={String(value)} onChange={e => onChange(field.key, e.target.value)} rows={3} disabled={disabled} />
            ) : field.type === 'table' ? (
              <PasteableTableField value={String(value)} onChange={v => onChange(field.key, v)} disabled={disabled} />
            ) : field.type === 'select' ? (
              <Select value={String(value)} onValueChange={v => onChange(field.key, v)} disabled={disabled}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {(field.options || []).map(opt => <SelectItem key={opt} value={opt} className="text-sm">{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={value}
                onChange={e => onChange(field.key, field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                className="h-9 text-sm"
                disabled={disabled}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
