import { injectable, inject } from 'inversify';
import { Logger } from 'winston';
import { TOKENS } from '../../container/tokens';
import { RequestThrottleInfo } from './types';

@injectable()
export class RequestThrottle {
  private domainQueues = new Map<string, RequestThrottleInfo>();
  private readonly DEFAULT_DELAY = 1000; // 1 second default delay
  private readonly MAX_REQUESTS_PER_MINUTE = 60;

  constructor(
    @inject(TOKENS.Logger) private logger: Logger
  ) {}

  async waitForTurn(url: string, customDelay?: number): Promise<void> {
    const domain = this.extractDomain(url);
    const now = Date.now();
    
    const throttleInfo = this.getOrCreateThrottleInfo(domain, now);
    const delay = customDelay || this.DEFAULT_DELAY;
    
    // Check rate limiting (requests per minute)
    if (this.isRateLimited(throttleInfo, now)) {
      const waitTime = throttleInfo.resetTime - now;
      this.logger.warn('Rate limit reached, waiting', {
        domain,
        waitTime,
        requestCount: throttleInfo.requestCount
      });
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
      
      // Reset counter
      throttleInfo.requestCount = 0;
      throttleInfo.resetTime = now + 60000; // Reset in 1 minute
    }

    // Check minimum delay between requests
    const timeSinceLastRequest = now - throttleInfo.lastRequestTime;
    if (timeSinceLastRequest < delay) {
      const waitTime = delay - timeSinceLastRequest;
      this.logger.debug('Throttling request', {
        domain,
        waitTime,
        timeSinceLastRequest
      });
      
      await this.sleep(waitTime);
    }

    // Update throttle info
    throttleInfo.lastRequestTime = Date.now();
    throttleInfo.requestCount++;
    
    this.logger.debug('Request allowed', {
      domain,
      requestCount: throttleInfo.requestCount,
      lastRequestTime: throttleInfo.lastRequestTime
    });
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  private getOrCreateThrottleInfo(domain: string, now: number): RequestThrottleInfo {
    let throttleInfo = this.domainQueues.get(domain);
    
    if (!throttleInfo) {
      throttleInfo = {
        domain,
        lastRequestTime: 0,
        requestCount: 0,
        resetTime: now + 60000 // 1 minute from now
      };
      this.domainQueues.set(domain, throttleInfo);
    }

    return throttleInfo;
  }

  private isRateLimited(throttleInfo: RequestThrottleInfo, now: number): boolean {
    // Reset counter if the reset time has passed
    if (now >= throttleInfo.resetTime) {
      throttleInfo.requestCount = 0;
      throttleInfo.resetTime = now + 60000;
      return false;
    }

    return throttleInfo.requestCount >= this.MAX_REQUESTS_PER_MINUTE;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setCustomDelay(domain: string, delay: number): void {
    const throttleInfo = this.domainQueues.get(domain);
    if (throttleInfo) {
      // Store custom delay in a separate map if needed
      this.logger.info('Custom delay set for domain', { domain, delay });
    }
  }

  getThrottleStats(): Map<string, RequestThrottleInfo> {
    return new Map(this.domainQueues);
  }

  clearThrottleInfo(domain?: string): void {
    if (domain) {
      this.domainQueues.delete(domain);
      this.logger.info('Throttle info cleared for domain', { domain });
    } else {
      this.domainQueues.clear();
      this.logger.info('All throttle info cleared');
    }
  }

  getDomainStats(domain: string): RequestThrottleInfo | null {
    return this.domainQueues.get(domain) || null;
  }
}