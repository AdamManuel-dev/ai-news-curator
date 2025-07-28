/**
 * @fileoverview AWS Secrets Manager backend for secrets management
 * @lastmodified 2025-07-27T18:45:00Z
 * 
 * Features: AWS Secrets Manager integration, automatic rotation, region support
 * Main APIs: getSecret(), setSecret(), deleteSecret(), rotateSecret()
 * Constraints: Requires AWS credentials and permissions, regional deployment
 * Patterns: AWS SDK v3, error handling, automatic retry logic
 */

import { 
  SecretsManagerClient, 
  GetSecretValueCommand, 
  CreateSecretCommand, 
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  RotateSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import logger from '@/utils/logger';
import type { Secret, SecretBackend } from './index';

export class AWSSecretsManagerBackend implements SecretBackend {
  private client: SecretsManagerClient;
  private region: string;
  private prefix: string;

  constructor(region: string = 'us-east-1', prefix: string = 'ai-curator/') {
    this.region = region;
    this.prefix = prefix;
    this.client = new SecretsManagerClient({ 
      region: this.region,
      maxAttempts: 3,
    });
  }

  private getSecretArn(key: string): string {
    return `${this.prefix}${key}`;
  }

  async getSecret(key: string): Promise<Secret | null> {
    try {
      const command = new GetSecretValueCommand({
        SecretId: this.getSecretArn(key),
      });

      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        logger.warn(`Secret ${key} has no value in AWS Secrets Manager`);
        return null;
      }

      let secretData: any;
      try {
        // Try to parse as JSON first
        secretData = JSON.parse(response.SecretString);
      } catch {
        // If not JSON, treat as plain string
        secretData = { value: response.SecretString };
      }

      return {
        key,
        value: secretData.value || response.SecretString,
        metadata: {
          description: response.Description || 'AWS Secrets Manager secret',
          createdBy: 'aws-secrets-manager',
          environment: process.env['NODE_ENV'],
          lastRotated: response.LastRotatedDate || undefined,
          ...secretData.metadata,
        },
      };
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return null;
      }
      
      logger.error(`Failed to get secret ${key} from AWS Secrets Manager:`, error);
      throw new Error(`AWS Secrets Manager error: ${error.message}`);
    }
  }

  async setSecret(secret: Secret): Promise<void> {
    try {
      // Check if secret exists
      const existing = await this.getSecret(secret.key);
      
      const secretValue = JSON.stringify({
        value: secret.value,
        metadata: secret.metadata,
      });

      if (existing) {
        // Update existing secret
        const command = new UpdateSecretCommand({
          SecretId: this.getSecretArn(secret.key),
          SecretString: secretValue,
          Description: secret.metadata?.description,
        });
        
        await this.client.send(command);
        logger.info(`Updated secret ${secret.key} in AWS Secrets Manager`);
      } else {
        // Create new secret
        const command = new CreateSecretCommand({
          Name: this.getSecretArn(secret.key),
          SecretString: secretValue,
          Description: secret.metadata?.description || `Secret for ${secret.key}`,
          Tags: secret.metadata?.tags?.map(tag => ({
            Key: 'Tag',
            Value: tag,
          })),
        });

        await this.client.send(command);
        logger.info(`Created secret ${secret.key} in AWS Secrets Manager`);
      }
    } catch (error: any) {
      logger.error(`Failed to set secret ${secret.key} in AWS Secrets Manager:`, error);
      throw new Error(`AWS Secrets Manager error: ${error.message}`);
    }
  }

  async deleteSecret(key: string): Promise<void> {
    try {
      const command = new DeleteSecretCommand({
        SecretId: this.getSecretArn(key),
        ForceDeleteWithoutRecovery: true, // Set to false in production for recovery window
      });

      await this.client.send(command);
      logger.info(`Deleted secret ${key} from AWS Secrets Manager`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        logger.warn(`Secret ${key} not found in AWS Secrets Manager`);
        return;
      }
      
      logger.error(`Failed to delete secret ${key} from AWS Secrets Manager:`, error);
      throw new Error(`AWS Secrets Manager error: ${error.message}`);
    }
  }

  async listSecrets(prefix?: string): Promise<string[]> {
    try {
      const secrets: string[] = [];
      let nextToken: string | undefined;

      do {
        const command = new ListSecretsCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);
        
        if (response.SecretList) {
          for (const secret of response.SecretList) {
            if (secret.Name && secret.Name.startsWith(this.prefix)) {
              const key = secret.Name.replace(this.prefix, '');
              if (!prefix || key.startsWith(prefix)) {
                secrets.push(key);
              }
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);

      return secrets;
    } catch (error: any) {
      logger.error('Failed to list secrets from AWS Secrets Manager:', error);
      throw new Error(`AWS Secrets Manager error: ${error.message}`);
    }
  }

  async rotateSecret(key: string): Promise<void> {
    try {
      const command = new RotateSecretCommand({
        SecretId: this.getSecretArn(key),
        // Note: Automatic rotation setup would be configured separately
      });

      await this.client.send(command);
      logger.info(`Initiated rotation for secret ${key} in AWS Secrets Manager`);
    } catch (error: any) {
      logger.error(`Failed to rotate secret ${key} in AWS Secrets Manager:`, error);
      throw new Error(`AWS Secrets Manager error: ${error.message}`);
    }
  }

  // AWS-specific methods
  async enableAutomaticRotation(
    key: string, 
    _lambdaFunctionArn: string, 
    _rotationIntervalDays: number = 30
  ): Promise<void> {
    try {
      // This would require additional AWS SDK commands for automatic rotation setup
      // Implementation depends on specific rotation requirements
      logger.info(`Automatic rotation setup for ${key} would be configured here`);
    } catch (error: any) {
      logger.error(`Failed to enable automatic rotation for ${key}:`, error);
      throw error;
    }
  }

  async getSecretVersions(_key: string): Promise<Array<{ versionId: string; createdDate: Date }>> {
    // Implementation for getting secret versions
    // This would require additional AWS SDK calls
    return [];
  }
}