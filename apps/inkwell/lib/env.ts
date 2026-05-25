const url = new URL(import.meta.env.WXT_WEB_APP_URL ?? 'http://localhost:3000');

export const WEB_APP_URL: string = url.origin;

// Match patterns forbid ports in the hostname (and ignore them when matching).
export const WEB_APP_MATCH_PATTERN: string = `${url.protocol}//${url.hostname}/*`;
