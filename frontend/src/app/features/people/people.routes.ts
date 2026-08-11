import { Routes } from '@angular/router';

export const peopleRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/people-dashboard/people-dashboard.component').then(
        (m) => m.PeopleDashboardComponent,
      ),
  },
  {
    path: 'all',
    loadComponent: () =>
      import('./pages/people-list/people-list.component').then(
        (m) => m.PeopleListComponent,
      ),
  },
  {
    path: ':userId',
    loadComponent: () =>
      import('./pages/person-detail/person-detail.component').then(
        (m) => m.PersonDetailComponent,
      ),
  },
];
