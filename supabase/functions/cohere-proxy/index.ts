import { handle } from './handler.js';

Deno.serve((req: Request) => handle(req, { env: (k: string) => Deno.env.get(k), fetch }));
