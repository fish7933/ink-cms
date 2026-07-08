import type { Ship, Company, Fleet } from '@/types/models';

export interface OwnerGroup {
  owner: Company | null;
  ships: Ship[]; // 선대 미지정 선박
  fleetGroups: { fleet: Fleet; ships: Ship[] }[];
}

export function groupShips(ships: Ship[], companies: Company[], fleets: Fleet[]): OwnerGroup[] {
  const ownersById = new Map(companies.map(c => [c.id, c]));
  const groupsByOwner = new Map<string, OwnerGroup>();
  const noOwner: OwnerGroup = { owner: null, ships: [], fleetGroups: [] };

  const getOwnerGroup = (ownerId: string): OwnerGroup => {
    if (!groupsByOwner.has(ownerId)) {
      groupsByOwner.set(ownerId, { owner: ownersById.get(ownerId) || null, ships: [], fleetGroups: [] });
    }
    return groupsByOwner.get(ownerId)!;
  };

  for (const ship of ships) {
    const group = ship.owner_id ? getOwnerGroup(ship.owner_id) : noOwner;
    if (ship.fleet_id) {
      let fg = group.fleetGroups.find(f => f.fleet.id === ship.fleet_id);
      if (!fg) {
        const fleet = fleets.find(f => f.id === ship.fleet_id);
        if (!fleet) { group.ships.push(ship); continue; }
        fg = { fleet, ships: [] };
        group.fleetGroups.push(fg);
      }
      fg.ships.push(ship);
    } else {
      group.ships.push(ship);
    }
  }

  const result = [...groupsByOwner.values()].sort((a, b) => (a.owner?.name || '').localeCompare(b.owner?.name || '', 'ko'));
  for (const g of result) g.fleetGroups.sort((a, b) => a.fleet.name.localeCompare(b.fleet.name, 'ko'));
  if (noOwner.ships.length > 0) result.push(noOwner);
  return result;
}
