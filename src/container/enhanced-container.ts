/**
 * @fileoverview Enhanced dependency injection container with lifecycle management
 *
 * Provides advanced features like circular dependency detection, lifecycle hooks,
 * scoped instances, and container introspection for better debugging.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import 'reflect-metadata';
import logger from '@utils/logger';

// Type definitions
type Constructor<T = object> = new (...args: unknown[]) => T;
type Factory<T = unknown> = () => T | Promise<T>;
type Disposable = { dispose?(): void | Promise<void> };

// Service lifecycle phases
export enum ServiceLifecycle {
  CREATING = 'creating',
  CREATED = 'created',
  INITIALIZING = 'initializing',
  READY = 'ready',
  DISPOSING = 'disposing',
  DISPOSED = 'disposed',
}

// Service scope types
export enum ServiceScope {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient',
  SCOPED = 'scoped',
}

// Service metadata interface
export interface ServiceMetadata {
  scope: ServiceScope;
  factory?: Factory;
  dependencies?: symbol[];
  lifecycle?: ServiceLifecycle;
  tags?: string[];
  initMethod?: string;
  disposeMethod?: string;
  created?: Date;
  description?: string;
}

// Service registration interface
interface ServiceRegistration {
  token: symbol;
  implementation: Constructor | Factory;
  metadata: ServiceMetadata;
  instance?: unknown;
  scopedInstances?: Map<string, unknown>;
}

// Container configuration
interface ContainerConfig {
  enableCircularDependencyDetection: boolean;
  enableLifecycleLogging: boolean;
  maxRecursionDepth: number;
  enableMetrics: boolean;
}

// Container metrics
interface ContainerMetrics {
  totalRegistrations: number;
  totalResolutions: number;
  circularDependenciesDetected: number;
  avgResolutionTime: number;
  errorCount: number;
}

/**
 * Enhanced dependency injection container
 */
export class EnhancedContainer {
  private services = new Map<symbol, ServiceRegistration>();

  private resolutionStack: symbol[] = [];

  private scopeStack: string[] = ['default'];

  private static instance: EnhancedContainer;

  private config: ContainerConfig;

  private metrics: ContainerMetrics;

