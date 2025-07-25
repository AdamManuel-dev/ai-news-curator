/**
 * @fileoverview Tests to validate Grafana dashboard JSON files
 * 
 * This test suite validates:
 * - JSON syntax and structure
 * - Required dashboard properties
 * - Panel configurations
 * - Data source references
 * - Query syntax validation
 */

const fs = require('fs');
const path = require('path');

describe('Grafana Dashboard Validation', () => {
  const dashboardsDir = path.join(__dirname, '..');
  const expectedDashboards = [
    'ai-curator-overview.json',
    'ai-curator-business-metrics.json', 
    'ai-curator-infrastructure.json',
    'ai-curator-alerts.json'
  ];

  let dashboards = {};

  // Load all dashboard files before running tests
  beforeAll(() => {
    expectedDashboards.forEach(filename => {
      const filePath = path.join(dashboardsDir, 'dashboards', filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        try {
          dashboards[filename] = JSON.parse(content);
        } catch (error) {
          throw new Error(`Invalid JSON in ${filename}: ${error.message}`);
        }
      }
    });
  });

  describe('Dashboard File Existence', () => {
    test.each(expectedDashboards)('%s should exist', (filename) => {
      const filePath = path.join(dashboardsDir, 'dashboards', filename);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('JSON Structure Validation', () => {
    test.each(expectedDashboards)('%s should have valid JSON syntax', (filename) => {
      expect(dashboards[filename]).toBeDefined();
      expect(typeof dashboards[filename]).toBe('object');
    });

    test.each(expectedDashboards)('%s should have required top-level properties', (filename) => {
      const dashboard = dashboards[filename];
      
      // Required properties for Grafana dashboards
      expect(dashboard).toHaveProperty('title');
      expect(dashboard).toHaveProperty('panels');
      expect(dashboard).toHaveProperty('time');
      expect(dashboard).toHaveProperty('refresh');
      expect(dashboard).toHaveProperty('schemaVersion');
      expect(dashboard).toHaveProperty('version');
      expect(dashboard).toHaveProperty('uid');
      
      // Validate property types
      expect(typeof dashboard.title).toBe('string');
      expect(Array.isArray(dashboard.panels)).toBe(true);
      expect(typeof dashboard.time).toBe('object');
      expect(typeof dashboard.schemaVersion).toBe('number');
      expect(typeof dashboard.version).toBe('number');
      expect(typeof dashboard.uid).toBe('string');
    });
  });

  describe('Dashboard Content Validation', () => {
    test('Overview dashboard should have appropriate metrics', () => {
      const dashboard = dashboards['ai-curator-overview.json'];
      expect(dashboard.title).toBe('AI Content Curator - Overview');
      expect(dashboard.uid).toBe('ai-curator-overview');
      expect(dashboard.panels.length).toBeGreaterThan(5);
      
      // Check for key panels
      const panelTitles = dashboard.panels.map(p => p.title);
      expect(panelTitles).toEqual(
        expect.arrayContaining([
          'Application Status',
          'Active Requests',
          'Request Rate',
          'HTTP Status Codes',
          'Response Time Percentiles'
        ])
      );
    });

    test('Business metrics dashboard should have content-specific metrics', () => {
      const dashboard = dashboards['ai-curator-business-metrics.json'];
      expect(dashboard.title).toBe('AI Content Curator - Business Metrics');
      expect(dashboard.uid).toBe('ai-curator-business');
      
      const panelTitles = dashboard.panels.map(p => p.title);
      expect(panelTitles).toEqual(
        expect.arrayContaining([
          'Total Content Discovered',
          'Discovery Rate',
          'Total Tags Generated',
          'Tagging Accuracy',
          'Vector Database Operations'
        ])
      );
    });

    test('Infrastructure dashboard should have system metrics', () => {
      const dashboard = dashboards['ai-curator-infrastructure.json'];
      expect(dashboard.title).toBe('AI Content Curator - Infrastructure');
      expect(dashboard.uid).toBe('ai-curator-infrastructure');
      
      const panelTitles = dashboard.panels.map(p => p.title);
      expect(panelTitles).toEqual(
        expect.arrayContaining([
          'PostgreSQL Status',
          'Redis Status',
          'System Health Score',
          'PostgreSQL Activity',
          'System Resources'
        ])
      );
    });

    test('Alerts dashboard should have monitoring panels', () => {
      const dashboard = dashboards['ai-curator-alerts.json'];
      expect(dashboard.title).toBe('AI Content Curator - Alerts & Monitoring');
      expect(dashboard.uid).toBe('ai-curator-alerts');
      
      const panelTitles = dashboard.panels.map(p => p.title);
      expect(panelTitles).toEqual(
        expect.arrayContaining([
          'Error Rate (5xx)',
          '95th Percentile Response Time',
          'Memory Usage',
          'Database Connectivity',
          'Error Events'
        ])
      );
    });
  });

  describe('Panel Configuration Validation', () => {
    test.each(expectedDashboards)('%s panels should have valid structure', (filename) => {
      const dashboard = dashboards[filename];
      
      dashboard.panels.forEach((panel, index) => {
        // Each panel should have required properties
        expect(panel).toHaveProperty('id');
        expect(panel).toHaveProperty('title');
        expect(panel).toHaveProperty('type');
        expect(panel).toHaveProperty('gridPos');
        expect(panel).toHaveProperty('targets');
        
        // Validate types
        expect(typeof panel.id).toBe('number');
        expect(typeof panel.title).toBe('string');
        expect(typeof panel.type).toBe('string');
        expect(typeof panel.gridPos).toBe('object');
        expect(Array.isArray(panel.targets)).toBe(true);
        
        // GridPos should have required dimensions
        expect(panel.gridPos).toHaveProperty('h');
        expect(panel.gridPos).toHaveProperty('w');
        expect(panel.gridPos).toHaveProperty('x');
        expect(panel.gridPos).toHaveProperty('y');
        
        // Validate grid position values
        expect(typeof panel.gridPos.h).toBe('number');
        expect(typeof panel.gridPos.w).toBe('number');
        expect(typeof panel.gridPos.x).toBe('number');
        expect(typeof panel.gridPos.y).toBe('number');
        
        // Grid positions should be within valid ranges
        expect(panel.gridPos.h).toBeGreaterThan(0);
        expect(panel.gridPos.w).toBeGreaterThan(0);
        expect(panel.gridPos.w).toBeLessThanOrEqual(24); // Grafana max width
        expect(panel.gridPos.x).toBeGreaterThanOrEqual(0);
        expect(panel.gridPos.x).toBeLessThan(24);
      }, `Panel ${index} in ${filename}`);
    });

    test.each(expectedDashboards)('%s should have valid data source references', (filename) => {
      const dashboard = dashboards[filename];
      
      dashboard.panels.forEach((panel, index) => {
        panel.targets.forEach((target, targetIndex) => {
          // Each target should have a data source
          expect(target).toHaveProperty('datasource');
          expect(target.datasource).toHaveProperty('type');
          
          // Should reference prometheus for metrics
          expect(target.datasource.type).toBe('prometheus');
          
          // Should have a query expression
          expect(target).toHaveProperty('expr');
          expect(typeof target.expr).toBe('string');
          expect(target.expr.length).toBeGreaterThan(0);
        }, `Target ${targetIndex} in panel ${index} of ${filename}`);
      });
    });
  });

  describe('Prometheus Query Validation', () => {
    const getQueriesFromDashboard = (dashboard) => {
      const queries = [];
      dashboard.panels.forEach(panel => {
        panel.targets.forEach(target => {
          if (target.expr) {
            queries.push({
              query: target.expr,
              panel: panel.title,
              refId: target.refId
            });
          }
        });
      });
      return queries;
    };

    test.each(expectedDashboards)('%s should have valid Prometheus queries', (filename) => {
      const dashboard = dashboards[filename];
      const queries = getQueriesFromDashboard(dashboard);
      
      expect(queries.length).toBeGreaterThan(0);
      
      queries.forEach(({ query, panel }) => {
        // Basic syntax validation
        expect(query).not.toMatch(/^\s*$/); // Not empty or whitespace only
        expect(query).not.toMatch(/\{\s*\}/); // Not empty label selectors
        
        // Should not have obvious syntax errors
        expect(query).not.toMatch(/\(\s*\)/); // Empty parentheses
        expect(query).not.toMatch(/\[\s*\]/); // Empty brackets
        
        // If it's a rate query, should have proper time range
        if (query.includes('rate(')) {
          expect(query).toMatch(/\[\d+[smhd]\]/); // Should have time range like [5m]
        }
        
        // If it's a histogram_quantile, should have proper format
        if (query.includes('histogram_quantile(')) {
          expect(query).toMatch(/histogram_quantile\(0\.\d+,/); // Should have quantile value
        }
      }, `Query in panel "${panel}"`);
    });

    test('AI Curator metrics should be properly referenced', () => {
      const allQueries = [];
      
      Object.values(dashboards).forEach(dashboard => {
        const queries = getQueriesFromDashboard(dashboard);
        allQueries.push(...queries.map(q => q.query));
      });
      
      // Should have references to our custom metrics
      const aiCuratorMetrics = allQueries.filter(q => q.includes('ai_curator_'));
      expect(aiCuratorMetrics.length).toBeGreaterThan(10);
      
      // Check for specific metrics we expect
      const expectedMetrics = [
        'ai_curator_http_requests_total',
        'ai_curator_http_request_duration_seconds',
        'ai_curator_content_discovered_total',
        'ai_curator_tags_generated_total',
        'ai_curator_vector_operations_total',
        'ai_curator_cache_hit_rate'
      ];
      
      expectedMetrics.forEach(metric => {
        const found = allQueries.some(query => query.includes(metric));
        expect(found).toBe(true);
      }, `Expected metric ${metric} should be referenced in dashboards`);
    });
  });

  describe('Dashboard Metadata', () => {
    test.each(expectedDashboards)('%s should have proper tags and metadata', (filename) => {
      const dashboard = dashboards[filename];
      
      // Should have tags
      expect(dashboard).toHaveProperty('tags');
      expect(Array.isArray(dashboard.tags)).toBe(true);
      expect(dashboard.tags).toContain('ai-curator');
      
      // Should have description
      expect(dashboard).toHaveProperty('description');
      expect(typeof dashboard.description).toBe('string');
      expect(dashboard.description.length).toBeGreaterThan(10);
      
      // Should be editable
      expect(dashboard).toHaveProperty('editable');
      expect(dashboard.editable).toBe(true);
      
      // Should have proper time settings
      expect(dashboard.time).toHaveProperty('from');
      expect(dashboard.time).toHaveProperty('to');
      expect(dashboard.time.to).toBe('now');
    });

    test('Dashboard UIDs should be unique', () => {
      const uids = Object.values(dashboards).map(d => d.uid);
      const uniqueUids = [...new Set(uids)];
      expect(uids.length).toBe(uniqueUids.length);
    });

    test('Dashboard refresh intervals should be reasonable', () => {
      const validRefreshIntervals = ['5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h'];
      
      Object.entries(dashboards).forEach(([filename, dashboard]) => {
        expect(validRefreshIntervals).toContain(dashboard.refresh);
      }, `${filename} should have a valid refresh interval`);
    });
  });

  describe('Accessibility and UX', () => {
    test.each(expectedDashboards)('%s panels should have reasonable sizes', (filename) => {
      const dashboard = dashboards[filename];
      
      dashboard.panels.forEach((panel, index) => {
        // Panels should not be too small
        expect(panel.gridPos.h).toBeGreaterThanOrEqual(3);
        expect(panel.gridPos.w).toBeGreaterThanOrEqual(3);
        
        // Single-stat panels can be smaller
        if (panel.type === 'stat' || panel.type === 'gauge') {
          expect(panel.gridPos.h).toBeGreaterThanOrEqual(3);
          expect(panel.gridPos.w).toBeGreaterThanOrEqual(4);
        }
        
        // Time series panels should be reasonably sized
        if (panel.type === 'timeseries') {
          expect(panel.gridPos.h).toBeGreaterThanOrEqual(6);
          expect(panel.gridPos.w).toBeGreaterThanOrEqual(8);
        }
      }, `Panel ${index} in ${filename} should have reasonable dimensions`);
    });

    test.each(expectedDashboards)('%s should have good color themes', (filename) => {
      const dashboard = dashboards[filename];
      
      // Should use dark theme
      expect(dashboard.style).toBe('dark');
      
      // Panels should have proper color configurations
      dashboard.panels.forEach(panel => {
        if (panel.fieldConfig && panel.fieldConfig.defaults) {
          const defaults = panel.fieldConfig.defaults;
          
          // Should have color configuration
          expect(defaults).toHaveProperty('color');
          
          // Thresholds should be properly configured for alerting panels
          if (panel.title.toLowerCase().includes('error') || 
              panel.title.toLowerCase().includes('alert') ||
              panel.title.toLowerCase().includes('status')) {
            expect(defaults).toHaveProperty('thresholds');
            expect(defaults.thresholds).toHaveProperty('steps');
            expect(Array.isArray(defaults.thresholds.steps)).toBe(true);
          }
        }
      });
    });
  });
});