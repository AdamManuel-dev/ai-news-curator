/**
 * @fileoverview Event-emitting service base class
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Event emission/subscription, domain events, event history, retry logic
 * Main APIs: emit(), emitDomainEvent(), on(), waitForEvent(), getEventStats()
 * Constraints: EventEmitter limits, TTL cleanup, max 100 events per type
 * Patterns: Extends BaseService, async events, exponential backoff, correlation IDs
 */

import { EventEmitter } from 'events';
import { BaseService } from '@services/index';
import type { ServiceConfiguration, ServiceEvent } from '@types/service';

export interface EventEmittingServiceConfig extends ServiceConfiguration {
  events: {
    enabled: boolean;
    maxListeners?: number;
    enableWildcard?: boolean;
    enableAsync?: boolean;
    retryFailedEvents?: boolean;
    eventTtl?: number; // Time to live for event history
  };
}

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  source: string;
  version?: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  retryCount?: number;
}

export interface DomainEvent {
  type: string;
  aggregateId: string;
  aggregateType: string;
  payload: any;
  metadata: EventMetadata;
}

export abstract class EventEmittingService extends BaseService {
  protected eventEmitter: EventEmitter;
  private eventHistory: Map<string, ServiceEvent[]> = new Map();
  private eventConfig: EventEmittingServiceConfig['events'];

  constructor(config?: Partial<EventEmittingServiceConfig>) {
    const eventConfig: EventEmittingServiceConfig = {
      events: {
        enabled: true,
        maxListeners: 100,
        enableWildcard: false,
        enableAsync: true,
        retryFailedEvents: true,
        eventTtl: 3600000, // 1 hour
        ...config?.events,
      },
      ...config,
    };

    super(eventConfig);
    
    this.eventConfig = eventConfig.events;
    this.eventEmitter = new EventEmitter();
    
    if (this.eventConfig.maxListeners) {
      this.eventEmitter.setMaxListeners(this.eventConfig.maxListeners);
    }

    // Set up error handling for event emitter
    this.eventEmitter.on('error', (error) => {
      this.logError('Event emitter error', error);
      this.recordMetric('events.emitter_error', 1);
    });

    // Clean up event history periodically
    if (this.eventConfig.eventTtl) {
      setInterval(() => this.cleanupEventHistory(), 60000); // Clean up every minute
    }
  }

  protected async onInitialize(): Promise<void> {
    await super.onInitialize();
    
    if (this.eventConfig.enabled) {
      this.logInfo('Event emitting capabilities initialized');
      await this.setupEventHandlers();
    }
  }

  protected async onShutdown(): Promise<void> {
    if (this.eventConfig.enabled) {
      this.eventEmitter.removeAllListeners();
      this.eventHistory.clear();
      this.logInfo('Event emitting capabilities shutdown');
    }
    
    await super.onShutdown();
  }

  /**
   * Template method for setting up event handlers
   */
  protected async setupEventHandlers(): Promise<void> {
    // Override in subclasses to set up specific event handlers
  }

  /**
   * Emit a service event
   */
  protected emit(eventType: string, payload: any, metadata?: Partial<EventMetadata>): void {
    if (!this.eventConfig.enabled) {
      return;
    }

    const event: ServiceEvent = {
      type: eventType,
      payload,
      timestamp: new Date(),
      source: this.serviceName,
      correlationId: metadata?.correlationId || this.generateCorrelationId(),
    };

    try {
      // Store in history
      this.storeEventInHistory(event);

      // Emit the event
      if (this.eventConfig.enableAsync) {
        setImmediate(() => {
          this.eventEmitter.emit(eventType, event);
          this.eventEmitter.emit('*', event); // Wildcard event
        });
      } else {
        this.eventEmitter.emit(eventType, event);
        this.eventEmitter.emit('*', event); // Wildcard event
      }

      this.recordMetric('events.emitted', 1, { type: eventType });
      this.logDebug('Event emitted', { type: eventType, correlationId: event.correlationId });
    } catch (error) {
      this.logError('Failed to emit event', error, { type: eventType });
      this.recordMetric('events.emit_error', 1, { type: eventType });
    }
  }

  /**
   * Emit a domain event
   */
  protected emitDomainEvent(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: any,
    metadata?: Partial<EventMetadata>
  ): void {
    const domainEvent: DomainEvent = {
      type: eventType,
      aggregateId,
      aggregateType,
      payload,
      metadata: {
        source: this.serviceName,
        timestamp: new Date(),
        correlationId: this.generateCorrelationId(),
        version: '1.0',
        ...metadata,
      },
    };

    this.emit(`domain.${aggregateType}.${eventType}`, domainEvent, metadata);
  }

