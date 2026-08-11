import { useState, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

// 네이티브 datalist 대신 직접 필터링해서 보여주는 검색 가능한 드롭다운 — 목록에 없는 값도
// 자유롭게 입력할 수 있고, 입력한 텍스트를 포함하는 기존 값들이 아래에 후보로 뜬다.
export function AutocompleteInput({ value, onChange, options, placeholder, className }: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 20);
  }, [options, value]);

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const handleSelect = (opt: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(opt);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border bg-white shadow-md">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(opt)}
              className={cn('block w-full text-left px-2.5 py-1.5 text-sm hover:bg-gray-100 truncate')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
