import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DropdownComponent, DropdownOption } from './dropdown.component';

describe('DropdownComponent', () => {
  let component: DropdownComponent;
  let fixture: ComponentFixture<DropdownComponent>;

  const mockOptions: DropdownOption[] = [
    { value: 'USD', label: 'USD ($)', description: 'US Dollar' },
    { value: 'INR', label: 'INR (₹)', description: 'Indian Rupee' },
    { value: 'EUR', label: 'EUR (€)', description: 'Euro' }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropdownComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DropdownComponent);
    component = fixture.componentInstance;
    component.options = mockOptions;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display placeholder when no option is selected', () => {
    component.placeholder = 'Choose currency';
    fixture.detectChanges();
    
    const triggerBtn = fixture.nativeElement.querySelector('button');
    expect(triggerBtn.textContent).toContain('Choose currency');
  });

  it('should display selected option label', () => {
    component.writeValue('INR');
    fixture.detectChanges();

    const triggerBtn = fixture.nativeElement.querySelector('button');
    expect(triggerBtn.textContent).toContain('INR (₹)');
  });

  it('should toggle dropdown when trigger button is clicked', () => {
    fixture.detectChanges();
    const triggerBtn = fixture.nativeElement.querySelector('button');
    
    triggerBtn.click();
    fixture.detectChanges();
    expect(component.isOpen).toBe(true);

    triggerBtn.click();
    fixture.detectChanges();
    expect(component.isOpen).toBe(false);
  });

  it('should select option, update value, write value, and close dropdown on option click', () => {
    fixture.detectChanges();
    const changeSpy = jest.fn();
    component.registerOnChange(changeSpy);

    // Open dropdown by clicking trigger button
    const triggerBtn = fixture.nativeElement.querySelector('button');
    triggerBtn.click();
    fixture.detectChanges();

    // Find first option button in dropdown menu (excluding the main trigger button)
    const buttons = fixture.nativeElement.querySelectorAll('button');
    // Button at index 0 is the trigger button. Index 1 is the first option.
    const firstOptionBtn = buttons[1] as HTMLButtonElement;
    expect(firstOptionBtn).toBeTruthy();

    firstOptionBtn.click();
    fixture.detectChanges();

    expect(component.value()).toBe('USD');
    expect(changeSpy).toHaveBeenCalledWith('USD');
    expect(component.isOpen).toBe(false);
  });

  it('should handle keyboard navigation correctly', () => {
    fixture.detectChanges();
    // Open dropdown by clicking trigger button
    const triggerBtn = fixture.nativeElement.querySelector('button');
    triggerBtn.click();
    fixture.detectChanges();
    
    expect(component.focusedIndex).toBe(0); // USD is at index 0

    // Dispatch ArrowDown keydown event on host element
    const hostEl = fixture.nativeElement;
    hostEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(component.focusedIndex).toBe(1); // INR is at index 1

    // Enter should select option
    const changeSpy = jest.fn();
    component.registerOnChange(changeSpy);
    hostEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBe('INR');
    expect(changeSpy).toHaveBeenCalledWith('INR');
    expect(component.isOpen).toBe(false);
  });

  it('should close on Escape keypress', () => {
    fixture.detectChanges();
    // Open dropdown by clicking trigger button
    const triggerBtn = fixture.nativeElement.querySelector('button');
    triggerBtn.click();
    fixture.detectChanges();
    expect(component.isOpen).toBe(true);

    // Dispatch Escape keydown event on host element
    const hostEl = fixture.nativeElement;
    hostEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(component.isOpen).toBe(false);
  });
});
