import {AsyncLocalStorage} from 'node:async_hooks';

export const mcpAuthContext = new AsyncLocalStorage<{ userid: string }>();