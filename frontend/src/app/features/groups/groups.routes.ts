import { Routes } from '@angular/router';
import { GroupsListComponent } from './pages/groups-list/groups-list.component';
import { GroupDetailComponent } from './pages/group-detail/group-detail.component';
import { JoinGroupComponent } from './pages/join-group/join-group.component';

export const groupsRoutes: Routes = [
  { path: '', component: GroupsListComponent },
  { path: 'join/:inviteToken', component: JoinGroupComponent },
  { path: ':id', component: GroupDetailComponent },
];
