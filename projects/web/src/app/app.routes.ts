import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    loadComponent: () =>
      import('./pages/home').then((m) => m.HomePage),
    path: '',
    title: 'Acquire',
  },
  {
    loadComponent: () =>
      import('./pages/join').then((m) => m.JoinPage),
    path: 'join',
    title: 'Join game · Acquire',
  },
  {
    loadComponent: () =>
      import('./pages/scoreboard').then((m) => m.ScoreboardPage),
    path: 'scoreboard',
    title: 'Scoreboard · Acquire',
  },
  {
    data: { frame: true },
    loadComponent: () =>
      import('./pages/spectator').then((m) => m.SpectatorPage),
    path: 'game/:id/watch',
    title: 'Board · Acquire',
  },
  // Links shared before the board moved to /watch.
  { path: 'game/:id/board', redirectTo: 'game/:id/watch' },
  {
    data: { frame: true },
    loadComponent: () =>
      import('./pages/game').then((m) => m.GamePage),
    path: 'game/:id/play',
    title: 'Game · Acquire',
  },
  {
    loadComponent: () =>
      import('./pages/lobby').then((m) => m.LobbyPage),
    path: 'game/:id',
    title: 'Lobby · Acquire',
  },
  { path: '**', redirectTo: '' },
];
