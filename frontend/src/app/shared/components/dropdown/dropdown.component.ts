import { Component, Input, ElementRef, HostListener, forwardRef, signal, computed } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface DropdownOption {
  value: any;
  label: string;
  icon?: string;
  description?: string;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownComponent),
      multi: true
    }
  ],
  templateUrl: './dropdown.component.html'
})
export class DropdownComponent implements ControlValueAccessor {
  @Input() options: DropdownOption[] = [];
  @Input() placeholder = 'Select option...';
  @Input() label = '';
  @Input() disabled = false;
  @Input() styleClass = '';
  @Input() id = '';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() buttonClass = '';

  value = signal<any>(null);
  isOpen = false;
  focusedIndex = -1;

  onChange: any = () => {};
  onTouched: any = () => {};

  constructor(private elementRef: ElementRef) {}

  selectedOption = computed(() => {
    return this.options.find(opt => opt.value === this.value()) || null;
  });

  toggle() {
    if (this.disabled) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.focusedIndex = this.options.findIndex(opt => opt.value === this.value());
      if (this.focusedIndex === -1 && this.options.length > 0) {
        this.focusedIndex = 0;
      }
    }
  }

  selectOption(option: DropdownOption) {
    if (this.disabled) return;
    this.value.set(option.value);
    this.onChange(option.value);
    this.onTouched();
    this.isOpen = false;
  }

  // ControlValueAccessor methods
  writeValue(value: any): void {
    this.value.set(value);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  // Click outside to close
  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  // Keyboard navigation
  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (this.disabled) return;

    if (!this.isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggle();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusedIndex = (this.focusedIndex + 1) % this.options.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusedIndex = (this.focusedIndex - 1 + this.options.length) % this.options.length;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.focusedIndex >= 0 && this.focusedIndex < this.options.length) {
          this.selectOption(this.options[this.focusedIndex]);
        }
        break;
      case 'Escape':
      case 'Tab':
        this.close();
        break;
    }
  }

  close() {
    this.isOpen = false;
    this.focusedIndex = -1;
  }
}
