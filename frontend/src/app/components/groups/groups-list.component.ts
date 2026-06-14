import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-groups-list',
  imports: [CommonModule, RouterLink],
  templateUrl: './groups-list.component.html'
})
export class GroupsListComponent implements OnInit {
  private http = inject(HttpClient);
  
  groups: any[] = [];
  isLoading = true;

  ngOnInit() {
    this.http.get<any>('/api/groups').subscribe({
      next: (res) => {
        this.groups = res.data;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }
}
