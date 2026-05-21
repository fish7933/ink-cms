-- Update ranks table to add rank_code and display_order
BEGIN;

-- Add rank_code and display_order columns to ranks table
ALTER TABLE ranks 
ADD COLUMN IF NOT EXISTS rank_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Update existing ranks with rank codes and display order
UPDATE ranks SET rank_code = 'MSTR', display_order = 1 WHERE name = 'Master';
UPDATE ranks SET rank_code = 'C/O', display_order = 2 WHERE name = 'Chief Officer';
UPDATE ranks SET rank_code = '2/O', display_order = 3 WHERE name = 'Second Officer';
UPDATE ranks SET rank_code = '3/O', display_order = 4 WHERE name = 'Third Officer';
UPDATE ranks SET rank_code = 'C/E', display_order = 5 WHERE name = 'Chief Engineer';
UPDATE ranks SET rank_code = '2/E', display_order = 6 WHERE name = 'Second Engineer';
UPDATE ranks SET rank_code = '3/E', display_order = 7 WHERE name = 'Third Engineer';
UPDATE ranks SET rank_code = '4/E', display_order = 8 WHERE name = 'Fourth Engineer';
UPDATE ranks SET rank_code = 'CCK', display_order = 9 WHERE name = 'Chief Cook';

-- Make rank_code NOT NULL after updating existing data
ALTER TABLE ranks ALTER COLUMN rank_code SET NOT NULL;

-- Create index on display_order for faster sorting
CREATE INDEX IF NOT EXISTS idx_ranks_display_order ON ranks(display_order);

COMMIT;