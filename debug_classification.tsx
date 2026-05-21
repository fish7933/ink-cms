// Debug script to test classification filtering
import { getShips } from '@/lib/store';
import { getShipClassification, getSizeClassifications } from '@/services/ship-classification.service';

async function debugClassifications() {
  console.log("=== Starting Classification Debug ===");
  
  // Get all ships
  const ships = await getShips();
  console.log(`Total ships: ${ships.length}`);
  
  // Get all classifications
  const classifications = await getSizeClassifications();
  console.log(`Total classifications: ${classifications.length}`);
  console.log("Classifications:", JSON.stringify(classifications, null, 2));
  
  // Test first 5 ships
  for (let i = 0; i < Math.min(5, ships.length); i++) {
    const ship = ships[i];
    console.log(`\n--- Ship ${i + 1}: ${ship.name} ---`);
    console.log(`DWT: ${ship.dwt}, GT: ${ship.gt}, ship_type_id: ${ship.ship_type_id}`);
    
    if (ship.dwt && ship.gt) {
      const classification = await getShipClassification(ship.dwt, ship.gt, ship.ship_type_id);
      console.log(`Classification: ${classification ? classification.name_ko || classification.name : 'NONE'}`);
    } else {
      console.log("Missing DWT or GT");
    }
  }
}

debugClassifications();
