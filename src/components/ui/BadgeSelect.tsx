import { cn } from '@/lib/utils';

export interface BadgeSelectItem {
  value: string;
  label: string;
  sublabel?: string;
  color?: 'blue' | 'red' | 'amber' | 'gray';
}

export interface BadgeSelectGroup {
  label: string;
  color?: 'blue' | 'red' | 'amber' | 'gray';
  items: BadgeSelectItem[];
}

interface BadgeSelectProps {
  label?: string;
  /** items 또는 groups 중 하나만 전달 */
  items?: BadgeSelectItem[];
  groups?: BadgeSelectGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

const COLOR_SELECTED: Record<string, string> = {
  blue:  'bg-blue-600 text-white border-blue-600',
  red:   'bg-red-500 text-white border-red-500',
  amber: 'bg-amber-500 text-white border-amber-500',
  gray:  'bg-gray-600 text-white border-gray-600',
};

const COLOR_UNSELECTED: Record<string, string> = {
  blue:  'text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600',
  red:   'text-gray-600 border-gray-300 hover:border-red-400 hover:text-red-600',
  amber: 'text-gray-600 border-gray-300 hover:border-amber-400 hover:text-amber-600',
  gray:  'text-gray-600 border-gray-300 hover:border-gray-500',
};

function BadgeItem({
  item,
  selected,
  onToggle,
}: {
  item: BadgeSelectItem;
  selected: boolean;
  onToggle: (v: string) => void;
}) {
  const color = item.color ?? 'blue';
  return (
    <button
      type="button"
      onClick={() => onToggle(item.value)}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
        selected ? COLOR_SELECTED[color] : COLOR_UNSELECTED[color],
      )}
    >
      {item.label}
      {item.sublabel && (
        <span className={cn('text-[10px]', selected ? 'opacity-75' : 'opacity-60')}>
          {item.sublabel}
        </span>
      )}
    </button>
  );
}

export default function BadgeSelect({
  label,
  items,
  groups,
  selected,
  onChange,
  className,
}: BadgeSelectProps) {
  const allValues = groups
    ? groups.flatMap(g => g.items.map(i => i.value))
    : (items ?? []).map(i => i.value);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value],
    );
  };

  const selectAll = () => onChange(allValues);
  const deselectAll = () => onChange([]);

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* 라벨 + 전체선택/해제 */}
      <div className="flex items-center justify-between">
        {label && (
          <span className="text-sm font-medium text-gray-700">
            {label}
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({selected.length}/{allValues.length})
            </span>
          </span>
        )}
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            전체
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            해제
          </button>
        </div>
      </div>

      {/* 배지 목록 */}
      <div className="p-3 border rounded-lg bg-gray-50 space-y-2.5">
        {groups
          ? groups.map(group => (
              <div key={group.label}>
                <div className={cn(
                  'text-xs font-semibold mb-1.5',
                  group.color === 'red' ? 'text-red-600' :
                  group.color === 'amber' ? 'text-amber-600' : 'text-blue-700',
                )}>
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map(item => (
                    <BadgeItem
                      key={item.value}
                      item={{ ...item, color: item.color ?? group.color ?? 'blue' }}
                      selected={selected.includes(item.value)}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              </div>
            ))
          : (
              <div className="flex flex-wrap gap-1.5">
                {(items ?? []).map(item => (
                  <BadgeItem
                    key={item.value}
                    item={item}
                    selected={selected.includes(item.value)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )
        }
      </div>
    </div>
  );
}
