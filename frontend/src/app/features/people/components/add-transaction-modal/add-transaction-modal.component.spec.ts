import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AddTransactionModalComponent } from './add-transaction-modal.component';
import { PeopleService } from '../../services/people.service';

describe('AddTransactionModalComponent', () => {
  let fixture: ComponentFixture<AddTransactionModalComponent>;
  let component: AddTransactionModalComponent;
  let peopleService: { createTransaction: jest.Mock };

  async function setup(ret = of({})) {
    peopleService = { createTransaction: jest.fn().mockReturnValue(ret) };
    await TestBed.configureTestingModule({
      imports: [AddTransactionModalComponent],
      providers: [{ provide: PeopleService, useValue: peopleService }],
    }).compileComponents();
    fixture = TestBed.createComponent(AddTransactionModalComponent);
    fixture.componentRef.setInput('userId', 'u2');
    fixture.componentRef.setInput('personName', 'Naveen');
    fixture.componentRef.setInput('currency', 'INR');
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('does not submit an invalid (empty amount) form', async () => {
    await setup();
    component.submit();
    expect(peopleService.createTransaction).not.toHaveBeenCalled();
  });

  it('submits a lend and emits saved', async () => {
    await setup();
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.form.patchValue({ entryType: 'lend', amount: 500 });
    component.submit();
    expect(peopleService.createTransaction).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({ entryType: 'lend', amount: 500, currency: 'INR' }),
    );
    expect(saved).toHaveBeenCalled();
  });

  it('submits a borrow', async () => {
    await setup();
    component.form.patchValue({ entryType: 'borrow', amount: 300 });
    component.submit();
    expect(peopleService.createTransaction).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({ entryType: 'borrow', amount: 300 }),
    );
  });

  it('surfaces a backend error message', async () => {
    await setup(throwError(() => ({ error: { message: 'nope' } })));
    component.form.patchValue({ entryType: 'lend', amount: 10 });
    component.submit();
    expect(component.errorMsg()).toBe('nope');
  });
});
