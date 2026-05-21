-- Migration script to update existing test account passwords to bcrypt hashes
-- Run this in Supabase SQL Editor after implementing bcrypt in the application

-- Note: This is the bcrypt hash of 'password123' with salt rounds = 10
-- All test accounts will use the same password for simplicity

BEGIN;

UPDATE users 
SET password = '$2b$10$zt20T.qhIbY.IfNIDbg7nuXOHtAigobST5h1LctEysSNAB9AW34Ti'
WHERE username IN ('owner1', 'manager1', 'manning1', 'crew1');

COMMIT;

-- Verification query (optional)
-- SELECT username, LEFT(password, 30) as password_hash_preview FROM users;