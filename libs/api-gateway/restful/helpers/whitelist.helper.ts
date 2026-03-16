import { WHITELIST_PATHS } from '../constants/whitelist.constant';

export const isReqUrlInWhitelist = (reqUrl: string, whitelist: string[]): boolean => {
    if (!whitelist.length) {
        whitelist = WHITELIST_PATHS;
    }
    return whitelist.some((path) => reqUrl.startsWith(path));
};
