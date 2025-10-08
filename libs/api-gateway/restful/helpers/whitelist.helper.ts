import { WHITELIST_PATHS } from '../constants/whitelist.constant';

export const isReqUrlInWhitelist = (reqUrl: string, whitelist = WHITELIST_PATHS): boolean => {
    return whitelist.some((path) => reqUrl.startsWith(path));
};
