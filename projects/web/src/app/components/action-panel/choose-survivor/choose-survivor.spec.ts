import { TestBed } from '@angular/core/testing';

import { GameClient } from '../../../services/game-client';
import { stubClient } from '../test-view';
import { ChooseSurvivorComponent } from './choose-survivor';

describe('ChooseSurvivorComponent', () => {
  it('chooses the surviving chain', () => {
    const { client, sent } = stubClient();
    TestBed.configureTestingModule({
      providers: [{ provide: GameClient, useValue: client }],
    });
    const fixture = TestBed.createComponent(
      ChooseSurvivorComponent,
    );
    fixture.componentRef.setInput('candidates', [
      'tower',
      'festival',
    ]);
    TestBed.tick();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.chain-festival')!
      .click();
    expect(sent).toEqual([
      { type: 'chooseSurvivor', chain: 'festival' },
    ]);
  });
});
