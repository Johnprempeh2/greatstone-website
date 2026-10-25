-- Stop the auth endpoint before rollback. Restore the previous staging snapshot
-- if any user has signed in; this script deletes Better Auth sessions and users.
DROP SCHEMA IF EXISTS better_auth CASCADE;
REVOKE auth_server FROM CURRENT_USER;
DROP ROLE IF EXISTS auth_server;
