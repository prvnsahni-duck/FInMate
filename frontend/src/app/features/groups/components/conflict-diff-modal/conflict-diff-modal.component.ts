import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal,
  computed,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConflictContext, ConflictResolution } from '../../../../shared/models/conflict.types';

type ResolutionStrategy = 'keep-mine' | 'keep-theirs' | 'manual';

interface DiffLine {
  text: string;
  type: 'same' | 'added' | 'removed';
}

@Component({
  selector: 'app-conflict-diff-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './conflict-diff-modal.component.html',
  styleUrl: './conflict-diff-modal.component.scss',
})
export class ConflictDiffModalComponent<T extends Record<string, unknown>> implements OnInit {
  @Input({ required: true }) context!: ConflictContext<T>;
  @Output() resolved = new EventEmitter<ConflictResolution<T>>();

  readonly activeStrategy = signal<ResolutionStrategy | null>(null);
  manualText = signal<string>('');

  /** The single overlapping field being displayed (first one if multiple). */
  readonly primaryField = computed(() => this.context.overlappingFields[0] ?? '');

  readonly localValue = computed(() =>
    String(this.context.localPayload[this.primaryField()] ?? ''),
  );

  readonly serverValue = computed(() =>
    String(this.context.serverState[this.primaryField()] ?? ''),
  );

  /** Character-level diff lines for the local panel. */
  readonly localDiffLines = computed<DiffLine[]>(() =>
    this._computeDiff(this.localValue(), this.serverValue(), 'local'),
  );

  /** Character-level diff lines for the server panel. */
  readonly serverDiffLines = computed<DiffLine[]>(() =>
    this._computeDiff(this.localValue(), this.serverValue(), 'server'),
  );

  ngOnInit(): void {
    this.manualText.set(this.localValue());
  }

  selectStrategy(strategy: ResolutionStrategy): void {
    this.activeStrategy.set(strategy);
    if (strategy === 'manual') {
      this.manualText.set(this.localValue());
    }
  }

  confirm(): void {
    const strategy = this.activeStrategy();
    if (!strategy) return;

    const newVersion = (this.context.serverState['version'] as number) ?? 1;

    if (strategy === 'keep-mine') {
      const mergedPayload = {
        ...this.context.localPayload,
        version: newVersion,
      };
      this.resolved.emit({ strategy: 'keep-mine', mergedPayload, newVersion });
    } else if (strategy === 'keep-theirs') {
      const mergedPayload = {
        version: newVersion,
      } as unknown as Partial<T>;
      this.resolved.emit({ strategy: 'keep-theirs', mergedPayload, newVersion });
    } else {
      const field = this.primaryField() as keyof T;
      const mergedPayload = {
        ...this.context.localPayload,
        [field]: this.manualText(),
        version: newVersion,
      };
      this.resolved.emit({ strategy: 'manual', mergedPayload, newVersion });
    }
  }

  cancel(): void {
    this.resolved.emit({ strategy: 'cancelled' });
  }

  private _computeDiff(
    local: string,
    server: string,
    side: 'local' | 'server',
  ): DiffLine[] {
    const localLines = local.split('\n');
    const serverLines = server.split('\n');

    const result: DiffLine[] = [];
    const maxLen = Math.max(localLines.length, serverLines.length);

    for (let i = 0; i < maxLen; i++) {
      const localLine = localLines[i] ?? '';
      const serverLine = serverLines[i] ?? '';

      if (localLine === serverLine) {
        result.push({ text: localLine, type: 'same' });
      } else if (side === 'local') {
        result.push({ text: localLine, type: 'removed' });
      } else {
        result.push({ text: serverLine, type: 'added' });
      }
    }

    return result;
  }
}
