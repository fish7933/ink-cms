import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Ship, Anchor, Container, Waves } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ShipData {
  id: string;
  name: string;
  ship_type: string;
  dwt?: number;
  gt?: number;
  fleet_id?: string;
  fleet_name?: string;
}

interface ShipListViewProps {
  companyId: string;
  companyName: string;
}

const getShipIcon = (shipType: string, size: number) => {
  const iconSize = size > 50000 ? 32 : size > 20000 ? 28 : 24;
  const iconColor = size > 50000 ? 'text-blue-600' : size > 20000 ? 'text-blue-500' : 'text-blue-400';

  const type = shipType?.toLowerCase() || '';
  
  if (type.includes('container')) {
    return <Container size={iconSize} className={iconColor} />;
  } else if (type.includes('tanker') || type.includes('oil')) {
    return <Waves size={iconSize} className={iconColor} />;
  } else if (type.includes('bulk')) {
    return <Anchor size={iconSize} className={iconColor} />;
  } else {
    return <Ship size={iconSize} className={iconColor} />;
  }
};

const getSizeCategory = (dwt?: number, gt?: number) => {
  const size = dwt || gt || 0;
  if (size > 50000) return { label: 'Large', color: 'bg-red-100 text-red-800' };
  if (size > 20000) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' };
  return { label: 'Small', color: 'bg-green-100 text-green-800' };
};

export const ShipListView: React.FC<ShipListViewProps> = ({ companyId, companyName }) => {
  const [ships, setShips] = useState<ShipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupByFleet, setGroupByFleet] = useState(true);

  useEffect(() => {
    fetchShips();
  }, [companyId]);

  const fetchShips = async () => {
    try {
      setLoading(true);
      
      // Fetch ships with fleet information - FIXED: use owner_id instead of ship_owner_id
      const { data: shipsData, error: shipsError } = await supabase
        .from('ships')
        .select(`
          id,
          name,
          ship_type,
          dwt,
          gt,
          fleet_id,
          fleets (
            name
          )
        `)
        .eq('owner_id', companyId)
        .order('name');

      if (shipsError) throw shipsError;

      const formattedShips = shipsData?.map(ship => ({
        id: ship.id,
        name: ship.name,
        ship_type: ship.ship_type,
        dwt: ship.dwt,
        gt: ship.gt,
        fleet_id: ship.fleet_id,
        fleet_name: ship.fleets?.name || '미할당'
      })) || [];

      setShips(formattedShips);
    } catch (error) {
      console.error('Error fetching ships:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedShips = groupByFleet
    ? ships.reduce((acc, ship) => {
        const fleetName = ship.fleet_name || '미할당';
        if (!acc[fleetName]) {
          acc[fleetName] = [];
        }
        acc[fleetName].push(ship);
        return acc;
      }, {} as Record<string, ShipData[]>)
    : { '전체 선박': ships };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (ships.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-gray-500">등록된 선박이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {companyName} 소속 선박 ({ships.length}척)
        </h3>
        <button
          onClick={() => setGroupByFleet(!groupByFleet)}
          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          {groupByFleet ? '전체 보기' : '플릿별 보기'}
        </button>
      </div>

      {Object.entries(groupedShips).map(([fleetName, fleetShips]) => (
        <Card key={fleetName}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Anchor size={20} className="text-blue-600" />
              {fleetName}
              <Badge variant="secondary" className="ml-2">
                {fleetShips.length}척
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fleetShips.map((ship) => {
                const size = ship.dwt || ship.gt || 0;
                const sizeCategory = getSizeCategory(ship.dwt, ship.gt);
                
                return (
                  <div
                    key={ship.id}
                    className="flex items-start gap-3 p-4 border rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getShipIcon(ship.ship_type, size)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">
                        {ship.name}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {ship.ship_type}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={sizeCategory.color}>
                          {sizeCategory.label}
                        </Badge>
                        {ship.dwt && (
                          <span className="text-xs text-gray-500">
                            DWT: {ship.dwt.toLocaleString()}
                          </span>
                        )}
                        {ship.gt && (
                          <span className="text-xs text-gray-500">
                            GT: {ship.gt.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};