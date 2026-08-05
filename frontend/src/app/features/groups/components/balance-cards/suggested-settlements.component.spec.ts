import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupMember } from '@finmate/data-models';
import { SuggestedSettlementsComponent } from './suggested-settlements.component';

describe('SuggestedSettlementsComponent', () => {
  let fixture: ComponentFixture<SuggestedSettlementsComponent>;

  const members = [
    { id: 'm1', user: { id: 'u1', displayName: 'Naveen' } },
    { id: 'm2', user: { id: 'u2', displayName: 'Praveen' } },
  ] as unknown as GroupMember[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuggestedSettlementsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SuggestedSettlementsComponent);
  });

  it('renders the scope label and each settlement row', () => {
    fixture.componentRef.setInput('scopeLabel', 'Overall');
    fixture.componentRef.setInput('members', members);
    fixture.componentRef.setInput('settlements', [
      { fromUserId: 'u1', toUserId: 'u2', amount: 2496.5, currency: 'INR' },
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Overall');
    expect(text).toContain('Naveen');
    expect(text).toContain('Praveen');
    expect(text).toContain('₹2,496.50');
  });

  it('renders nothing when there are no settlements', () => {
    fixture.componentRef.setInput('scopeLabel', 'This Month');
    fixture.componentRef.setInput('members', members);
    fixture.componentRef.setInput('settlements', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('resolves names from nameByKey (household group-member keys) when provided', () => {
    fixture.componentRef.setInput('scopeLabel', 'Overall');
    fixture.componentRef.setInput('members', []);
    fixture.componentRef.setInput('settlements', [
      { fromUserId: 'gm-1', toUserId: 'gm-2', amount: 50, currency: 'INR' },
    ]);
    fixture.componentRef.setInput('nameByKey', {
      'gm-1': 'Naveen Sahni',
      'gm-2': 'Praveen Sahni',
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Naveen Sahni');
    expect(text).toContain('Praveen Sahni');
  });

  it('shows the excludes-settlements hint only when flagged', () => {
    fixture.componentRef.setInput('scopeLabel', 'This Month');
    fixture.componentRef.setInput('members', members);
    fixture.componentRef.setInput('settlements', [
      { fromUserId: 'u1', toUserId: 'u2', amount: 10, currency: 'INR' },
    ]);
    fixture.componentRef.setInput('excludesSettlements', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('excludes settlements');
  });
});
