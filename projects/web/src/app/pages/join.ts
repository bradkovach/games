import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AvatarPickerComponent } from '../components/avatar-picker';
import { Api } from '../services/api';
import { saveSeat } from '../services/seats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarPickerComponent],
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
                (change)="loadTaken()"
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
        <p>Your mascot</p>
        <app-avatar-picker
          [(value)]="avatar"
          [taken]="taken()"
        />
        <p class="muted">
          Leave it blank to get one assigned; you can change it
          in the lobby.
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
export class JoinPage implements OnInit {
  protected readonly avatar = signal<null | string>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<null | string>(null);
  protected readonly name = signal('');
  protected readonly pin = signal('');
  protected readonly taken = signal<string[]>([]);
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
        this.avatar() ?? undefined,
      );
      saveSeat(grant);
      await this.router.navigate(['/game', grant.gameId]);
    } catch (error) {
      this.error.set((error as Error).message);
      void this.loadTaken();
    } finally {
      this.busy.set(false);
    }
  }

  /** Greys out mascots other players already picked. */
  async loadTaken(): Promise<void> {
    const code = this.token ?? this.pin();
    if (!code.trim()) return;
    try {
      const { taken } = await this.api.avatarsTaken(code);
      this.taken.set(taken);
      if (taken.includes(this.avatar() ?? ''))
        this.avatar.set(null);
    } catch {
      this.taken.set([]);
    }
  }

  ngOnInit(): void {
    if (this.token) void this.loadTaken();
  }
}
