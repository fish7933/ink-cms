import { Card, CardContent } from '@/components/ui/card';
import { Ship as ShipIcon, DollarSign } from 'lucide-react';

interface StatsCardsProps {
  totalShips: number;
  mappedShips: number;
  unmappedShips: number;
}

export default function StatsCards({ totalShips, mappedShips, unmappedShips }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">전체 선박</p>
              <p className="text-3xl font-bold text-gray-900">{totalShips}</p>
            </div>
            <ShipIcon className="w-8 h-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">매칭된 선박</p>
              <p className="text-3xl font-bold text-gray-900">{mappedShips}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">미매칭 선박</p>
              <p className="text-3xl font-bold text-gray-900">{unmappedShips}</p>
            </div>
            <ShipIcon className="w-8 h-8 text-orange-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}