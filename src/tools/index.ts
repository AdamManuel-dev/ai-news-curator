/**
 * @fileoverview Base tool interfaces and abstract classes for the AI tools system
 * @lastmodified 2025-07-28T00:55:47Z
 * 
 * Features: Tool abstraction, execution interface, inheritance patterns
 * Main APIs: ToolInterface, BaseTool abstract class, execute() method
 * Constraints: All tools must implement execute(), return Promise, accept any args
 * Patterns: Interface segregation, template method, polymorphic execution
 */

export interface ToolInterface {
  execute(...args: any[]): Promise<any>;
}

export abstract class BaseTool implements ToolInterface {
  abstract execute(...args: any[]): Promise<any>;
}
