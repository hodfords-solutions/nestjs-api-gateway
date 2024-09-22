import { RouterPathType } from './router-path.type';

/**
 * Detail of an endpoint, use to define an endpoint's document in Swagger
 */
export type EndpointDetail = {
    title: string;
    version: string;
    docUrl: string;
    router: RouterPathType;
};
