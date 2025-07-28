#!/usr/bin/env node

/**
 * @fileoverview CLI script for automated API key rotation
 * 
 * Features: Expiring key detection, automated rotation, notification logging, cron scheduling
 * Main APIs: rotateExpiringKeys(), command-line argument parsing
 * Constraints: Requires database connection, admin privileges, proper env vars
 * Patterns: Exit codes for monitoring, detailed logging, dry-run mode
 */

import { config } from '@config/index';
import { DatabaseConnection } from '@database/connection';
import { ApiKeyService } from '@services/auth/api-key';
import logger from '@utils/logger';

/**
 * Command line options for the rotation script
 */
interface RotationOptions {
  daysBeforeExpiry: number;
  autoRotate: boolean;
  dryRun: boolean;
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
function parseArguments(): RotationOptions {
  const args = process.argv.slice(2);
  const options: RotationOptions = {
    daysBeforeExpiry: 7,
    autoRotate: false,
    dryRun: true,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--days':
      case '-d':
        options.daysBeforeExpiry = parseInt(args[++i]) || 7;
        break;
      case '--auto-rotate':
      case '-r':
        options.autoRotate = true;
        break;
      case '--no-dry-run':
        options.dryRun = false;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
API Key Rotation Script

Usage: npm run rotate-keys [options]

Options:
  -d, --days <number>       Number of days before expiry to check (default: 7)
  -r, --auto-rotate         Actually rotate keys (default: false - notification only)
  --no-dry-run             Disable dry run mode (required for actual rotation)
  -v, --verbose            Enable verbose logging
  -h, --help               Show this help message

Examples:
  npm run rotate-keys                           # Check for expiring keys (dry run)
  npm run rotate-keys -d 14                    # Check keys expiring in 14 days
  npm run rotate-keys -r --no-dry-run          # Actually rotate expiring keys
  npm run rotate-keys -r --no-dry-run -d 3     # Rotate keys expiring in 3 days

Exit Codes:
  0 - Success
  1 - Invalid arguments or usage error
  2 - Database connection error
  3 - Rotation operation failed
  4 - Partial failure (some keys failed to rotate)
`);
}

/**
 * Main rotation function
 */
async function runRotation(): Promise<void> {
  const options = parseArguments();
  
  if (options.verbose) {
    logger.level = 'debug';
  }

  logger.info('Starting API key rotation script', {
    options,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });

  let db: DatabaseConnection | null = null;

  try {
    // Initialize database connection
    db = new DatabaseConnection(config.database);
    await db.connect();
    
    if (options.verbose) {
      logger.debug('Database connection established');
    }

    // Initialize API key service
    const apiKeyService = new ApiKeyService(db);

    // If dry run and auto-rotate both set, force dry run
    const actualAutoRotate = options.dryRun ? false : options.autoRotate;
    
    if (options.dryRun && options.autoRotate) {
      logger.warn('Dry run mode enabled - keys will NOT be rotated despite --auto-rotate flag');
    }

    // Perform rotation check/operation
    const result = await apiKeyService.rotateExpiringKeys(
      options.daysBeforeExpiry, 
      actualAutoRotate
    );

    // Log results
    const summary = {
      keysExpiringSoon: result.notified.length,
      keysRotated: result.rotated,
      usersNotified: result.notified,
      rotationDetails: result.rotationResults,
      operation: {
        daysBeforeExpiry: options.daysBeforeExpiry,
        autoRotate: actualAutoRotate,
        dryRun: options.dryRun
      }
    };

    logger.info('API key rotation completed', summary);

    // Print summary to console
    console.log('\n=== API Key Rotation Summary ===');
    console.log(`Keys expiring in ${options.daysBeforeExpiry} days: ${result.notified.length}`);
    console.log(`Keys rotated: ${result.rotated}`);
    
    if (result.notified.length > 0) {
      console.log(`Users notified: ${result.notified.join(', ')}`);
    }

    if (result.rotationResults.length > 0) {
      console.log('\nRotation Results:');
      result.rotationResults.forEach(r => {
        const status = r.success ? '✅' : '❌';
        const details = r.success ? `new key: ${r.newKeyId}` : `error: ${r.error}`;
        console.log(`  ${status} ${r.keyId} - ${details}`);
      });
    }

    if (options.dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No keys were actually rotated');
    }

    // Determine exit code
    let exitCode = 0;
    const failedRotations = result.rotationResults.filter(r => !r.success);
    
    if (failedRotations.length > 0) {
      if (failedRotations.length === result.rotationResults.length) {
        // All rotations failed
        exitCode = 3;
        logger.error('All key rotations failed');
      } else {
        // Partial failure
        exitCode = 4;
        logger.warn('Some key rotations failed', {
          failed: failedRotations.length,
          total: result.rotationResults.length
        });
      }
    }

    console.log(`\nScript completed with exit code: ${exitCode}`);
    process.exit(exitCode);

  } catch (error) {
    logger.error('API key rotation script failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    console.error('\n❌ Script failed:', error instanceof Error ? error.message : 'Unknown error');
    
    if (error instanceof Error && error.message.includes('connection')) {
      process.exit(2); // Database connection error
    } else {
      process.exit(3); // General operation failure
    }
  } finally {
    // Clean up database connection
    if (db) {
      await db.disconnect();
      if (options.verbose) {
        logger.debug('Database connection closed');
      }
    }
  }
}

/**
 * Handle script termination signals
 */
process.on('SIGINT', () => {
  logger.info('Received SIGINT, gracefully shutting down...');
  process.exit(130);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, gracefully shutting down...');
  process.exit(143);
});

// Run the script if called directly
if (require.main === module) {
  runRotation().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { runRotation, parseArguments };