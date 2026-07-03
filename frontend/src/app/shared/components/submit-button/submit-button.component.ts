import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-submit-button',
  standalone: true,
  template: `
    <button
      type="submit"
      [disabled]="disabled || isLoading"
      [class]="styleClass"
      [attr.data-testid]="testId || null"
    >
      @if (isLoading) {
        <span
          class="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin align-middle"
        ></span>
        <span>{{ loadingLabel }}</span>
      } @else {
        <span>{{ label }}</span>
      }
    </button>
  `,
})
export class SubmitButtonComponent {
  @Input() label = 'Submit';
  @Input() loadingLabel = 'Submitting...';
  @Input() isLoading = false;
  @Input() disabled = false;
  @Input() testId = '';
  @Input() styleClass =
    'w-full py-3 px-4 bg-gradient-neon text-white rounded-xl font-semibold shadow-lg shadow-finmate-neon/30 hover:shadow-finmate-neon/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
}



