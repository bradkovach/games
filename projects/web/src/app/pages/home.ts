import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
} from '@angular/router';

import type { Me } from '../../shared/protocol';

import { Api } from '../services/api';
import { saveSeat } from '../services/seats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  selector: 'app-home',
  template: `
    <div class="grid-2">
      <section class="panel">
        <h2>Host a game</h2>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        @if (loading()) {
          <p class="muted">Loading…</p>
        } @else if (me(); as me) {
          <p>
            Signed in as <strong>{{ me.name }}</strong
            >.
            <button
              type="button"
              class="secondary"
              (click)="logout()"
            >
              Sign out
            </button>
          </p>
          <p>
            <label
              >Mode
              <select
                [value]="mode()"
                (change)="mode.set($any($event.target).value)"
              >
                <option value="classic">
                  Classic (2 bonuses)
                </option>
                <option value="tycoon">
                  Tycoon (3 bonuses)
                </option>
              </select>
            </label>
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                [checked]="secret()"
                (change)="secret.set(!secret())"
              />
              Keep money and stock secret
            </label>
          </p>
          <button
            type="button"
            [disabled]="busy()"
            (click)="create()"
          >
            Create game
          </button>
        } @else {
          <p>Hosting requires signing in.</p>
          <a href="/auth/login?returnTo=/"
            ><button type="button">Sign in</button></a
          >
        }
      </section>
      <section class="panel">
        <h2>Join a game</h2>
        <p>Scan the host's QR code, or enter the PIN.</p>
        <a routerLink="/join"
          ><button type="button">Enter PIN</button></a
        >
        <h2 style="margin-top: 1.5rem">
          Playing the board game?
        </h2>
        <p>
          Use the <a routerLink="/scoreboard">scoreboard</a> to
          tally final scores and look up prices.
        </p>
      </section>
    </div>
  `,
})
export class HomePage implements OnInit {
  protected readonly busy = signal(false);
  protected readonly error = signal<null | string>(null);
  protected readonly loading = signal(true);
  protected readonly me = signal<Me | null>(null);
  protected readonly mode = signal<'classic' | 'tycoon'>(
    'classic',
  );
  protected readonly secret = signal(false);
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  async create(): Promise<void> {
    this.busy.set(true);
    try {
      const grant = await this.api.createGame({
        mode: this.mode(),
        secretHoldings: this.secret(),
      });
      saveSeat(grant);
      await this.router.navigate(['/game', grant.gameId]);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.me.set(null);
  }

  async ngOnInit(): Promise<void> {
    this.error.set(
      this.route.snapshot.queryParamMap.get('error'),
    );
    this.me.set(await this.api.me());
    this.loading.set(false);
  }
}
