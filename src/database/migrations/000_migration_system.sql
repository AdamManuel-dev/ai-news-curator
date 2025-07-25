-- Migration: 000_migration_system
-- Description: Database migration tracking system
-- Author: AI Content Curator Team
-- Created: 2025-07-24

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to check if a migration has been applied
CREATE OR REPLACE FUNCTION migration_applied(migration_version INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM schema_migrations 
        WHERE version = migration_version
    );
END;
$$ LANGUAGE plpgsql;

-- Function to apply a migration
CREATE OR REPLACE FUNCTION apply_migration(
    migration_version INTEGER,
    migration_name VARCHAR(255)
)
RETURNS VOID AS $$
BEGIN
    IF NOT migration_applied(migration_version) THEN
        INSERT INTO schema_migrations (version, name) 
        VALUES (migration_version, migration_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations';
COMMENT ON FUNCTION migration_applied(INTEGER) IS 'Checks if a migration version has been applied';
COMMENT ON FUNCTION apply_migration(INTEGER, VARCHAR) IS 'Records a migration as applied';