-- Extended Ship Information Schema
-- Add more detailed ship information fields

BEGIN;

-- Add extended fields to ships table
ALTER TABLE ships 
ADD COLUMN IF NOT EXISTS call_sign TEXT,
ADD COLUMN IF NOT EXISTS mmsi TEXT,
ADD COLUMN IF NOT EXISTS classification_society TEXT,
ADD COLUMN IF NOT EXISTS port_of_registry TEXT,
ADD COLUMN IF NOT EXISTS engine_type TEXT,
ADD COLUMN IF NOT EXISTS engine_power DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS speed_max DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS speed_service DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS fuel_consumption DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS crew_capacity INTEGER,
ADD COLUMN IF NOT EXISTS passenger_capacity INTEGER,
ADD COLUMN IF NOT EXISTS cargo_capacity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS length_overall DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS breadth DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS depth DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS draft DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS builder TEXT,
ADD COLUMN IF NOT EXISTS shipyard TEXT;

-- Create index for commonly searched fields
CREATE INDEX IF NOT EXISTS idx_ships_call_sign ON ships(call_sign);
CREATE INDEX IF NOT EXISTS idx_ships_mmsi ON ships(mmsi);
CREATE INDEX IF NOT EXISTS idx_ships_classification ON ships(classification_society);

COMMIT;