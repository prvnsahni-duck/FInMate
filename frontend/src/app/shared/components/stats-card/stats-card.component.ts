import { Component, input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-stats-card',
  standalone: true,
  imports: [NgClass],
  templateUrl: './stats-card.component.html'
})
export class StatsCardComponent {
  title = input.required<string>();
  value = input.required<string | number | null>();
  icon = input<string>();
  type = input<'primary' | 'success' | 'error' | 'accent' | 'default'>('default');
}
