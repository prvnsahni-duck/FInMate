import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-groups-list',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './groups-list.component.html'
})
export class GroupsListComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  
  groups: any[] = [];
  isLoading = true;

  // Modal State
  isModalOpen = false;
  isSubmitting = false;
  errorMessage = '';

  groupForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    visibility: ['private', [Validators.required]],
    currency: ['USD', [Validators.required]],
    groupType: ['normal', [Validators.required]],
    carryForwardEnabled: [false]
  });

  ngOnInit() {
    this.fetchGroups();
  }

  fetchGroups() {
    this.isLoading = true;
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

  openModal() {
    this.isModalOpen = true;
    this.errorMessage = '';
    this.groupForm.reset({
      name: '',
      description: '',
      visibility: 'private',
      currency: 'USD',
      groupType: 'normal',
      carryForwardEnabled: false
    });
  }

  closeModal() {
    this.isModalOpen = false;
    this.errorMessage = '';
  }

  onSubmit() {
    if (this.groupForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';

      this.http.post<any>('/api/groups', this.groupForm.value).subscribe({
        next: () => {
          this.isSubmitting = false;
          this.isModalOpen = false;
          this.fetchGroups();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.errorMessage = err.error?.message || 'Failed to create group. Please try again.';
        }
      });
    }
  }
}
