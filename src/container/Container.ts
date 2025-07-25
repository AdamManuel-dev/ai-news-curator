import 'reflect-metadata';

// Type for constructor functions
type Constructor<T = {}> = new (...args: any[]) => T;

// Service metadata
interface ServiceMetadata {
  singleton: boolean;
  factory?: () => any;
  dependencies?: symbol[];
}

// Service registry
interface ServiceRegistry {
  [key: symbol]: {
    implementation: Constructor<any> | (() => any);
    metadata: ServiceMetadata;
    instance?: any;
  };
}

export class Container {
  private services: ServiceRegistry = {};

  private static instance: Container;

  // Singleton pattern for global container access
  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  // Register a service as singleton
  public registerSingleton<T>(
    token: symbol,
    implementation: Constructor<T>,
    dependencies: symbol[] = []
  ): void {
    this.services[token] = {
      implementation,
      metadata: {
        singleton: true,
        dependencies,
      },
    };
  }

  // Register a service as transient (new instance each time)
  public registerTransient<T>(
    token: symbol,
    implementation: Constructor<T>,
    dependencies: symbol[] = []
  ): void {
    this.services[token] = {
      implementation,
      metadata: {
        singleton: false,
        dependencies,
      },
    };
  }

  // Register a factory function
  public registerFactory<T>(token: symbol, factory: () => T, singleton: boolean = true): void {
    this.services[token] = {
      implementation: factory,
      metadata: {
        singleton,
        factory,
      },
    };
  }

  // Register an instance directly
  public registerInstance<T>(token: symbol, instance: T): void {
    this.services[token] = {
      implementation: () => instance,
      metadata: {
        singleton: true,
        factory: () => instance,
      },
      instance,
    };
  }

  // Resolve a service
  public resolve<T>(token: symbol): T {
    const service = this.services[token];

    if (!service) {
      throw new Error(`Service not registered: ${token.toString()}`);
    }

    // Return cached instance for singletons
    if (service.metadata.singleton && service.instance) {
      return service.instance;
    }

    let instance: T;

    // Handle factory functions
    if (service.metadata.factory) {
      instance = service.metadata.factory();
    } else {
      // Handle constructor-based services
      const Constructor = service.implementation as Constructor<T>;
      const dependencies = service.metadata.dependencies || [];

      // Resolve dependencies recursively
      const resolvedDependencies = dependencies.map((dep) => this.resolve(dep));

      instance = new Constructor(...resolvedDependencies);
    }

    // Cache instance for singletons
    if (service.metadata.singleton) {
      service.instance = instance;
    }

    return instance;
  }

  // Check if a service is registered
  public isRegistered(token: symbol): boolean {
    return token in this.services;
  }

  // Clear all services (useful for testing)
  public clear(): void {
    this.services = {};
  }

  // Get all registered service tokens
  public getRegisteredTokens(): symbol[] {
    return Object.getOwnPropertySymbols(this.services);
  }
}

// Service decorator for automatic registration
export function Service(token: symbol, dependencies: symbol[] = []) {
  return function <T extends Constructor>(constructor: T) {
    const container = Container.getInstance();
    container.registerSingleton(token, constructor, dependencies);
    return constructor;
  };
}

// Injectable decorator to mark classes as injectable
export function Injectable<T extends Constructor>(constructor: T): T {
  // Mark the class as injectable
  Reflect.defineMetadata('injectable', true, constructor);
  return constructor;
}

// Inject decorator for dependency injection
export function Inject(token: symbol) {
  return function (target: any, _propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingTokens = Reflect.getMetadata('design:paramtypes', target) || [];
    existingTokens[parameterIndex] = token;
    Reflect.defineMetadata('design:paramtypes', existingTokens, target);
  };
}

// Export default container instance
export const container = Container.getInstance();
