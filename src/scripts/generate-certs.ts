#!/usr/bin/env node

/**
 * @fileoverview Generate self-signed TLS certificates for development
 * @lastmodified 2025-01-27T22:50:00Z
 * 
 * Features: Self-signed cert generation, development CA creation, multi-domain support
 * Main APIs: generateCertificates(), validateCertificates()
 * Constraints: Requires OpenSSL, development use only, not for production
 * Patterns: File system operations, subprocess execution, certificate validation
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import logger from '@utils/logger';

/**
 * Certificate generation options
 */
interface CertOptions {
  domains: string[];
  keySize: number;
  validDays: number;
  outputDir: string;
  country?: string;
  state?: string;
  city?: string;
  organization?: string;
  unit?: string;
}

/**
 * Default certificate options for development
 */
const DEFAULT_OPTIONS: CertOptions = {
  domains: ['localhost', '127.0.0.1', '::1'],
  keySize: 2048,
  validDays: 365,
  outputDir: './certs',
  country: 'US',
  state: 'Development',
  city: 'Development',
  organization: 'AI Content Curator',
  unit: 'Development'
};

/**
 * Check if OpenSSL is available
 */
function checkOpenSSL(): boolean {
  try {
    execSync('openssl version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate self-signed certificates for development
 */
async function generateCertificates(options: Partial<CertOptions> = {}): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info('Starting certificate generation', {
    domains: opts.domains,
    keySize: opts.keySize,
    validDays: opts.validDays,
    outputDir: opts.outputDir
  });

  // Check if OpenSSL is available
  if (!checkOpenSSL()) {
    throw new Error('OpenSSL is not available. Please install OpenSSL to generate certificates.');
  }

  // Create output directory
  if (!fs.existsSync(opts.outputDir)) {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    logger.info(`Created certificates directory: ${opts.outputDir}`);
  }

  const keyPath = path.join(opts.outputDir, 'private.key');
  const certPath = path.join(opts.outputDir, 'certificate.crt');
  const configPath = path.join(opts.outputDir, 'openssl.conf');

  try {
    // Generate OpenSSL configuration
    const opensslConfig = generateOpenSSLConfig(opts);
    fs.writeFileSync(configPath, opensslConfig);
    logger.debug('OpenSSL configuration written');

    // Generate private key
    logger.info('Generating private key...');
    execSync(`openssl genrsa -out "${keyPath}" ${opts.keySize}`, { stdio: 'pipe' });
    logger.info(`Private key generated: ${keyPath}`);

    // Generate certificate signing request and self-signed certificate
    logger.info('Generating self-signed certificate...');
    execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days ${opts.validDays} -config "${configPath}"`, { 
      stdio: 'pipe' 
    });
    logger.info(`Certificate generated: ${certPath}`);

    // Set appropriate file permissions (readable by owner only)
    fs.chmodSync(keyPath, 0o600);
    fs.chmodSync(certPath, 0o644);
    logger.debug('Certificate file permissions set');

    // Clean up temporary config file
    fs.unlinkSync(configPath);

    // Validate generated certificates
    const validation = validateCertificate(certPath, keyPath);
    if (validation.valid) {
      logger.info('Certificate validation successful', validation.info);
    } else {
      logger.error('Certificate validation failed', validation.errors);
      throw new Error('Generated certificate validation failed');
    }

    logger.info('Certificate generation completed successfully', {
      keyPath,
      certPath,
      domains: opts.domains,
      validDays: opts.validDays
    });

    // Print usage instructions
    printUsageInstructions(keyPath, certPath);

  } catch (error) {
    logger.error('Certificate generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Generate OpenSSL configuration for multi-domain certificate
 */
function generateOpenSSLConfig(options: CertOptions): string {
  const { domains, country, state, city, organization, unit } = options;

  const config = `
[req]
default_bits = ${options.keySize}
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=${country}
ST=${state}
L=${city}
O=${organization}
OU=${unit}
CN=${domains[0]}

[v3_req]
subjectAltName = @alt_names

[alt_names]
${domains.map((domain, index) => {
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(domain) || domain.includes(':');
  return isIP ? `IP.${index + 1} = ${domain}` : `DNS.${index + 1} = ${domain}`;
}).join('\n')}
`;

  return config.trim();
}

/**
 * Validate a certificate and private key pair
 */
function validateCertificate(certPath: string, keyPath: string): { valid: boolean; errors?: string[]; info?: any } {
  const errors: string[] = [];

  try {
    // Check if files exist
    if (!fs.existsSync(certPath)) {
      errors.push(`Certificate file not found: ${certPath}`);
    }

    if (!fs.existsSync(keyPath)) {
      errors.push(`Private key file not found: ${keyPath}`);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Validate certificate format
    try {
      execSync(`openssl x509 -in "${certPath}" -noout -text`, { stdio: 'pipe' });
    } catch (error) {
      errors.push('Invalid certificate format');
    }

    // Validate private key format
    try {
      execSync(`openssl rsa -in "${keyPath}" -check -noout`, { stdio: 'pipe' });
    } catch (error) {
      errors.push('Invalid private key format');
    }

    // Check if certificate and key match
    try {
      const certHash = execSync(`openssl x509 -in "${certPath}" -pubkey -noout | openssl rsa -pubin -outform DER | openssl dgst -sha256 -binary | openssl enc -base64`, { 
        encoding: 'utf8' 
      }).trim();
      
      const keyHash = execSync(`openssl rsa -in "${keyPath}" -pubout -outform DER | openssl dgst -sha256 -binary | openssl enc -base64`, { 
        encoding: 'utf8' 
      }).trim();

      if (certHash !== keyHash) {
        errors.push('Certificate and private key do not match');
      }
    } catch (error) {
      errors.push('Failed to verify certificate and key pair');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Get certificate information
    const certInfo = getCertificateInfo(certPath);
    
    return {
      valid: true,
      info: certInfo
    };

  } catch (error) {
    return {
      valid: false,
      errors: [`Certificate validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Extract certificate information
 */
function getCertificateInfo(certPath: string): any {
  try {
    const certText = execSync(`openssl x509 -in "${certPath}" -noout -text`, { encoding: 'utf8' });
    
    // Extract common information using regex
    const subject = certText.match(/Subject: (.+)/)?.[1];
    const issuer = certText.match(/Issuer: (.+)/)?.[1];
    const notBefore = certText.match(/Not Before: (.+)/)?.[1];
    const notAfter = certText.match(/Not After : (.+)/)?.[1];
    const altNames = certText.match(/Subject Alternative Name:\s*\n\s*(.+)/)?.[1];

    return {
      subject,
      issuer,
      notBefore,
      notAfter,
      subjectAltNames: altNames?.split(', ') || [],
      isSelfSigned: subject === issuer
    };
  } catch (error) {
    return { error: 'Failed to parse certificate information' };
  }
}

/**
 * Print usage instructions for the generated certificates
 */
function printUsageInstructions(keyPath: string, certPath: string): void {
  console.log('\n🔒 TLS Certificates Generated Successfully!\n');
  console.log('📁 Certificate Files:');
  console.log(`   Private Key: ${keyPath}`);
  console.log(`   Certificate: ${certPath}\n`);
  console.log('🚀 To use with your application:');
  console.log('   1. Update your .env file:');
  console.log('      HTTPS_ENABLED=true');
  console.log(`      TLS_KEY_PATH=${keyPath}`);
  console.log(`      TLS_CERT_PATH=${certPath}`);
  console.log('      HTTPS_PORT=3443\n');
  console.log('   2. Start your application:');
  console.log('      npm run dev\n');
  console.log('   3. Access your application:');
  console.log('      HTTPS: https://localhost:3443');
  console.log('      HTTP:  http://localhost:3000\n');
  console.log('⚠️  Warning: These are self-signed certificates for development only!');
  console.log('   Your browser will show a security warning. This is normal for development.\n');
}

/**
 * Command line interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: Partial<CertOptions> = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--domains':
      case '-d':
        options.domains = args[++i]?.split(',') || DEFAULT_OPTIONS.domains;
        break;
      case '--output':
      case '-o':
        options.outputDir = args[++i] || DEFAULT_OPTIONS.outputDir;
        break;
      case '--days':
        options.validDays = parseInt(args[++i]) || DEFAULT_OPTIONS.validDays;
        break;
      case '--key-size':
        options.keySize = parseInt(args[++i]) || DEFAULT_OPTIONS.keySize;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  try {
    await generateCertificates(options);
    process.exit(0);
  } catch (error) {
    console.error('Certificate generation failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
Generate Self-Signed TLS Certificates for Development

Usage: npm run generate-certs [options]

Options:
  -d, --domains <domains>     Comma-separated list of domains (default: localhost,127.0.0.1,::1)
  -o, --output <directory>    Output directory for certificates (default: ./certs)
  --days <days>              Certificate validity in days (default: 365)
  --key-size <bits>          RSA key size in bits (default: 2048)
  -h, --help                 Show this help message

Examples:
  npm run generate-certs                                    # Generate with defaults
  npm run generate-certs -d localhost,example.local         # Custom domains
  npm run generate-certs -o ./ssl --days 730               # Custom output and validity

⚠️  These certificates are for development use only!
   Do not use self-signed certificates in production.
`);
}

// Export functions for testing
export { generateCertificates, validateCertificate, getCertificateInfo };

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}