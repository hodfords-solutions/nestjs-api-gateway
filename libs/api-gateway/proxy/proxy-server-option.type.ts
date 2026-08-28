import { Request } from 'express';
import { ServerResponse } from 'node:http';
import { Dispatcher, Pool } from 'undici';
import ResponseData = Dispatcher.ResponseData;

export type ProxyServerOptions = {
    host: string;
    enableWs?: boolean;
    pool: Pool.Options;
    errorHandler?: (err: Error, req: Request, res: ServerResponse) => void;
    responseHandler?: (proxyResponse: ResponseData, req: Request, requestResponse: ServerResponse) => void;
    rewritePath?: (req: Request) => string;
};
