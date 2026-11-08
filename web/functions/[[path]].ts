import { handleWeb, type WebEnv } from '../../src/web/handler';

// All routes live in src/web/handler.ts so they can be tested without Pages.
export const onRequest: PagesFunction<WebEnv> = (ctx) => handleWeb(ctx.request, ctx.env);
