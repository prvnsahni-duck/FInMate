import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
} from '@angular/core';
import { Observable } from 'rxjs';
import { ConflictDiffModalComponent } from '../components/conflict-diff-modal/conflict-diff-modal.component';
import {
  ConflictContext,
  ConflictResolution,
} from './conflict.types';

@Injectable({ providedIn: 'root' })
export class ConflictModalService {
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);

  /**
   * Dynamically mounts the ConflictDiffModalComponent onto the DOM and returns
   * an Observable that emits exactly once with the user's resolution choice,
   * then completes. The component is destroyed on completion or cancellation.
   */
  open(
    context: ConflictContext<Record<string, unknown>>,
  ): Observable<ConflictResolution<Record<string, unknown>>> {
    return new Observable((subscriber) => {
      const hostElement = document.createElement('div');
      document.body.appendChild(hostElement);

      const componentRef: ComponentRef<ConflictDiffModalComponent<any>> =
        createComponent(ConflictDiffModalComponent, {
          environmentInjector: this.environmentInjector,
          hostElement,
        });

      componentRef.instance.context = context;
      this.appRef.attachView(componentRef.hostView);
      componentRef.changeDetectorRef.detectChanges();

      const sub = componentRef.instance.resolved.subscribe((resolution: any) => {
        subscriber.next(resolution);
        subscriber.complete();
        cleanup();
      });

      const cleanup = (): void => {
        sub.unsubscribe();
        this.appRef.detachView(componentRef.hostView);
        componentRef.destroy();
        hostElement.remove();
      };

      // Teardown logic when the Observable is unsubscribed externally
      return cleanup;
    });
  }
}
