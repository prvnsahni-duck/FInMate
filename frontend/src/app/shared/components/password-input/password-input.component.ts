import {
  Component,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent } from '../icon/icon.component';
import {
  EYE_ICON_PATH,
  EYE_OFF_ICON_PATH,
} from '../../../core/constants/app.constants';

/**
 * Reusable masked password field with a show/hide (eye) toggle.
 *
 * - Works with reactive forms (`formControlName`), template forms (`ngModel`)
 *   and manual bindings, via ControlValueAccessor.
 * - Masked by default; the toggle flips only this field and resets to hidden
 *   whenever the component is recreated (i.e. the screen is reopened).
 * - Accessible: the toggle carries an aria-label ("Show password" /
 *   "Hide password") and aria-pressed; the input keeps its autocomplete so
 *   password managers keep working.
 *
 * Styling is caller-driven via `inputClass` (include the right padding, e.g.
 * `pr-12`, to leave room for the eye) and optional `toggleClass`.
 */
@Component({
  selector: 'app-password-input',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="relative">
      <input
        [id]="inputId()"
        [attr.data-testid]="testId()"
        [type]="show() ? 'text' : 'password'"
        [class]="inputClass()"
        [class.border-red-500]="invalid()"
        [attr.autocomplete]="autocomplete()"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel() || null"
        [attr.aria-invalid]="invalid() ? true : null"
        [attr.aria-describedby]="describedById() || null"
        [attr.aria-busy]="busy() ? true : null"
        [value]="value"
        [disabled]="disabled"
        (input)="onInput($event)"
        (blur)="onTouched()"
        (keyup)="keyEvent.emit($event)"
        (keydown)="keyEvent.emit($event)"
      />
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-label]="show() ? 'Hide password' : 'Show password'"
        [attr.aria-pressed]="show()"
        [attr.title]="show() ? 'Hide password' : 'Show password'"
        [attr.data-testid]="toggleTestId() || null"
        [class]="toggleClass()"
        tabindex="-1"
      >
        <app-icon [path]="show() ? eyeOff : eye" className="w-5 h-5"></app-icon>
      </button>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PasswordInputComponent),
      multi: true,
    },
  ],
})
export class PasswordInputComponent implements ControlValueAccessor {
  /** Rendered as the inner input's `id` (kept off the host to avoid a
   *  duplicate id and to keep `<label for>` pointing at the real input). */
  readonly inputId = input<string>();
  readonly testId = input<string>();
  readonly toggleTestId = input<string>();
  readonly autocomplete = input<string>('current-password');
  readonly placeholder = input<string>('••••••••');
  readonly inputClass = input<string>('');
  readonly toggleClass = input<string>(
    'absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white transition-colors',
  );
  readonly ariaLabel = input<string>();
  readonly describedById = input<string>();
  readonly invalid = input<boolean>(false);
  readonly busy = input<boolean>(false);

  /** Emitted on keyup/keydown so callers can add e.g. Caps Lock detection. */
  readonly keyEvent = output<KeyboardEvent>();

  readonly show = signal(false);
  value = '';
  disabled = false;

  readonly eye = EYE_ICON_PATH;
  readonly eyeOff = EYE_OFF_ICON_PATH;

  private onChange: (value: string) => void = () => {
    /* noop until registered */
  };
  onTouched: () => void = () => {
    /* noop until registered */
  };

  toggle(): void {
    this.show.update((v) => !v);
  }

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
    this.onChange(this.value);
  }

  // ── ControlValueAccessor ────────────────────────────────────────────────
  writeValue(value: string | null): void {
    this.value = value ?? '';
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
