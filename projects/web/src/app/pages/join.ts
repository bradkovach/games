import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Api } from '../services/api';
import { saveSeat } from '../services/seats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-join',
  template: `
    <section class="panel" style="max-width: 28rem">
      <h2>Join game</h2>
      <form (submit)="join($event)">
        @if (!token) {
          <p>
            <label
              >PIN
              <input
                name="pin"
                inputmode="numeric"
                autocomplete="off"
                placeholder="123-456-789"
                [value]="pin()"
                (input)="pin.set($any($event.target).value)"
              />
            </label>
          </p>
        } @else {
          <p class="muted">Invite link detected.</p>
        }
        <p>
          <label
            >Your name
            <input
              name="name"
              maxlength="40"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
          </label>
        </p>
        <button
          type="submit"
          [disabled]="busy() || !name().trim()"
        >
          Join
        </button>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </section>
  `,
})
export class JoinPage {
  protected readonly busy = signal(false);
  protected readonly error = signal<null | string>(null);
  protected readonly name = signal('');
  protected readonly pin = signal('');
  protected readonly token =
    inject(ActivatedRoute).snapshot.queryParamMap.get('t');
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  async join(event: Event): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    try {
      const grant = await this.api.join(
        this.token ?? this.pin(),
        this.name(),
      );
      saveSeat(grant);
      await this.router.navigate(['/game', grant.gameId]);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
