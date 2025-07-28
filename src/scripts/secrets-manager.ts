#!/usr/bin/env ts-node
/**
 * @fileoverview CLI tool for secrets management operations
 * @lastmodified 2025-07-27T18:45:00Z
 * 
 * Features: Secret CRUD operations, rotation, validation, import/export
 * Main APIs: CLI commands for get, set, delete, rotate, list, validate
 * Constraints: Requires appropriate backend permissions, file system access
 * Patterns: Command pattern, interactive prompts, secure input handling
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import { secretsManager, FileSecretBackend } from '../services/secrets';

const program = new Command();

// Helper function for secure password input
function askForSecret(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

program
  .name('secrets-manager')
  .description('AI News Curator Secrets Management CLI')
  .version('1.0.0');

program
  .command('get')
  .description('Get a secret value')
  .argument('<key>', 'Secret key to retrieve')
  .option('-b, --backend <backend>', 'Backend to use (environment, file, aws)', 'environment')
  .option('-m, --metadata', 'Show metadata')
  .action(async (key: string, options) => {
    try {
      if (options.metadata) {
        const secret = await secretsManager.getSecretWithMetadata(key, options.backend);
        if (secret) {
          console.log(JSON.stringify(secret, null, 2));
        } else {
          console.log(`Secret '${key}' not found`);
          process.exit(1);
        }
      } else {
        const value = await secretsManager.getSecret(key, options.backend);
        if (value) {
          console.log(value);
        } else {
          console.log(`Secret '${key}' not found`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error('Error getting secret:', error);
      process.exit(1);
    }
  });

program
  .command('set')
  .description('Set a secret value')
  .argument('<key>', 'Secret key to set')
  .option('-v, --value <value>', 'Secret value (will prompt if not provided)')
  .option('-b, --backend <backend>', 'Backend to use (file, aws)', 'file')
  .option('-d, --description <description>', 'Secret description')
  .option('-e, --expires <days>', 'Expiration in days')
  .option('-r, --rotation <days>', 'Rotation interval in days')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (key: string, options) => {
    try {
      let value = options.value;
      if (!value) {
        value = await askForSecret(`Enter value for secret '${key}': `);
      }

      const metadata: any = {};
      if (options.description) metadata.description = options.description;
      if (options.expires) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + parseInt(options.expires));
        metadata.expiresAt = expirationDate;
      }
      if (options.rotation) metadata.rotationInterval = parseInt(options.rotation);
      if (options.tags) metadata.tags = options.tags.split(',').map((t: string) => t.trim());
      metadata.createdBy = process.env['USER'] || 'cli';
      metadata.environment = process.env['NODE_ENV'] || 'development';

      await secretsManager.setSecret(key, value, metadata, options.backend);
      console.log(`Secret '${key}' set successfully`);
    } catch (error) {
      console.error('Error setting secret:', error);
      process.exit(1);
    }
  });

program
  .command('delete')
  .description('Delete a secret')
  .argument('<key>', 'Secret key to delete')
  .option('-b, --backend <backend>', 'Backend to use (file, aws)', 'file')
  .option('-f, --force', 'Force deletion without confirmation')
  .action(async (key: string, options) => {
    try {
      if (!options.force) {
        const confirmation = await askForSecret(`Are you sure you want to delete secret '${key}'? (yes/no): `);
        if (confirmation.toLowerCase() !== 'yes') {
          console.log('Deletion cancelled');
          return;
        }
      }

      await secretsManager.deleteSecret(key, options.backend);
      console.log(`Secret '${key}' deleted successfully`);
    } catch (error) {
      console.error('Error deleting secret:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List secrets')
  .option('-b, --backend <backend>', 'Backend to use (environment, file, aws)', 'environment')
  .option('-p, --prefix <prefix>', 'Filter by prefix')
  .action(async (options) => {
    try {
      const keys = await secretsManager.listSecrets(options.prefix, options.backend);
      if (keys.length === 0) {
        console.log('No secrets found');
      } else {
        console.log('Secrets:');
        keys.forEach(key => console.log(`  ${key}`));
      }
    } catch (error) {
      console.error('Error listing secrets:', error);
      process.exit(1);
    }
  });

program
  .command('rotate')
  .description('Rotate a secret')
  .argument('<key>', 'Secret key to rotate')
  .option('-b, --backend <backend>', 'Backend to use (file, aws)', 'file')
  .action(async (key: string, options) => {
    try {
      await secretsManager.rotateSecret(key, options.backend);
      console.log(`Secret '${key}' rotated successfully`);
    } catch (error) {
      console.error('Error rotating secret:', error);
      process.exit(1);
    }
  });

program
  .command('rotate-expired')
  .description('Rotate all expired secrets')
  .option('-b, --backend <backend>', 'Backend to use (file, aws)', 'file')
  .option('--dry-run', 'Show what would be rotated without doing it')
  .action(async (options) => {
    try {
      if (options.dryRun) {
        const keys = await secretsManager.listSecrets(undefined, options.backend);
        console.log('Secrets that would be rotated:');
        
        for (const key of keys) {
          const secret = await secretsManager.getSecretWithMetadata(key, options.backend);
          if (secret?.metadata?.rotationInterval) {
            const lastRotated = secret.metadata.lastRotated || new Date(0);
            const rotationDue = new Date(lastRotated.getTime() + (secret.metadata.rotationInterval * 24 * 60 * 60 * 1000));
            
            if (new Date() >= rotationDue) {
              console.log(`  ${key} (due: ${rotationDue.toISOString()})`);
            }
          }
        }
      } else {
        const rotatedKeys = await secretsManager.rotateExpiredSecrets(options.backend);
        if (rotatedKeys.length === 0) {
          console.log('No secrets needed rotation');
        } else {
          console.log(`Rotated ${rotatedKeys.length} secrets:`);
          rotatedKeys.forEach(key => console.log(`  ${key}`));
        }
      }
    } catch (error) {
      console.error('Error rotating expired secrets:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate secrets configuration')
  .action(async () => {
    try {
      const result = await secretsManager.validateConfiguration();
      
      if (result.valid) {
        console.log('✅ All required secrets are configured correctly');
      } else {
        console.log('❌ Secrets configuration has issues:');
        result.errors.forEach(error => console.log(`  - ${error}`));
        process.exit(1);
      }
    } catch (error) {
      console.error('Error validating secrets:', error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export secrets to a file')
  .argument('<file>', 'Output file path')
  .option('-b, --backend <backend>', 'Backend to use (file, aws)', 'file')
  .option('-p, --prefix <prefix>', 'Export only secrets with this prefix')
  .option('-f, --format <format>', 'Output format (json, env)', 'json')
  .action(async (file: string, options) => {
    try {
      const keys = await secretsManager.listSecrets(options.prefix, options.backend);
      const secrets: Record<string, any> = {};

      for (const key of keys) {
        const secret = await secretsManager.getSecretWithMetadata(key, options.backend);
        if (secret) {
          secrets[key] = options.format === 'env' ? secret.value : secret;
        }
      }

      const fs = await import('fs/promises');
      let content: string;

      if (options.format === 'env') {
        content = Object.entries(secrets)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');
      } else {
        content = JSON.stringify(secrets, null, 2);
      }

      await fs.writeFile(file, content, { mode: 0o600 });
      console.log(`Exported ${keys.length} secrets to ${file}`);
    } catch (error) {
      console.error('Error exporting secrets:', error);
      process.exit(1);
    }
  });

program
  .command('import')
  .description('Import secrets from a file')
  .argument('<file>', 'Input file path')
  .option('-b, --backend <backend>', 'Backend to use (file, aws)', 'file')
  .option('-f, --format <format>', 'Input format (json, env)', 'json')
  .option('--overwrite', 'Overwrite existing secrets')
  .action(async (file: string, options) => {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(file, 'utf8');

      let secrets: Record<string, any>;

      if (options.format === 'env') {
        secrets = {};
        const lines = content.split('\n');
        for (const line of lines) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            secrets[key.trim()] = valueParts.join('=').trim();
          }
        }
      } else {
        secrets = JSON.parse(content);
      }

      let imported = 0;
      let skipped = 0;

      for (const [key, value] of Object.entries(secrets)) {
        const existing = await secretsManager.getSecret(key, options.backend);
        
        if (existing && !options.overwrite) {
          console.log(`Skipping existing secret: ${key}`);
          skipped++;
          continue;
        }

        if (typeof value === 'string') {
          await secretsManager.setSecret(key, value, undefined, options.backend);
        } else {
          await secretsManager.setSecret(key, value.value, value.metadata, options.backend);
        }
        
        imported++;
      }

      console.log(`Imported ${imported} secrets, skipped ${skipped}`);
    } catch (error) {
      console.error('Error importing secrets:', error);
      process.exit(1);
    }
  });

// Initialize file backend with better defaults in development
if (process.env['NODE_ENV'] === 'development') {
  const fileBackend = new FileSecretBackend('./secrets');
  secretsManager.registerBackend('file', fileBackend);
  secretsManager.setDefaultBackend('file');
}

if (require.main === module) {
  program.parse();
}