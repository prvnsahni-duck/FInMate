import { Component, input } from '@angular/core';

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <svg
      [class]="className()"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        [attr.d]="path()"
      ></path>
    </svg>
  `,
})
export class IconComponent {
  path = input.required<string>();
  className = input<string>('w-5 h-5');
}
