import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BalanceCarouselComponent } from './balance-carousel.component';

describe('BalanceCarouselComponent', () => {
  let fixture: ComponentFixture<BalanceCarouselComponent>;
  let component: BalanceCarouselComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BalanceCarouselComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BalanceCarouselComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('overall', 2496.5);
    fixture.componentRef.setInput('period', 130.82);
    fixture.componentRef.setInput('currency', 'INR');
    fixture.componentRef.setInput('periodTitle', 'This Month');
    fixture.componentRef.setInput('periodSubtitle', 'August 2026');
    fixture.detectChanges();
  });

  it('renders both the overall and period amounts', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Overall Balance');
    expect(text).toContain('This Month');
    expect(text).toContain('August 2026');
    // Signed, formatted amounts for both scopes.
    expect(text).toContain('+₹2,496.50');
    expect(text).toContain('+₹130.82');
  });

  it('starts on the first slide and moves via goTo', () => {
    expect(component.activeIndex()).toBe(0);
    component.goTo(1);
    expect(component.activeIndex()).toBe(1);
  });

  it('classifies amounts by sign', () => {
    expect(component.amountClass(5)['text-green-500 dark:text-green-400']).toBe(
      true,
    );
    expect(component.amountClass(-5)['text-red-500 dark:text-red-400']).toBe(
      true,
    );
    expect(component.amountClass(0)['text-slate-500']).toBe(true);
  });

  it('shows the breakdown only after toggling, with reconciling figures', () => {
    fixture.componentRef.setInput('breakdown', {
      currency: 'INR',
      openingBalance: 2365.68,
      currentPeriodBalance: 130.82,
      closingBalance: 2496.5,
    });
    fixture.detectChanges();

    // Collapsed by default.
    expect(fixture.nativeElement.textContent).not.toContain('Opening Balance');

    component.breakdownOpen.set(true);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Opening Balance');
    expect(text).toContain('Closing Balance');
    expect(text).toContain('₹2,365.68');
  });

  it('does not render the breakdown toggle when no breakdown is provided', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('breakdown');
  });
});
