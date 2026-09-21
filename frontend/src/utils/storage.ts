/**
 * Namespaced browser storage.
 *
 * The DEV deployment is served from the same origin as production (under
 * /dev), so localStorage is shared. Without a namespace the two would
 * overwrite each other's login token and — worse — a DEV backup of unsaved
 * boxes could be restored into the production recording of the same id.
 * PUBLIC_URL is "" in production and "/dev" in the DEV build.
 */
const PREFIX = process.env.PUBLIC_URL
  ? `${process.env.PUBLIC_URL.replace(/[^a-zA-Z0-9]/g, "")}:`
  : "";

export const storageKey = (name: string): string => `${PREFIX}${name}`;

export const TOKEN_KEY = storageKey("token");
export const USER_KEY = storageKey("user");
