import { TestBed } from '@angular/core/testing';

import { GameClient } from '../../../services/game-client';
import { stubClient } from '../test-view';
import { FoundChainComponent } from './found-chain';

describe('FoundChainComponent', () => {
  it('founds the chosen chain', () => {
    const { client, sent } = stubClient();
    TestBed.configureTestingModule({
      providers: [{ provide: GameClient, useValue: client }],
    });
    const fixture = TestBed.createComponent(FoundChainComponent);
    fixture.componentRef.setInput('available', [
      'tower',
      'sackson',
    ]);
    TestBed.tick();
    const buttons = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('button');
    expect(buttons).toHaveLength(2);
    buttons[1].click();
    expect(sent).toEqual([
      { type: 'foundChain', chain: 'sackson' },
    ]);
  });
});
