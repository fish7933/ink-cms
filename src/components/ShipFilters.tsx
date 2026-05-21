import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export interface ShipFilterOptions {
  searchTerm: string;
  minDwt?: number;
  maxDwt?: number;
  minGt?: number;
  maxGt?: number;
  fleetGroup?: string;
  route?: string;
  sortBy: 'name' | 'dwt' | 'gt' | 'created_at';
  sortOrder: 'asc' | 'desc';
}

interface ShipFiltersProps {
  filters: ShipFilterOptions;
  onFiltersChange: (filters: ShipFilterOptions) => void;
  fleetGroups: string[];
  routes: string[];
}

export default function ShipFilters({
  filters,
  onFiltersChange,
  fleetGroups,
  routes,
}: ShipFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, searchTerm: value });
  };

  const handleFilterChange = (key: keyof ShipFilterOptions, value: string | number | undefined) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onFiltersChange({
      searchTerm: '',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    setIsOpen(false);
  };

  const activeFilterCount = [
    filters.minDwt,
    filters.maxDwt,
    filters.minGt,
    filters.maxGt,
    filters.fleetGroup,
    filters.route,
  ].filter(Boolean).length;

  return (
    <div className="flex gap-2">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search ships by name or IMO..."
          value={filters.searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sort Dropdown */}
      <Select
        value={`${filters.sortBy}-${filters.sortOrder}`}
        onValueChange={(value) => {
          const [sortBy, sortOrder] = value.split('-') as [ShipFilterOptions['sortBy'], ShipFilterOptions['sortOrder']];
          onFiltersChange({ ...filters, sortBy, sortOrder });
        }}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
          <SelectItem value="dwt-desc">DWT (High-Low)</SelectItem>
          <SelectItem value="dwt-asc">DWT (Low-High)</SelectItem>
          <SelectItem value="gt-desc">GT (High-Low)</SelectItem>
          <SelectItem value="gt-asc">GT (Low-High)</SelectItem>
          <SelectItem value="created_at-desc">Newest First</SelectItem>
          <SelectItem value="created_at-asc">Oldest First</SelectItem>
        </SelectContent>
      </Select>

      {/* Advanced Filters Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="relative">
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Advanced Filters</SheetTitle>
            <SheetDescription>
              Filter ships by specific criteria
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* DWT Range */}
            <div className="space-y-2">
              <Label>DWT Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="number"
                    placeholder="Min DWT"
                    value={filters.minDwt || ''}
                    onChange={(e) =>
                      handleFilterChange('minDwt', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Max DWT"
                    value={filters.maxDwt || ''}
                    onChange={(e) =>
                      handleFilterChange('maxDwt', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
              </div>
            </div>

            {/* GT Range */}
            <div className="space-y-2">
              <Label>GT Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="number"
                    placeholder="Min GT"
                    value={filters.minGt || ''}
                    onChange={(e) =>
                      handleFilterChange('minGt', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Max GT"
                    value={filters.maxGt || ''}
                    onChange={(e) =>
                      handleFilterChange('maxGt', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
              </div>
            </div>

            {/* Fleet Group */}
            <div className="space-y-2">
              <Label>Fleet Group</Label>
              <Select
                value={filters.fleetGroup || 'all'}
                onValueChange={(value) =>
                  handleFilterChange('fleetGroup', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fleet group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fleet Groups</SelectItem>
                  {fleetGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Route */}
            <div className="space-y-2">
              <Label>Route</Label>
              <Select
                value={filters.route || 'all'}
                onValueChange={(value) =>
                  handleFilterChange('route', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route} value={route}>
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button onClick={handleReset} variant="outline" className="flex-1">
                <X className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button onClick={() => setIsOpen(false)} className="flex-1">
                Apply Filters
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}