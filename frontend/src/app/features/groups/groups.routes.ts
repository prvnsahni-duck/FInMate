import { Routes } from '@angular/router';
import { GroupsListComponent } from './pages/groups-list/groups-list.component';
import { GroupDetailComponent } from './pages/group-detail/group-detail.component';

export const groupsRoutes: Routes = [
  { path: '', component: GroupsListComponent },
  { path: ':id', component: GroupDetailComponent }
];
