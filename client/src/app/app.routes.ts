import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/health/health-check.component').then((m) => m.HealthCheckComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
