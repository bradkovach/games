import { TestBed } from '@angular/core/testing';

import { GameClient } from '../../../services/game-client';
import { stubClient } from '../test-view';
import { ChooseAcquiredComponent } from './choose-acquired';

describe('ChooseAcquiredComponent', () => {
  it('chooses the chain acquired next', () => {
    const { client, sent } = stubClient();
    TestBed.configureTestingModule({
      providers: [{ provide: GameClient, useValue: client }],
    });
    const fixture = TestBed.createComponent(
      ChooseAcquiredComponent,
    );
    fixture.componentRef.setInput('candidates', [
      'tower',
      'festival',
    ]);
    TestBed.tick();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.chain-tower')!
      .click();
    expect(sent).toEqual([
      { type: 'chooseAcquired', chain: 'tower' },
    ]);
  });
});
