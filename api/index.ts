import { handle } from '../server/routes';

// Vercel function (Web-standard handler). vercel.json rewrites every /api/* path here.
export default { fetch: handle };
