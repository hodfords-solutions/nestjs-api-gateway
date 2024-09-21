import { kebabConvertKeys } from '../helpers/object.helper';

export class ProxyRequest {
    headers: { [key: string]: string };

    addHeader(key: string, value: string): void {
        this.headers[key] = value;
    }

    addHeaders(headers: { [key: string]: string }): void {
        this.headers = { ...this.headers, ...headers };
    }

    getKebabHeaders(): NodeJS.Dict<string> {
        return kebabConvertKeys<NodeJS.Dict<string>>(this.headers);
    }
}
