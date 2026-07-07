import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CryptoBootstrapService } from './core/services/crypto-bootstrap.service';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  private cryptoBootstrap = inject(CryptoBootstrapService);
}
