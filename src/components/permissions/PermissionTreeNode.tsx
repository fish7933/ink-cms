import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionTreeNodeProps {
  label: string;
  description?: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
  level?: number;
}

export default function PermissionTreeNode({
  label,
  description,
  checked,
  indeterminate = false,
  onChange,
  children,
  level = 0,
}: PermissionTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = !!children;

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors",
          level === 0 && "bg-blue-50/50"
        )}
        style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
      >
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-gray-200 rounded transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-5" />}
        
        <Checkbox
          checked={checked}
          indeterminate={indeterminate}
          onCheckedChange={onChange}
          className="mt-0.5"
        />
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium",
              level === 0 ? "text-base text-gray-900" : "text-sm text-gray-700"
            )}>
              {label}
            </span>
          </div>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      
      {hasChildren && expanded && (
        <div className="mt-1">
          {children}
        </div>
      )}
    </div>
  );
}