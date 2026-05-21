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

export interface CrewFilterOptions {
  searchTerm: string;
  rank?: string;
  nationality?: string;
  minExperience?: number;
  maxExperience?: number;
  sortBy: 'name' | 'rank' | 'nationality' | 'created_at';
  sortOrder: 'asc' | 'desc';
}

interface CrewFiltersProps {
  filters: CrewFilterOptions;
  onFiltersChange: (filters: CrewFilterOptions) => void;
  ranks: string[];
  nationalities: string[];
}

export default function CrewFilters({
  filters,
  onFiltersChange,
  ranks,
  nationalities,
}: CrewFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, searchTerm: value });
  };

  const handleFilterChange = (key: keyof CrewFilterOptions, value: string | number | undefined) => {
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
    filters.rank,
    filters.nationality,
    filters.minExperience,
    filters.maxExperience,
  ].filter(Boolean).length;

  return (
    <div className="flex gap-2">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search crew by name, email, or passport..."
          value={filters.searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sort Dropdown */}
      <Select
        value={`${filters.sortBy}-${filters.sortOrder}`}
        onValueChange={(value) => {
          const [sortBy, sortOrder] = value.split('-') as [CrewFilterOptions['sortBy'], CrewFilterOptions['sortOrder']];
          onFiltersChange({ ...filters, sortBy, sortOrder });
        }}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
          <SelectItem value="rank-asc">Rank (A-Z)</SelectItem>
          <SelectItem value="rank-desc">Rank (Z-A)</SelectItem>
          <SelectItem value="nationality-asc">Nationality (A-Z)</SelectItem>
          <SelectItem value="nationality-desc">Nationality (Z-A)</SelectItem>
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
              Filter crew members by specific criteria
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Rank */}
            <div className="space-y-2">
              <Label>Rank</Label>
              <Select
                value={filters.rank || 'all'}
                onValueChange={(value) =>
                  handleFilterChange('rank', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ranks</SelectItem>
                  {ranks.map((rank) => (
                    <SelectItem key={rank} value={rank}>
                      {rank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nationality */}
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Select
                value={filters.nationality || 'all'}
                onValueChange={(value) =>
                  handleFilterChange('nationality', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select nationality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Nationalities</SelectItem>
                  {nationalities.map((nationality) => (
                    <SelectItem key={nationality} value={nationality}>
                      {nationality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Experience Range (in years) */}
            <div className="space-y-2">
              <Label>Years of Experience</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="number"
                    placeholder="Min years"
                    value={filters.minExperience || ''}
                    onChange={(e) =>
                      handleFilterChange('minExperience', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Max years"
                    value={filters.maxExperience || ''}
                    onChange={(e) =>
                      handleFilterChange('maxExperience', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </div>
              </div>
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