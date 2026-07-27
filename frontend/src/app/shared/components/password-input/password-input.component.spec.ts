import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PasswordInputComponent } from './password-input.component';

describe('PasswordInputComponent', () => {
  let fixture: ComponentFixture<PasswordInputComponent>;
  let component: PasswordInputComponent;
  const input = () =>
    fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const toggle = () =>
    fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PasswordInputComponent] });
    fixture = TestBed.createComponent(PasswordInputComponent);
    component = fixture.componentInstance;
  });

  it('is masked by default', () => {
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('password');
    expect(toggle().getAttribute('type')).toBe('button'); // never submits a form
    expect(toggle().getAttribute('aria-label')).toBe('Show password');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('toggle() flips the visibility signal', () => {
    expect(component.show()).toBe(false);
    component.toggle();
    expect(component.show()).toBe(true);
    component.toggle();
    expect(component.show()).toBe(false);
  });

  it('reveals the password and updates a11y labels when shown', () => {
    component.show.set(true);
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('text');
    expect(toggle().getAttribute('aria-label')).toBe('Hide password');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('forwards autocomplete/testId so password managers and tests keep working', () => {
    fixture.componentRef.setInput('autocomplete', 'new-password');
    fixture.componentRef.setInput('testId', 'pw');
    fixture.componentRef.setInput('toggleTestId', 'pw-toggle');
    fixture.detectChanges();
    expect(input().getAttribute('autocomplete')).toBe('new-password');
    expect(input().getAttribute('data-testid')).toBe('pw');
    expect(toggle().getAttribute('data-testid')).toBe('pw-toggle');
  });

  it('implements ControlValueAccessor (writeValue + change propagation)', () => {
    let propagated = '';
    component.registerOnChange((v) => (propagated = v));
    component.writeValue('secret');
    fixture.detectChanges();
    expect(input().value).toBe('secret');

    input().value = 'typed-by-user';
    input().dispatchEvent(new Event('input'));
    expect(propagated).toBe('typed-by-user');
    expect(component.value).toBe('typed-by-user');
  });

  it('keeps visibility independent per instance', () => {
    // Two fields in one host; toggling one must not reveal the other.
    @Component({
      standalone: true,
      imports: [PasswordInputComponent, FormsModule],
      template: `
        <app-password-input testId="a" toggleTestId="a-t"></app-password-input>
        <app-password-input testId="b" toggleTestId="b-t"></app-password-input>
      `,
    })
    class HostComponent {}

    const host = TestBed.createComponent(HostComponent);
    host.detectChanges();
    const el = host.nativeElement as HTMLElement;
    const inputA = el.querySelector('[data-testid="a"]') as HTMLInputElement;
    const inputB = el.querySelector('[data-testid="b"]') as HTMLInputElement;
    const toggleA = el.querySelector(
      '[data-testid="a-t"]',
    ) as HTMLButtonElement;

    expect(inputA.getAttribute('type')).toBe('password');
    expect(inputB.getAttribute('type')).toBe('password');

    toggleA.click();
    host.detectChanges();

    expect(inputA.getAttribute('type')).toBe('text'); // only A revealed
    expect(inputB.getAttribute('type')).toBe('password'); // B unaffected
  });
});
