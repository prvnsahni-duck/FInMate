import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsCardComponent } from './stats-card.component';

describe('StatsCardComponent', () => {
  let component: StatsCardComponent;
  let fixture: ComponentFixture<StatsCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StatsCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render inputs correctly', () => {
    fixture.componentRef.setInput('title', 'Total Balance');
    fixture.componentRef.setInput('value', '$1,000.00');
    fixture.componentRef.setInput('icon', 'M3 22h18');
    fixture.componentRef.setInput('type', 'primary');

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h3')?.textContent?.trim()).toBe(
      'Total Balance',
    );
    expect(compiled.querySelector('p')?.textContent?.trim()).toBe('$1,000.00');
    expect(compiled.querySelector('path')?.getAttribute('d')).toBe('M3 22h18');
  });
});