  constructor(config: Partial<ContainerConfig> = {}) {
    this.config = {
      enableCircularDependencyDetection: true,
      enableLifecycleLogging: true,
      maxRecursionDepth: 20,
      enableMetrics: true,
      ...config,
    };

    this.metrics = {
      totalRegistrations: 0,
      totalResolutions: 0,
      circularDependenciesDetected: 0,
      avgResolutionTime: 0,
      errorCount: 0,
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): EnhancedContainer {
    if (!EnhancedContainer.instance) {
      EnhancedContainer.instance = new EnhancedContainer();
    }
    return EnhancedContainer.instance;
  }

  /**
   * Register a singleton service
   */
  public registerSingleton<T>(
    token: symbol,
    implementation: Constructor<T>,
    options: Partial<ServiceMetadata> = {}
  ): this {
    return this.register(token, implementation, ServiceScope.SINGLETON, options);
  }

  /**
   * Register a transient service
   */
  public registerTransient<T>(
    token: symbol,
    implementation: Constructor<T>,
    options: Partial<ServiceMetadata> = {}
  ): this {
    return this.register(token, implementation, ServiceScope.TRANSIENT, options);
  }

  /**
   * Register a scoped service
   */
  public registerScoped<T>(
    token: symbol,
    implementation: Constructor<T>,
    options: Partial<ServiceMetadata> = {}
  ): this {
    return this.register(token, implementation, ServiceScope.SCOPED, options);
  }

  /**
   * Register a factory function
   */
  public registerFactory<T>(
    token: symbol,
    factory: Factory<T>,
    scope: ServiceScope = ServiceScope.SINGLETON,
    options: Partial<ServiceMetadata> = {}
  ): this {
    const metadata: ServiceMetadata = {
      scope,
      factory,
      created: new Date(),
      lifecycle: ServiceLifecycle.READY,
      ...options,
    };

    this.services.set(token, {
      token,
      implementation: factory,
      metadata,
    });

    this.metrics.totalRegistrations++;
    this.logLifecycle(token, ServiceLifecycle.CREATED, metadata);

    return this;
  }

  /**
   * Register an instance directly
   */
  public registerInstance<T>(token: symbol, instance: T, tags: string[] = []): this {
    const metadata: ServiceMetadata = {
      scope: ServiceScope.SINGLETON,
      lifecycle: ServiceLifecycle.READY,
      created: new Date(),
      tags,
    };

    this.services.set(token, {
      token,
      implementation: () => instance,
      metadata,
      instance,
    });

    this.metrics.totalRegistrations++;
    this.logLifecycle(token, ServiceLifecycle.CREATED, metadata);

    return this;
  }

  /**
   * Resolve a service
   */
  public resolve<T>(token: symbol, scope?: string): T {
    const startTime = Date.now();

    try {
      const result = this.resolveInternal<T>(token, scope);

      // Update metrics
      if (this.config.enableMetrics) {
        this.metrics.totalResolutions++;
        const resolutionTime = Date.now() - startTime;
        this.metrics.avgResolutionTime =
          (this.metrics.avgResolutionTime * (this.metrics.totalResolutions - 1) + resolutionTime) /
          this.metrics.totalResolutions;
      }

      return result;
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Service resolution failed', {
        token: token.toString(),
        error: error instanceof Error ? error.message : String(error),
        resolutionStack: this.resolutionStack.map((t) => t.toString()),
      });
      throw error;
    }
  }

  /**
   * Internal resolution logic
   */
  private resolveInternal<T>(token: symbol, scope?: string): T {
    const registration = this.services.get(token);

    if (!registration) {
      throw new Error(`Service not registered: ${token.toString()}`);
    }

    // Circular dependency detection
    if (this.config.enableCircularDependencyDetection) {
      if (this.resolutionStack.includes(token)) {
        this.metrics.circularDependenciesDetected++;
        const cycle = [...this.resolutionStack, token].map((t) => t.toString()).join(' -> ');
        throw new Error(`Circular dependency detected: ${cycle}`);
      }

      if (this.resolutionStack.length > this.config.maxRecursionDepth) {
        throw new Error(`Maximum recursion depth exceeded: ${this.config.maxRecursionDepth}`);
      }
    }

    this.resolutionStack.push(token);

    try {
      return this.createInstance<T>(registration, scope);
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Create service instance based on scope
   */
  private createInstance<T>(registration: ServiceRegistration, scope?: string): T {
    const { metadata, instance } = registration;
    const currentScope = scope || this.getCurrentScope();

    // Return cached instance for singletons
    if (metadata.scope === ServiceScope.SINGLETON && instance) {
      return instance as T;
    }

    // Handle scoped instances
    if (metadata.scope === ServiceScope.SCOPED) {
      if (!registration.scopedInstances) {
        registration.scopedInstances = new Map();
      }

      const cachedInstance = registration.scopedInstances.get(currentScope);
      if (cachedInstance) {
        return cachedInstance as T;
      }
    }

    // Create new instance
    const newInstance = this.instantiate<T>(registration);

    // Cache instance based on scope
    if (metadata.scope === ServiceScope.SINGLETON) {
      registration.instance = newInstance;
    } else if (metadata.scope === ServiceScope.SCOPED) {
      registration.scopedInstances!.set(currentScope, newInstance);
    }

    // Call initialization method if specified
    if (metadata.initMethod && typeof (newInstance as any)[metadata.initMethod] === 'function') {
      (newInstance as any)[metadata.initMethod]();
    }

    return newInstance;
  }

  /**
   * Instantiate service
   */
  private instantiate<T>(registration: ServiceRegistration): T {
    const { implementation, metadata } = registration;

    this.updateLifecycle(registration, ServiceLifecycle.CREATING);

    let instance: T;

    // Handle factory functions
    if (metadata.factory || (typeof implementation === 'function' && implementation.length === 0)) {
      const factory = metadata.factory || (implementation as Factory<T>);
      const result = factory();

      // Handle async factories
      if (result instanceof Promise) {
        throw new Error('Async factories not supported in synchronous resolution');
      }

      instance = result as T;
    } else {
      // Handle constructor-based services
      const Constructor = implementation as Constructor<T>;
      const dependencies = metadata.dependencies || [];

      // Resolve dependencies recursively
      const resolvedDependencies = dependencies.map((dep) => this.resolve(dep));
      instance = new Constructor(...resolvedDependencies);
    }

    this.updateLifecycle(registration, ServiceLifecycle.CREATED);

    return instance;
  }

  /**
   * Register a service with full options
   */
  private register<T>(
    token: symbol,
    implementation: Constructor<T>,
    scope: ServiceScope,
    options: Partial<ServiceMetadata>
  ): this {
    const metadata: ServiceMetadata = {
      scope,
      dependencies: this.extractDependencies(implementation),
      created: new Date(),
      lifecycle: ServiceLifecycle.CREATED,
      ...options,
    };

    this.services.set(token, {
      token,
      implementation,
      metadata,
    });

    this.metrics.totalRegistrations++;
    this.logLifecycle(token, ServiceLifecycle.CREATED, metadata);

    return this;
  }

  /**
   * Extract dependencies from constructor using reflection
   */
  private extractDependencies(constructor: Constructor): symbol[] {
    const paramTypes = Reflect.getMetadata('design:paramtypes', constructor) || [];
    return paramTypes.filter((type: unknown) => typeof type === 'symbol');
  }

  /**
   * Update service lifecycle
   */
  private updateLifecycle(registration: ServiceRegistration, lifecycle: ServiceLifecycle): void {
    registration.metadata.lifecycle = lifecycle;
    this.logLifecycle(registration.token, lifecycle, registration.metadata);
  }

  /**
   * Log lifecycle events
   */
  private logLifecycle(
    token: symbol,
    lifecycle: ServiceLifecycle,
    metadata: ServiceMetadata
  ): void {
    if (this.config.enableLifecycleLogging) {
      logger.debug('Service lifecycle event', {
        service: token.toString(),
        lifecycle,
        scope: metadata.scope,
        description: metadata.description,
      });
    }
  }

  /**
   * Get current scope
   */
  private getCurrentScope(): string {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  /**
   * Create a new scope
   */
  public createScope(name: string): () => void {
    this.scopeStack.push(name);

    return () => {
      this.disposeScopedServices(name);
      this.scopeStack.pop();
    };
  }

  /**
   * Dispose scoped services
   */
  private disposeScopedServices(scope: string): void {
    for (const registration of this.services.values()) {
      if (registration.scopedInstances) {
        const instance = registration.scopedInstances.get(scope);
        if (instance) {
          this.disposeInstance(instance, registration.metadata);
          registration.scopedInstances.delete(scope);
        }
      }
    }
  }

  /**
   * Dispose an instance
   */
  private disposeInstance(instance: unknown, metadata: ServiceMetadata): void {
    try {
      // Call dispose method if specified
      if (
        metadata.disposeMethod &&
        typeof (instance as any)[metadata.disposeMethod] === 'function'
      ) {
        (instance as any)[metadata.disposeMethod]();
      }

      // Call dispose if instance implements Disposable
      if (instance && typeof (instance as Disposable).dispose === 'function') {
        (instance as Disposable).dispose!();
      }
    } catch (error) {
      logger.error('Error disposing service instance', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if service is registered
   */
  public isRegistered(token: symbol): boolean {
    return this.services.has(token);
  }

  /**
   * Get service metadata
   */
  public getMetadata(token: symbol): ServiceMetadata | undefined {
    return this.services.get(token)?.metadata;
  }

  /**
   * Get services by tag
   */
  public getServicesByTag(tag: string): symbol[] {
    const result: symbol[] = [];

    for (const [token, registration] of this.services.entries()) {
      if (registration.metadata.tags?.includes(tag)) {
        result.push(token);
      }
    }

    return result;
  }

  /**
   * Get container metrics
   */
  public getMetrics(): ContainerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get all registered services
   */
  public getAllServices(): Array<{ token: symbol; metadata: ServiceMetadata }> {
    return Array.from(this.services.entries()).map(([token, registration]) => ({
      token,
      metadata: registration.metadata,
    }));
  }

  /**
   * Dispose all services and clear container
   */
  public dispose(): void {
    // Dispose all singleton instances
    for (const registration of this.services.values()) {
      if (registration.instance) {
        this.disposeInstance(registration.instance, registration.metadata);
      }

      // Dispose all scoped instances
      if (registration.scopedInstances) {
        for (const instance of registration.scopedInstances.values()) {
          this.disposeInstance(instance, registration.metadata);
        }
      }
    }

    this.services.clear();
    this.resolutionStack = [];
    this.scopeStack = ['default'];

    logger.info('Container disposed', {
      metrics: this.metrics,
    });
  }

  /**
   * Validate container configuration
   */
  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for unresolvable dependencies
    for (const [token, registration] of this.services.entries()) {
      if (registration.metadata.dependencies) {
        for (const dep of registration.metadata.dependencies) {
          if (!this.isRegistered(dep)) {
            errors.push(
              `Service ${token.toString()} depends on unregistered service ${dep.toString()}`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const enhancedContainer = EnhancedContainer.getInstance();

// Enhanced decorators
export function EnhancedService(
  token: symbol,
  options: {
    scope?: ServiceScope;
    dependencies?: symbol[];
    tags?: string[];
    description?: string;
  } = {}
) {
  return function <T extends Constructor>(constructor: T) {
    const container = EnhancedContainer.getInstance();

    if (options.scope === ServiceScope.TRANSIENT) {
      container.registerTransient(token, constructor, options);
    } else if (options.scope === ServiceScope.SCOPED) {
      container.registerScoped(token, constructor, options);
    } else {
      container.registerSingleton(token, constructor, options);
    }

    return constructor;
  };
}
