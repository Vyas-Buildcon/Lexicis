// Vercel Function for every /api route. The Express API is bundled by `npm run build`
// into build/vercel-handler.cjs (see server/vercel.ts).
import bundled from '../build/vercel-handler.cjs';

export default bundled.default || bundled;
