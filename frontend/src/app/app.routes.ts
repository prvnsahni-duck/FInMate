import { Route } from '@angular/router';
import { AuthLayoutComponent } from './components/layouts/auth-layout.component';
import { MainLayoutComponent } from './components/layouts/main-layout.component';
import { LoginComponent } from './components/auth/login.component';
import { RegisterComponent } from './components/auth/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { GroupsListComponent } from './components/groups/groups-list.component';
import { GroupDetailComponent } from './components/groups/group-detail.component';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'groups', component: GroupsListComponent },
      { path: 'groups/:id', component: GroupDetailComponent },
    ]
  },
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
    ]
  },
  { path: '**', redirectTo: '' }
];
