import { DynamicModule, Module } from '@nestjs/common';
import { McpOption } from './types/mcp-option.type.js';
import { MCP_OPTION } from './constants/mcp.constant.js';
import { McpToolRegistryService } from './services/mcp-tool-registry.service.js';
import { McpServerService } from './services/mcp-server.service.js';
import { McpToolExecutorService } from './services/mcp-tool-executor.service.js';
import { McpController } from './controllers/mcp.controller.js';

@Module({})
export class McpModule {
    static forRoot(options: McpOption): DynamicModule {
        return {
            global: true,
            module: McpModule,
            controllers: [McpController],
            providers: [
                {
                    provide: MCP_OPTION,
                    useValue: options
                },
                McpToolRegistryService,
                McpToolExecutorService,
                McpServerService
            ],
            exports: [
                {
                    provide: MCP_OPTION,
                    useValue: options
                },
                McpToolRegistryService,
                McpToolExecutorService,
                McpServerService
            ]
        };
    }
}
