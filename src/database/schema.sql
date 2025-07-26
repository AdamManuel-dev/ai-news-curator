-- AI Content Curator Agent Database Schema
-- PostgreSQL implementation with comprehensive data model
-- Created: 2025-07-24

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For advanced indexing

-- Enums for type safety
CREATE TYPE content_type AS ENUM ('article', 'paper', 'tutorial', 'news', 'video', 'podcast');
CREATE TYPE technical_depth AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE source_type AS ENUM ('rss', 'api', 'scraper', 'social', 'manual');
CREATE TYPE tag_category AS ENUM ('topic', 'difficulty', 'use_case', 'technology', 'framework', 'domain');
CREATE TYPE interaction_type AS ENUM ('view', 'like', 'share', 'bookmark', 'rating', 'click');
CREATE TYPE trend_type AS ENUM ('rising', 'declining', 'stable', 'emerging');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE job_type AS ENUM ('discovery', 'tagging', 'ranking', 'trend_analysis', 'embedding', 'cleanup');
CREATE TYPE expertise_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE assignment_method AS ENUM ('ai', 'human', 'rule', 'ml_model');

-- Core Tables

-- Authors table - Content creators and their reputation
CREATE TABLE authors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    affiliation VARCHAR(255),
    social_profiles JSONB DEFAULT '{}',
    expertise TEXT[] DEFAULT '{}',
    reputation DECIMAL(3,2) DEFAULT 0.5 CHECK (reputation >= 0 AND reputation <= 1),
    content_count INTEGER DEFAULT 0,
    avg_quality_score DECIMAL(3,2) DEFAULT 0.5 CHECK (avg_quality_score >= 0 AND avg_quality_score <= 1),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sources table - Content sources configuration
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    url TEXT NOT NULL,
    type source_type NOT NULL,
    reputation DECIMAL(3,2) DEFAULT 0.5 CHECK (reputation >= 0 AND reputation <= 1),
    is_active BOOLEAN DEFAULT TRUE,
    last_checked TIMESTAMP WITH TIME ZONE,
    check_frequency INTEGER DEFAULT 60, -- minutes
    success_rate DECIMAL(3,2) DEFAULT 1.0 CHECK (success_rate >= 0 AND success_rate <= 1),
    avg_quality_score DECIMAL(3,2) DEFAULT 0.5 CHECK (avg_quality_score >= 0 AND avg_quality_score <= 1),
    configuration JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table - Hierarchical taxonomy
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category tag_category NOT NULL,
    description TEXT,
    parent_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content table - Main content entities
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    author_id UUID REFERENCES authors(id) ON DELETE SET NULL,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    publish_date TIMESTAMP WITH TIME ZONE,
    content_type content_type NOT NULL,
    quality_score DECIMAL(3,2) DEFAULT 0.5 CHECK (quality_score >= 0 AND quality_score <= 1),
    reading_time INTEGER, -- minutes
    technical_depth technical_depth,
    has_code_examples BOOLEAN DEFAULT FALSE,
    has_visuals BOOLEAN DEFAULT FALSE,
    raw_content TEXT,
    language_code VARCHAR(5) DEFAULT 'en',
    word_count INTEGER,
    source_reputation DECIMAL(3,2) CHECK (source_reputation >= 0 AND source_reputation <= 1),
    embedding_vector DECIMAL[] DEFAULT '{}', -- Store embedding as decimal array
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(raw_content, '')), 'C')
    ) STORED
);

-- Content-Tags junction table with confidence scoring
CREATE TABLE content_tags (
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    confidence DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    reason TEXT,
    assigned_by assignment_method DEFAULT 'ai',
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (content_id, tag_id)
);

-- Users table - User management and preferences
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) UNIQUE,
    expertise_level expertise_level DEFAULT 'beginner',
    interests TEXT[] DEFAULT '{}',
    preferred_formats content_type[] DEFAULT '{}',
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User interactions for personalization
CREATE TABLE user_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    interaction_type interaction_type NOT NULL,
    value DECIMAL(5,2), -- rating, time spent, etc.
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one interaction per type per user per content
    UNIQUE(user_id, content_id, interaction_type)
);

