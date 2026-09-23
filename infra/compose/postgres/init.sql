-- Runs once, when the postgres_data volume is first created.
-- Extensions need superuser, which the app role should not have in production;
-- in managed Postgres (Azure Flexible Server) enable them via server parameters.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- A separate database for the test suite, so `bun test` never touches dev data.
CREATE DATABASE socialfly_test OWNER socialfly;
