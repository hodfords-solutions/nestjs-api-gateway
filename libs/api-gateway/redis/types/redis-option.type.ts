import { ConnectionOptions } from 'tls';

export type RedisOptionType = {
    host: string;
    port: number;
    db?: number;
    username?: string;
    password?: string;
    /**
     * Enables TLS for the Redis connection.
     * Pass `true` to connect with the default TLS settings, or an object with
     * Node's `tls.connect` options (ca, cert, key, servername, rejectUnauthorized, ...).
     */
    tls?: boolean | ConnectionOptions;
};
