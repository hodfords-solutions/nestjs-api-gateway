import { DynamicModule, Module } from '@nestjs/common';
import { McpOption } from './types/mcp-option.type';
import { MCP_OPTION } from './constants/mcp.constant';
import { McpToolRegistryService } from './services/mcp-tool-registry.service';
import { McpServerService } from './services/mcp-server.service';
import { McpToolExecutorService } from './services/mcp-tool-executor.service';
import { McpController } from './controllers/mcp.controller';

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
