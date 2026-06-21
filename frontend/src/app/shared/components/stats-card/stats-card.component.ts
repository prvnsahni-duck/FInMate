import { Component, input } from '@angular/core';
import { NgClass } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-stats-card',
  standalone: true,
  imports: [NgClass, IconComponent],
  templateUrl: './stats-card.component.html'
})
export class StatsCardComponent {
  title = input.required<string>();
  value = input.required<string | number | null>();
  icon = input<string>(); // SVG Path string
  type = input<'primary' | 'success' | 'error' | 'accent' | 'default'>('default');
}