-- Trends analysis table
CREATE TABLE trends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period VARCHAR(20) NOT NULL, -- '2024-01-15', 'week-2024-03'
    topic_name VARCHAR(255) NOT NULL,
    trend_type trend_type NOT NULL,
    growth_rate DECIMAL(5,2), -- percentage
    mention_count INTEGER DEFAULT 0,
    top_sources TEXT[] DEFAULT '{}',
    peak_date TIMESTAMP WITH TIME ZONE,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(period, topic_name)
);

-- Processing jobs for async operations
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type job_type NOT NULL,
    status job_status DEFAULT 'pending',
    parameters JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    errors JSONB DEFAULT '{}',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cache metadata for cache management
CREATE TABLE cache_metadata (
    key VARCHAR(255) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cache_tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API keys for external access
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permissions TEXT[] DEFAULT '{}',
    rate_limit INTEGER DEFAULT 1000, -- requests per hour
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API key usage logs for rate limiting and analytics
CREATE TABLE api_key_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER, -- milliseconds
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Role-based access control tables

-- Roles table - defines available roles in the system
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permissions table - defines granular permissions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(50) NOT NULL, -- Resource type (content, users, sources, etc.)
    action VARCHAR(50) NOT NULL, -- Action (create, read, update, delete, manage)
    description TEXT,
    is_system_permission BOOLEAN DEFAULT FALSE, -- System permissions cannot be deleted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(resource, action)
);

-- Role-Permission junction table
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    PRIMARY KEY (role_id, permission_id)
);

-- User-Role junction table
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional role expiration
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id)
);

-- User-specific permission overrides (grants additional permissions beyond roles)
CREATE TABLE user_permissions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional permission expiration
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, permission_id)
);

-- Indexes for performance optimization
-- Primary search indexes
CREATE INDEX idx_content_search_vector ON content USING GIN(search_vector);
CREATE INDEX idx_content_quality_score ON content(quality_score DESC);
CREATE INDEX idx_content_publish_date ON content(publish_date DESC);
CREATE INDEX idx_content_source_id ON content(source_id);
CREATE INDEX idx_content_author_id ON content(author_id);
CREATE INDEX idx_content_created_at ON content(created_at DESC);

-- Tag-related indexes
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_category ON tags(category);
CREATE INDEX idx_tags_parent ON tags(parent_tag_id);
CREATE INDEX idx_content_tags_content_id ON content_tags(content_id);
CREATE INDEX idx_content_tags_tag_id ON content_tags(tag_id);
CREATE INDEX idx_content_tags_confidence ON content_tags(confidence DESC);

-- User interaction indexes
CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_content_id ON user_interactions(content_id);
CREATE INDEX idx_user_interactions_timestamp ON user_interactions(timestamp DESC);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type);

-- Source and author indexes
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_is_active ON sources(is_active);
CREATE INDEX idx_sources_reputation ON sources(reputation DESC);
CREATE INDEX idx_authors_reputation ON authors(reputation DESC);

-- Trends and jobs indexes
CREATE INDEX idx_trends_period ON trends(period);
CREATE INDEX idx_trends_topic ON trends(topic_name);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_type ON processing_jobs(job_type);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Cache indexes
CREATE INDEX idx_cache_metadata_expires_at ON cache_metadata(expires_at);
CREATE INDEX idx_cache_metadata_entity ON cache_metadata(entity_type, entity_id);

-- API key indexes
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_api_key_logs_key_id ON api_key_logs(key_id);
CREATE INDEX idx_api_key_logs_created_at ON api_key_logs(created_at DESC);
CREATE INDEX idx_api_key_logs_endpoint ON api_key_logs(endpoint);
CREATE INDEX idx_api_key_logs_rate_limit ON api_key_logs(key_id, created_at) WHERE created_at >= NOW() - INTERVAL '1 hour';

