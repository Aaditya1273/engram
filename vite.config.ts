import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Serves /api/* from server/routes.ts inside the Vite dev server, so `npm run dev` is the whole stack. */
function api(): Plugin {
  return {
    name: 'atrium-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/') && req.url !== '/api') return next();
        try {
          const { handle } = (await server.ssrLoadModule('/server/routes.ts')) as typeof import('./server/routes');
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          });
          const response = await handle(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-side secrets (ANTHROPIC_API_KEY, DATABASE_URL, …) from .env, for the dev API only.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [api()],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: { input: { main: 'index.html', companion: 'companion.html' } },
    },
  };
});
