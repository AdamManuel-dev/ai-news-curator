-- Migration: 001_initial_schema
-- Description: Initial database schema for AI Content Curator Agent
-- Author: AI Content Curator Team
-- Created: 2025-07-24

-- This migration creates the complete initial schema for the application
-- Run the main schema.sql file for the complete setup

-- For migration tracking, we just execute the main schema
\i ../schema.sql

-- Record this migration
INSERT INTO schema_migrations (version, name, applied_at) VALUES
(1, '001_initial_schema', NOW())
ON CONFLICT (version) DO NOTHING;