  /**
   * Subscribe to an event
   */
  protected on(eventType: string, listener: (event: ServiceEvent) => void | Promise<void>): void {
    if (!this.eventConfig.enabled) {
      return;
    }

    const wrappedListener = async (event: ServiceEvent) => {
      const startTime = Date.now();
      
      try {
        await listener(event);
        
        const duration = Date.now() - startTime;
        this.recordMetric('events.handled', 1, { type: eventType });
        this.recordMetric('events.handle_duration', duration, { type: eventType });
        
        this.logDebug('Event handled', { 
          type: eventType, 
          duration, 
          correlationId: event.correlationId 
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        this.recordMetric('events.handle_error', 1, { type: eventType });
        this.recordMetric('events.handle_duration', duration, { type: eventType });
        
        this.logError('Event handler failed', error, { 
          type: eventType, 
          correlationId: event.correlationId 
        });

        // Retry logic if enabled
        if (this.eventConfig.retryFailedEvents && (!event.retryCount || event.retryCount < 3)) {
          const retryEvent = {
            ...event,
            retryCount: (event.retryCount || 0) + 1,
          };

          setTimeout(() => {
            this.logInfo('Retrying failed event', { 
              type: eventType, 
              retryCount: retryEvent.retryCount 
            });
            this.eventEmitter.emit(eventType, retryEvent);
          }, Math.pow(2, retryEvent.retryCount) * 1000); // Exponential backoff
        }
      }
    };

    this.eventEmitter.on(eventType, wrappedListener);
    this.logDebug('Event listener registered', { type: eventType });
  }

  /**
   * Subscribe to an event once
   */
  protected once(eventType: string, listener: (event: ServiceEvent) => void | Promise<void>): void {
    if (!this.eventConfig.enabled) {
      return;
    }

    const wrappedListener = async (event: ServiceEvent) => {
      try {
        await listener(event);
        this.recordMetric('events.handled', 1, { type: eventType });
      } catch (error) {
        this.logError('One-time event handler failed', error, { type: eventType });
        this.recordMetric('events.handle_error', 1, { type: eventType });
      }
    };

    this.eventEmitter.once(eventType, wrappedListener);
    this.logDebug('One-time event listener registered', { type: eventType });
  }

  /**
   * Subscribe to all events (wildcard)
   */
  protected onAny(listener: (event: ServiceEvent) => void | Promise<void>): void {
    this.on('*', listener);
  }

  /**
   * Remove event listener
   */
  protected off(eventType: string, listener: Function): void {
    this.eventEmitter.removeListener(eventType, listener);
    this.logDebug('Event listener removed', { type: eventType });
  }

  /**
   * Remove all listeners for an event type
   */
  protected removeAllListeners(eventType?: string): void {
    this.eventEmitter.removeAllListeners(eventType);
    this.logDebug('All event listeners removed', { type: eventType || 'all' });
  }

  /**
   * Get event history for a specific event type
   */
  protected getEventHistory(eventType?: string): ServiceEvent[] {
    if (!eventType) {
      // Return all events
      const allEvents: ServiceEvent[] = [];
      for (const events of this.eventHistory.values()) {
        allEvents.push(...events);
      }
      return allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    return this.eventHistory.get(eventType) || [];
  }

  /**
   * Get event statistics
   */
  protected getEventStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    recentEvents: ServiceEvent[];
    activeListeners: Record<string, number>;
  } {
    const eventsByType: Record<string, number> = {};
    let totalEvents = 0;

    for (const [type, events] of this.eventHistory.entries()) {
      eventsByType[type] = events.length;
      totalEvents += events.length;
    }

    const activeListeners: Record<string, number> = {};
    for (const eventName of this.eventEmitter.eventNames()) {
      activeListeners[eventName.toString()] = this.eventEmitter.listenerCount(eventName);
    }

    return {
      totalEvents,
      eventsByType,
      recentEvents: this.getEventHistory().slice(0, 10),
      activeListeners,
    };
  }

  /**
   * Wait for a specific event to be emitted
   */
  protected waitForEvent(
    eventType: string, 
    timeout: number = 5000,
    predicate?: (event: ServiceEvent) => boolean
  ): Promise<ServiceEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.eventEmitter.removeListener(eventType, eventListener);
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      const eventListener = (event: ServiceEvent) => {
        if (!predicate || predicate(event)) {
          clearTimeout(timeoutId);
          this.eventEmitter.removeListener(eventType, eventListener);
          resolve(event);
        }
      };

      this.eventEmitter.once(eventType, eventListener);
    });
  }

  /**
   * Store event in history
   */
  private storeEventInHistory(event: ServiceEvent): void {
    if (!this.eventHistory.has(event.type)) {
      this.eventHistory.set(event.type, []);
    }

    const events = this.eventHistory.get(event.type)!;
    events.push(event);

    // Keep only the last 100 events per type
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
  }

  /**
   * Clean up old events from history
   */
  private cleanupEventHistory(): void {
    if (!this.eventConfig.eventTtl) {
      return;
    }

    const cutoffTime = new Date(Date.now() - this.eventConfig.eventTtl);
    let cleanedCount = 0;

    for (const [type, events] of this.eventHistory.entries()) {
      const originalLength = events.length;
      const filteredEvents = events.filter(event => event.timestamp > cutoffTime);
      
      if (filteredEvents.length !== originalLength) {
        this.eventHistory.set(type, filteredEvents);
        cleanedCount += originalLength - filteredEvents.length;
      }
    }

    if (cleanedCount > 0) {
      this.logDebug('Cleaned up old events', { cleanedCount });
    }
  }

  /**
   * Generate correlation ID for event tracking
   */
  private generateCorrelationId(): string {
    return `${this.serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enable/disable event emission
   */
  protected setEventsEnabled(enabled: boolean): void {
    this.eventConfig.enabled = enabled;
    this.logInfo(`Event emission ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current event configuration
   */
  protected getEventConfig(): EventEmittingServiceConfig['events'] {
    return { ...this.eventConfig };
  }
}