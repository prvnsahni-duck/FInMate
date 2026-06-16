import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GroupsService } from '../../services/groups.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { Group } from '@finmate/data-models';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, SubmitButtonComponent],
  templateUrl: './groups-list.component.html'
})
export class GroupsListComponent implements OnInit {
  private groupsService = inject(GroupsService);
  private fb = inject(FormBuilder);
  
  groups: Group[] = [];
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
    this.groupsService.getGroups().subscribe({
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

      this.groupsService.createGroup(this.groupForm.value).subscribe({
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
