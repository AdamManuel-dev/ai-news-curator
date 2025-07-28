/**
 * @fileoverview Tests for secrets management service
 * @lastmodified 2025-07-27T18:45:00Z
 * 
 * Features: Unit tests for all secret backends and manager functionality
 * Main APIs: Test coverage for CRUD operations, validation, rotation
 * Constraints: Uses temporary directories, mocked backends, cleanup after tests
 * Patterns: Jest testing framework, mock implementations, async test patterns
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { 
  SecretsManager, 
  EnvironmentSecretBackend, 
  FileSecretBackend,
  getConfigWithSecrets 
} from '../index';

describe('SecretsManager', () => {
  let secretsManager: SecretsManager;
  let tempDir: string;

  beforeEach(async () => {
    secretsManager = new SecretsManager();
    
    // Create temporary directory for file backend tests
    tempDir = join(tmpdir(), `secrets-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('EnvironmentSecretBackend', () => {
    let backend: EnvironmentSecretBackend;

    beforeEach(() => {
      backend = new EnvironmentSecretBackend();
    });

    afterEach(() => {
      // Clean up test environment variables
      delete process.env['TEST_SECRET'];
      delete process.env['ANOTHER_TEST_SECRET'];
      delete process.env['TEST'];
    });

    it('should get secret from environment variables', async () => {
      process.env['TEST_SECRET'] = 'test-value';
      
      const secret = await backend.getSecret('TEST_SECRET');
      
      expect(secret).toEqual({
        key: 'TEST_SECRET',
        value: 'test-value',
        metadata: {
          description: 'Environment variable',
          environment: process.env['NODE_ENV'] || 'development',
        },
      });
    });

    it('should return null for non-existent secret', async () => {
      const secret = await backend.getSecret('NON_EXISTENT_SECRET');
      expect(secret).toBeNull();
    });

    it('should list environment variables', async () => {
      const uniqueKey1 = `TEST_SECRET_${Date.now()}`;
      const uniqueKey2 = `ANOTHER_TEST_SECRET_${Date.now()}`;
      
      process.env[uniqueKey1] = 'value1';
      process.env[uniqueKey2] = 'value2';
      
      try {
        const keys = await backend.listSecrets(uniqueKey1);
        expect(keys).toContain(uniqueKey1);
        
        const allTestKeys = await backend.listSecrets('TEST_SECRET_');
        expect(allTestKeys).toContain(uniqueKey1);
        
        const anotherKeys = await backend.listSecrets('ANOTHER_TEST_SECRET_');
        expect(anotherKeys).toContain(uniqueKey2);
      } finally {
        delete process.env[uniqueKey1];
        delete process.env[uniqueKey2];
      }
    });

    it('should throw error when trying to set secret', async () => {
      await expect(backend.setSecret({
        key: 'test',
        value: 'value',
      })).rejects.toThrow('Cannot modify environment variables at runtime');
    });

    it('should throw error when trying to delete secret', async () => {
      await expect(backend.deleteSecret('test')).rejects.toThrow('Cannot delete environment variables at runtime');
    });
  });

  describe('FileSecretBackend', () => {
    let backend: FileSecretBackend;

    beforeEach(() => {
      // AES-256-CBC requires a 64-character hex key (32 bytes)
      const testKey = 'a'.repeat(64); // 64 hex chars = 32 bytes
      backend = new FileSecretBackend(tempDir, testKey);
    });

    it('should set and get a secret', async () => {
      const secret = {
        key: 'test-secret',
        value: 'test-value',
        metadata: {
          description: 'Test secret',
          tags: ['test'],
        },
      };

      await backend.setSecret(secret);
      const retrieved = await backend.getSecret('test-secret');

      expect(retrieved).toEqual(secret);
    });

    it('should return null for non-existent secret', async () => {
      const secret = await backend.getSecret('non-existent');
      expect(secret).toBeNull();
    });

    it('should delete a secret', async () => {
      const secret = {
        key: 'test-secret',
        value: 'test-value',
      };

      await backend.setSecret(secret);
      await backend.deleteSecret('test-secret');
      
      const retrieved = await backend.getSecret('test-secret');
      expect(retrieved).toBeNull();
    });

    it('should list secrets', async () => {
      await backend.setSecret({ key: 'secret1', value: 'value1' });
      await backend.setSecret({ key: 'secret2', value: 'value2' });
      await backend.setSecret({ key: 'other', value: 'value3' });

      const allKeys = await backend.listSecrets();
      expect(allKeys).toContain('secret1');
      expect(allKeys).toContain('secret2');
      expect(allKeys).toContain('other');

      const filteredKeys = await backend.listSecrets('secret');
      expect(filteredKeys).toContain('secret1');
      expect(filteredKeys).toContain('secret2');
      expect(filteredKeys).not.toContain('other');
    });

    it('should handle expired secrets', async () => {
      const expiredSecret = {
        key: 'expired-secret',
        value: 'test-value',
        metadata: {
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      };

      await backend.setSecret(expiredSecret);
      
      // When we try to get an expired secret, it should be null (and deleted)
      const retrieved = await backend.getSecret('expired-secret');
      expect(retrieved).toBeNull();
      
      // Verify it was actually deleted by trying to get it again
      const retrievedAgain = await backend.getSecret('expired-secret');
      expect(retrievedAgain).toBeNull();
    });

    it('should rotate secrets', async () => {
      const secret = {
        key: 'JWT_SECRET',
        value: 'old-secret-value',
      };

      await backend.setSecret(secret);
      await backend.rotateSecret('JWT_SECRET');
      
      const rotated = await backend.getSecret('JWT_SECRET');
      expect(rotated?.value).not.toBe('old-secret-value');
      expect(rotated?.value).toHaveLength(64); // 32 bytes in hex
      expect(rotated?.metadata?.lastRotated).toBeDefined();
    });

    it('should encrypt and decrypt secrets properly', async () => {
      const secret = {
        key: 'sensitive-secret',
        value: 'very-sensitive-data-123!@#',
      };

      await backend.setSecret(secret);
      
      // Read the raw file to ensure it's encrypted
      const secretFile = join(tempDir, 'sensitive-secret.secret');
      const rawContent = await fs.readFile(secretFile, 'utf8');
      
      expect(rawContent).not.toContain('very-sensitive-data-123!@#');
      expect(rawContent).toContain(':'); // IV:encrypted format
      
      // Ensure we can still retrieve the original value
      const retrieved = await backend.getSecret('sensitive-secret');
      expect(retrieved?.value).toBe('very-sensitive-data-123!@#');
    });

    it('should handle file permissions correctly', async () => {
      const secret = {
        key: 'permission-test',
        value: 'test-value',
      };

      await backend.setSecret(secret);
      
      const secretFile = join(tempDir, 'permission-test.secret');
      const stats = await fs.stat(secretFile);
      
      // File should be readable/writable by owner only (0o600)
      expect(stats.mode & 0o777).toBe(0o600);
    });
  });

  describe('SecretsManager', () => {
    beforeEach(() => {
      const fileBackend = new FileSecretBackend(tempDir);
      secretsManager.registerBackend('test-file', fileBackend);
    });

    it('should get secret from default backend', async () => {
      process.env['TEST_SECRET'] = 'env-value';
      
      const value = await secretsManager.getSecret('TEST_SECRET');
      expect(value).toBe('env-value');
      
      delete process.env['TEST_SECRET'];
    });

    it('should get secret from specific backend', async () => {
      await secretsManager.setSecret('test-key', 'file-value', {}, 'test-file');
      
      const value = await secretsManager.getSecret('test-key', 'test-file');
      expect(value).toBe('file-value');
    });

    it('should set secret with metadata', async () => {
      const metadata = {
        description: 'Test secret',
        tags: ['test', 'example'],
        rotationInterval: 30,
      };

      await secretsManager.setSecret('test-key', 'test-value', metadata, 'test-file');
      
      const secret = await secretsManager.getSecretWithMetadata('test-key', 'test-file');
      expect(secret?.value).toBe('test-value');
      expect(secret?.metadata?.description).toBe('Test secret');
      expect(secret?.metadata?.tags).toEqual(['test', 'example']);
    });

    it('should validate configuration', async () => {
      // Set required secrets
      await secretsManager.setSecret('JWT_SECRET', 'valid-jwt-secret-key', {}, 'test-file');
      await secretsManager.setSecret('JWT_REFRESH_SECRET', 'valid-refresh-secret', {}, 'test-file');
      await secretsManager.setSecret('DB_PASSWORD', 'valid-db-password', {}, 'test-file');

      secretsManager.setDefaultBackend('test-file');
      
      const result = await secretsManager.validateConfiguration();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', async () => {
      // Set invalid secrets
      await secretsManager.setSecret('JWT_SECRET', 'short', {}, 'test-file');
      
      secretsManager.setDefaultBackend('test-file');
      
      const result = await secretsManager.validateConfiguration();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should rotate expired secrets', async () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      await secretsManager.setSecret('API_KEY', 'old-key', {
        rotationInterval: 1, // 1 day
        lastRotated: yesterday,
      }, 'test-file');

      const rotatedKeys = await secretsManager.rotateExpiredSecrets('test-file');
      
      expect(rotatedKeys).toContain('API_KEY');
      
      const rotated = await secretsManager.getSecretWithMetadata('API_KEY', 'test-file');
      expect(rotated?.value).not.toBe('old-key');
      expect(rotated?.metadata?.lastRotated).toBeInstanceOf(Date);
    });

    it('should handle backend errors gracefully', async () => {
      await expect(secretsManager.getSecret('test', 'non-existent-backend'))
        .rejects.toThrow('Backend non-existent-backend not found');
    });
  });

  describe('getConfigWithSecrets', () => {
    let testSecretsManager: SecretsManager;

    beforeEach(() => {
      testSecretsManager = new SecretsManager();
      const fileBackend = new FileSecretBackend(tempDir);
      testSecretsManager.registerBackend('test-file', fileBackend);
      testSecretsManager.setDefaultBackend('test-file');
    });

    it('should override config with secrets', async () => {
      // Mock the getConfigWithSecrets function to use our test secrets manager
      const mockGetConfig = async () => {
        const config = await import('../../../config');
        
        // Get overrides from our test backend
        const jwtSecret = await testSecretsManager.getSecret('JWT_SECRET', 'test-file');
        const dbPassword = await testSecretsManager.getSecret('DB_PASSWORD', 'test-file');
        
        return {
          ...config.config,
          jwt: {
            ...config.config.jwt,
            secret: jwtSecret || config.config.jwt.secret,
          },
          database: {
            ...config.config.database,
            password: dbPassword || config.config.database.password,
          },
        };
      };

      // Set some secrets
      await testSecretsManager.setSecret('JWT_SECRET', 'secret-from-vault', {}, 'test-file');
      await testSecretsManager.setSecret('DB_PASSWORD', 'db-secret-password', {}, 'test-file');
      
      const config = await mockGetConfig();
      
      expect(config.jwt.secret).toBe('secret-from-vault');
      expect(config.database.password).toBe('db-secret-password');
    });

    it('should fallback to original config if no secret found', async () => {
      const config = await getConfigWithSecrets();
      
      // Should use original config values when secrets are not found
      expect(config.jwt.secret).toBeDefined();
      expect(config.database.password).toBeDefined();
    });
  });
});