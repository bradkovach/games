import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'scoreboard', renderMode: RenderMode.Prerender },
  // Everything else depends on the session or a live socket.
  { path: '**', renderMode: RenderMode.Client },
];
