import { cn } from '@/lib/utils';

export interface BadgeSelectItem {
  value: string;
  label: string;
  sublabel?: string;
  /** sublabel에 별도 배경색을 줄 때 사용 (예: 승선/하선 표시) — 생략하면 기존처럼 옅은 텍스트로만 표시 */
  sublabelColor?: 'blue' | 'red' | 'amber' | 'gray';
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
  /** 선원처럼 배지 수가 많은 목록에서 글자를 더 작게 표시 */
  compact?: boolean;
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

// sublabelColor가 있으면(예: 승선/하선 표시) sublabel만 칠하지 않고 배지 전체를 그 색으로
// 칠한다 — 선택 여부와 무관하게 한눈에 상태를 알아볼 수 있어야 하므로, 선택 안 된(옅은) 배경도
// 색을 갖는다는 점이 일반 color(선택 시에만 칠해지는)와 다르다.
const STATUS_BG_UNSELECTED: Record<string, string> = {
  blue:  'bg-blue-50 text-blue-700 border-blue-300 hover:border-blue-400',
  red:   'bg-red-50 text-red-700 border-red-300 hover:border-red-400',
  amber: 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-400',
  gray:  'bg-gray-100 text-gray-700 border-gray-300',
};

function BadgeItem({
  item,
  selected,
  onToggle,
  compact,
}: {
  item: BadgeSelectItem;
  selected: boolean;
  onToggle: (v: string) => void;
  compact?: boolean;
}) {
  const color = item.color ?? 'blue';
  const badgeColorClasses = item.sublabelColor
    ? (selected ? COLOR_SELECTED[item.sublabelColor] : STATUS_BG_UNSELECTED[item.sublabelColor])
    : (selected ? COLOR_SELECTED[color] : COLOR_UNSELECTED[color]);
  return (
    <button
      type="button"
      onClick={() => onToggle(item.value)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium transition-colors',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        badgeColorClasses,
      )}
    >
      {item.label}
      {item.sublabel && (
        <span
          className={cn(
            compact ? 'text-[9px]' : 'text-[10px]',
            'font-semibold',
            item.sublabelColor ? '' : (selected ? 'opacity-75' : 'opacity-60'),
          )}
        >
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
  compact,
}: BadgeSelectProps) {
  const allValues = groups
    ? groups.flatMap(g => g.items.map(i => i.value))
    : (items ?? []).map(i => i.value);

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    // 선택 순서(클릭 순서)가 아니라 원래 목록 순서를 항상 유지
    onChange(allValues.filter(v => next.includes(v)));
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
                      compact={compact}
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
                    compact={compact}
                  />
                ))}
              </div>
            )
        }
      </div>
    </div>
  );
}
