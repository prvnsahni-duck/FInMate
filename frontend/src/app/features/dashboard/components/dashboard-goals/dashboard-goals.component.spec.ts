import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardGoalsComponent } from './dashboard-goals.component';

describe('DashboardGoalsComponent', () => {
  let component: DashboardGoalsComponent;
  let fixture: ComponentFixture<DashboardGoalsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardGoalsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardGoalsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render a Coming Soon state without placeholder financial data', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    // Single informational card, not the old 3 fake goal cards.
    expect(compiled.querySelectorAll('.card-glass').length).toBe(1);
    expect(compiled.textContent).toContain('Coming Soon');
    // No fabricated currency figures should appear.
    expect(compiled.textContent).not.toMatch(/\$\d/);
  });
});
