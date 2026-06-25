import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardProfileComponent } from './dashboard-profile.component';

describe('DashboardProfileComponent', () => {
  let component: DashboardProfileComponent;
  let fixture: ComponentFixture<DashboardProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardProfileComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardProfileComponent);
    component = fixture.componentInstance;
    component.userName = 'John';
    component.userEmail = 'john@example.com';
    component.personalExpensesCount = 5;
    component.incomePercentage = 10;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display profile details correctly', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h3')?.textContent).toContain('John');
    expect(compiled.textContent).toContain('john@example.com');
    expect(compiled.textContent).toContain('5 logged');
    expect(compiled.textContent).toContain('10% spent');
  });
});
