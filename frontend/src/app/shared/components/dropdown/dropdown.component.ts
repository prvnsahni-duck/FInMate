import {
  Component,
  Input,
  ElementRef,
  HostListener,
  forwardRef,
  signal,
  computed,
  inject,
} from '@angular/core';
import {
  FormsModule,
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

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
      multi: true,
    },
  ],
  imports: [FormsModule],
  templateUrl: './dropdown.component.html',
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
  @Input() multiple = false;

  value = signal<any>(null);
  searchTerm = signal('');
  isOpen = false;
  focusedIndex = -1;

  onChange: (value: unknown) => void = () => undefined;
  onTouched: () => void = () => undefined;

  private elementRef = inject(ElementRef<HTMLElement>);

  selectedOption = computed(() => {
    return this.options.find((opt) => opt.value === this.value()) || null;
  });

  selectedOptions = computed(() => {
    if (!this.multiple) return [];
    const selectedValues = this.value();
    if (!Array.isArray(selectedValues)) return [];
    return this.options.filter((opt) => selectedValues.includes(opt.value));
  });

  filteredOptions = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!this.multiple || this.options.length < 10 || !term) {
      return this.options;
    }
    return this.options.filter((opt) =>
      `${opt.label} ${opt.description ?? ''}`.toLowerCase().includes(term),
    );
  });

  displayLabel = computed(() => {
    if (!this.multiple) {
      return this.selectedOption()?.label ?? this.placeholder;
    }
    const selected = this.selectedOptions();
    if (selected.length === 0) return this.placeholder;
    if (selected.length === 1) return selected[0].label;
    if (selected.length === 2)
      return selected.map((opt) => opt.label).join(', ');
    return `${selected.length} selected`;
  });

  toggle() {
    if (this.disabled) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.focusedIndex = this.filteredOptions().findIndex((opt) =>
        this.isSelected(opt),
      );
      if (this.focusedIndex === -1 && this.filteredOptions().length > 0) {
        this.focusedIndex = 0;
      }
    } else {
      this.searchTerm.set('');
    }
  }

  selectOption(option: DropdownOption) {
    if (this.disabled) return;
    if (this.multiple) {
      const selectedValues = Array.isArray(this.value()) ? this.value() : [];
      const nextValue = selectedValues.includes(option.value)
        ? selectedValues.filter((value: any) => value !== option.value)
        : [...selectedValues, option.value];
      this.value.set(nextValue);
      this.onChange(nextValue);
      this.onTouched();
      return;
    }
    this.value.set(option.value);
    this.onChange(option.value);
    this.onTouched();
    this.isOpen = false;
  }

  isSelected(option: DropdownOption): boolean {
    if (this.multiple) {
      const selectedValues = this.value();
      return (
        Array.isArray(selectedValues) && selectedValues.includes(option.value)
      );
    }
    return option.value === this.value();
  }

  // ControlValueAccessor methods
  writeValue(value: any): void {
    this.value.set(this.multiple ? (Array.isArray(value) ? value : []) : value);
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
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        this.toggle();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.filteredOptions().length > 0) {
          this.focusedIndex =
            (this.focusedIndex + 1) % this.filteredOptions().length;
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.filteredOptions().length > 0) {
          this.focusedIndex =
            (this.focusedIndex - 1 + this.filteredOptions().length) %
            this.filteredOptions().length;
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (
          this.focusedIndex >= 0 &&
          this.focusedIndex < this.filteredOptions().length
        ) {
          this.selectOption(this.filteredOptions()[this.focusedIndex]);
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
    this.searchTerm.set('');
  }
}
