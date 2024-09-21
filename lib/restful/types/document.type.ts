/**
 * HTTP Operation Type
 */
type OperationType = {
    operationId: string;
    parameters: NodeJS.Dict<any>[];
    responses: NodeJS.Dict<any>;
};

/**
 * Path Type
 */
type PathType = {
    [key in string]: {
        [key in 'get' | 'post' | 'put' | 'patch' | 'delete']: OperationType;
    };
};

/**
 * Document type, use to define APIs' document in Swagger
 */
export type DocumentType = {
    openapi: string;
    paths: PathType;
    info: { title: string; description: string; version: string; contact: NodeJS.Dict<any> };
    tags: { name: string; description: string }[];
    servers: [];
    components: {
        securitySchemes: NodeJS.Dict<any>;
        schemas: NodeJS.Dict<any>;
    };
};
