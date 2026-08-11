import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ReturnModalComponent } from './return-modal.component';
import { PeopleService } from '../../services/people.service';

describe('ReturnModalComponent', () => {
  let fixture: ComponentFixture<ReturnModalComponent>;
  let component: ReturnModalComponent;
  let peopleService: { createSettlement: jest.Mock };

  async function setup(outstanding = 500, ret = of({})) {
    peopleService = { createSettlement: jest.fn().mockReturnValue(ret) };
    await TestBed.configureTestingModule({
      imports: [ReturnModalComponent],
      providers: [{ provide: PeopleService, useValue: peopleService }],
    }).compileComponents();
    fixture = TestBed.createComponent(ReturnModalComponent);
    fixture.componentRef.setInput('userId', 'u2');
    fixture.componentRef.setInput('personName', 'Naveen');
    fixture.componentRef.setInput('outstanding', outstanding);
    fixture.componentRef.setInput('currency', 'INR');
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('prefills the full outstanding amount', async () => {
    await setup(500);
    expect(component.form.controls.amount.value).toBe(500);
  });

  it('submits a full settlement and emits saved', async () => {
    await setup(500);
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.submit();
    expect(peopleService.createSettlement).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({ amount: 500, currency: 'INR' }),
    );
    expect(saved).toHaveBeenCalled();
  });

  it('submits a partial settlement', async () => {
    await setup(500);
    component.form.controls.amount.setValue(200);
    component.submit();
    expect(peopleService.createSettlement).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({ amount: 200 }),
    );
  });

  it('blocks over-settlement client-side (does not call the API)', async () => {
    await setup(500);
    component.form.controls.amount.setValue(700);
    expect(component.isOverLimit()).toBe(true);
    component.submit();
    expect(peopleService.createSettlement).not.toHaveBeenCalled();
  });

  it('shows the backend rejection message', async () => {
    await setup(
      500,
      throwError(() => ({
        error: {
          message: 'Return amount cannot exceed the outstanding balance',
        },
      })),
    );
    component.form.controls.amount.setValue(500);
    component.submit();
    expect(component.errorMsg()).toContain('exceed the outstanding');
  });
});
