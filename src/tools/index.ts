export interface ToolInterface {
  execute(...args: any[]): Promise<any>;
}

export abstract class BaseTool implements ToolInterface {
  abstract execute(...args: any[]): Promise<any>;
}
