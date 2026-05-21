-- Update user passwords with bcrypt hashes
BEGIN;

UPDATE users SET password = '$2b$10$aV3J/Ac8IagUwnYeI/vTSugP5FbAhq0hWUlMp/4717gkoOBviu5xe' WHERE username = 'owner1';
UPDATE users SET password = '$2b$10$mGM5/kgmF1ub7eboAb.M9.qjYpB358QjAjVzB3xRvlmCvYVaqj9HC' WHERE username = 'manager1';
UPDATE users SET password = '$2b$10$Ule3MX/nZLwwgM218SKOKuQYNex05.kucsO5CKaLeMNvxLfstMs6K' WHERE username = 'manning1';
UPDATE users SET password = '$2b$10$0bFf/YBIk9lUCM5z3FlB5.3YzoftgI9D20wqdxwEi57/cG1xfjU.i' WHERE username = 'crew1';

COMMIT;
