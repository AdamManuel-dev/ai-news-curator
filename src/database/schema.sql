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