import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

import {
  type ThemePreference,
  ThemeService,
} from './services/theme';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  /** Routes with `data.frame` fill the viewport without scrolling. */
  protected readonly frame = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => isFrame(this.router.routerState.snapshot.root)),
    ),
    { initialValue: false },
  );
  protected readonly theme = inject(ThemeService);

  protected setTheme(event: Event): void {
    this.theme.preference.set(
      (event.target as HTMLSelectElement)
        .value as ThemePreference,
    );
  }
}

function isFrame(route: ActivatedRouteSnapshot): boolean {
  let deepest = route;
  while (deepest.firstChild) deepest = deepest.firstChild;
  return deepest.data['frame'] === true;
}
