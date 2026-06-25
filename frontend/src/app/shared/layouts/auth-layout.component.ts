import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { APP_NAME } from '../../core/constants/app.constants';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './auth-layout.component.html',
})
export class AuthLayoutComponent {
  appName = APP_NAME;
}
