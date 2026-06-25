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

  it('should display goals cards', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.card-glass').length).toBe(3);
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Personal Savings Goals',
    );
  });
});
