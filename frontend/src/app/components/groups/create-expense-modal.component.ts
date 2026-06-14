import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-create-expense-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-expense-modal.component.html'
})
export class CreateExpenseModalComponent {}
