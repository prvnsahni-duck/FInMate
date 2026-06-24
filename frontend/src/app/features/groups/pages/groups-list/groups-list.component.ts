import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GroupsService } from '../../services/groups.service';
import { SubmitButtonComponent } from '../../../../shared/components/submit-button/submit-button.component';
import { CreateGroupDto, Group } from '@finmate/data-models';
import { DropdownComponent, DropdownOption } from '../../../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, SubmitButtonComponent, DropdownComponent],
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

  visibilityOptions: DropdownOption[] = [
    { value: 'private', label: 'Private (Only invited members)' },
    { value: 'invite_only', label: 'Invite Only (Request to join)' },
    { value: 'public_readonly', label: 'Public Read-Only (Anyone can view)' }
  ];

  currencyOptions: DropdownOption[] = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'INR', label: 'INR (₹)' },
    { value: 'EUR', label: 'EUR (€)' }
  ];

  groupTypeOptions: DropdownOption[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'household', label: 'Household' }
  ];

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

      const value = this.groupForm.getRawValue();
      const payload: CreateGroupDto = {
        name: value.name ?? '',
        description: value.description ?? undefined,
        visibility: (value.visibility ?? 'private') as CreateGroupDto['visibility'],
        currency: value.currency ?? 'USD',
        groupType: (value.groupType ?? 'normal') as CreateGroupDto['groupType'],
        carryForwardEnabled: value.carryForwardEnabled ?? false,
      };

      this.groupsService.createGroup(payload).subscribe({
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