-- RBAC indexes
CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_is_active ON roles(is_active);
CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_roles_expires ON user_roles(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission_id ON user_permissions(permission_id);
CREATE INDEX idx_user_permissions_active ON user_permissions(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_permissions_expires ON user_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_content_quality_date ON content(quality_score DESC, publish_date DESC);
CREATE INDEX idx_content_source_date ON content(source_id, publish_date DESC);
CREATE INDEX idx_active_sources_reputation ON sources(is_active, reputation DESC) WHERE is_active = TRUE;

-- Functions and triggers for maintaining data integrity

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_authors_updated_at BEFORE UPDATE ON authors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update tag usage count when content_tags changes
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tags SET usage_count = usage_count - 1 WHERE id = OLD.tag_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_tag_usage_count
    AFTER INSERT OR DELETE ON content_tags
    FOR EACH ROW EXECUTE FUNCTION update_tag_usage_count();

-- Update author content count
CREATE OR REPLACE FUNCTION update_author_content_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE authors SET content_count = content_count + 1 WHERE id = NEW.author_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE authors SET content_count = content_count - 1 WHERE id = OLD.author_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' AND OLD.author_id != NEW.author_id THEN
        UPDATE authors SET content_count = content_count - 1 WHERE id = OLD.author_id;
        UPDATE authors SET content_count = content_count + 1 WHERE id = NEW.author_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_author_content_count
    AFTER INSERT OR DELETE OR UPDATE ON content
    FOR EACH ROW EXECUTE FUNCTION update_author_content_count();

-- Comments for documentation
COMMENT ON TABLE content IS 'Primary content storage with full-text search and quality scoring';
COMMENT ON TABLE tags IS 'Hierarchical tag taxonomy for content categorization';
COMMENT ON TABLE content_tags IS 'Many-to-many relationship between content and tags with AI confidence scoring';
COMMENT ON TABLE sources IS 'Content source configuration and reputation tracking';
COMMENT ON TABLE authors IS 'Content author profiles and reputation management';
COMMENT ON TABLE users IS 'User accounts and personalization preferences';
COMMENT ON TABLE user_interactions IS 'User engagement tracking for personalization';
COMMENT ON TABLE trends IS 'Trend analysis data for topic popularity tracking';
COMMENT ON TABLE processing_jobs IS 'Async job queue for background processing';
COMMENT ON TABLE cache_metadata IS 'Cache invalidation and management metadata';

-- Initial system data
INSERT INTO sources (id, name, url, type, reputation) VALUES
    (uuid_generate_v4(), 'System', 'internal://system', 'manual', 1.0),
    (uuid_generate_v4(), 'Manual Entry', 'internal://manual', 'manual', 0.8);

INSERT INTO authors (id, name, email, reputation, is_verified) VALUES
    (uuid_generate_v4(), 'System Admin', 'admin@ai-news-curator.com', 1.0, TRUE),
    (uuid_generate_v4(), 'Anonymous', NULL, 0.5, FALSE);

-- Basic tag categories
INSERT INTO tags (name, category, description) VALUES
    ('Machine Learning', 'topic', 'Artificial intelligence and machine learning content'),
    ('Web Development', 'topic', 'Frontend and backend web development'),
    ('DevOps', 'topic', 'Development operations and infrastructure'),
    ('Beginner', 'difficulty', 'Introductory level content'),
    ('Intermediate', 'difficulty', 'Intermediate level content'),
    ('Advanced', 'difficulty', 'Advanced level content'),
    ('Tutorial', 'use_case', 'Step-by-step instructional content'),
    ('News', 'use_case', 'Industry news and updates'),
    ('Analysis', 'use_case', 'In-depth analysis and opinion pieces');

-- System roles
INSERT INTO roles (name, description, is_system_role, is_active) VALUES
    ('admin', 'System administrator with full access', TRUE, TRUE),
    ('moderator', 'Content moderator with content management access', TRUE, TRUE),
    ('premium', 'Premium user with enhanced features', TRUE, TRUE),
    ('user', 'Standard authenticated user', TRUE, TRUE),
    ('readonly', 'Read-only access user', TRUE, TRUE);

-- System permissions
INSERT INTO permissions (name, resource, action, description, is_system_permission) VALUES
    -- Content permissions
    ('content:create', 'content', 'create', 'Create new content items', TRUE),
    ('content:read', 'content', 'read', 'View content items', TRUE),
    ('content:update', 'content', 'update', 'Update existing content items', TRUE),
    ('content:delete', 'content', 'delete', 'Delete content items', TRUE),
    ('content:manage', 'content', 'manage', 'Full content management access', TRUE),
    
    -- User permissions
    ('users:create', 'users', 'create', 'Create new user accounts', TRUE),
    ('users:read', 'users', 'read', 'View user information', TRUE),
    ('users:update', 'users', 'update', 'Update user information', TRUE),
    ('users:delete', 'users', 'delete', 'Delete user accounts', TRUE),
    ('users:manage', 'users', 'manage', 'Full user management access', TRUE),
    
    -- Source permissions
    ('sources:create', 'sources', 'create', 'Add new content sources', TRUE),
    ('sources:read', 'sources', 'read', 'View content sources', TRUE),
    ('sources:update', 'sources', 'update', 'Update content sources', TRUE),
    ('sources:delete', 'sources', 'delete', 'Remove content sources', TRUE),
    ('sources:manage', 'sources', 'manage', 'Full source management access', TRUE),
    
    -- Tag permissions
    ('tags:create', 'tags', 'create', 'Create new tags', TRUE),
    ('tags:read', 'tags', 'read', 'View tags', TRUE),
    ('tags:update', 'tags', 'update', 'Update existing tags', TRUE),
    ('tags:delete', 'tags', 'delete', 'Delete tags', TRUE),
    ('tags:manage', 'tags', 'manage', 'Full tag management access', TRUE),
    
    -- API key permissions
    ('api_keys:create', 'api_keys', 'create', 'Create API keys', TRUE),
    ('api_keys:read', 'api_keys', 'read', 'View API keys', TRUE),
    ('api_keys:update', 'api_keys', 'update', 'Update API keys', TRUE),
    ('api_keys:delete', 'api_keys', 'delete', 'Revoke API keys', TRUE),
    ('api_keys:manage', 'api_keys', 'manage', 'Full API key management', TRUE),
    
    -- System permissions
    ('system:metrics', 'system', 'read', 'View system metrics', TRUE),
    ('system:health', 'system', 'read', 'View system health status', TRUE),
    ('system:admin', 'system', 'manage', 'Full system administration', TRUE),
    
    -- Analytics permissions
    ('analytics:read', 'analytics', 'read', 'View analytics data', TRUE),
    ('analytics:manage', 'analytics', 'manage', 'Manage analytics configuration', TRUE);

-- Role-Permission assignments
DO $$
DECLARE
    admin_role_id UUID;
    moderator_role_id UUID;
    premium_role_id UUID;
    user_role_id UUID;
    readonly_role_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    SELECT id INTO moderator_role_id FROM roles WHERE name = 'moderator';
    SELECT id INTO premium_role_id FROM roles WHERE name = 'premium';
    SELECT id INTO user_role_id FROM roles WHERE name = 'user';
    SELECT id INTO readonly_role_id FROM roles WHERE name = 'readonly';
    
    -- Admin permissions (all permissions)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions;
    
    -- Moderator permissions (content, tags, analytics)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT moderator_role_id, id FROM permissions 
    WHERE name IN (
        'content:create', 'content:read', 'content:update', 'content:delete', 'content:manage',
        'tags:create', 'tags:read', 'tags:update', 'tags:delete', 'tags:manage',
        'sources:read', 'sources:update',
        'analytics:read',
        'system:health', 'system:metrics'
    );
    
    -- Premium user permissions (enhanced content access)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT premium_role_id, id FROM permissions 
    WHERE name IN (
        'content:read', 'content:create',
        'tags:read', 'tags:create',
        'sources:read',
        'api_keys:create', 'api_keys:read', 'api_keys:update', 'api_keys:delete',
        'analytics:read',
        'system:health'
    );
    
    -- Standard user permissions (basic access)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT user_role_id, id FROM permissions 
    WHERE name IN (
        'content:read', 'content:create',
        'tags:read',
        'sources:read',
        'system:health'
    );
    
    -- Readonly permissions (view only)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT readonly_role_id, id FROM permissions 
    WHERE name IN (
        'content:read',
        'tags:read',
        'sources:read',
        'system:health'
    );
END $$;