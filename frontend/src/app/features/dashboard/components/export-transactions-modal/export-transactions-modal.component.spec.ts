import { TestBed } from '@angular/core/testing';
import { ExportTransactionsModalComponent } from './export-transactions-modal.component';
import { ExpenseExportService } from '../../services/expense-export.service';

describe('ExportTransactionsModalComponent', () => {
  let component: ExportTransactionsModalComponent;
  let exportService: { exportExpenses: jest.Mock };

  beforeEach(() => {
    exportService = { exportExpenses: jest.fn().mockResolvedValue('file.xlsx') };

    TestBed.configureTestingModule({
      imports: [ExportTransactionsModalComponent],
      providers: [
        { provide: ExpenseExportService, useValue: exportService },
      ],
    });

    const fixture = TestBed.createComponent(ExportTransactionsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('defaults the range to the current month', () => {
    expect(component.fromDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(component.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('blocks export when from is after to', async () => {
    component.fromDate = '2026-08-01';
    component.toDate = '2026-07-01';

    await component.onExport();

    expect(exportService.exportExpenses).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('from');
  });

  it('exports with the selected filters and closes on success', async () => {
    const closeSpy = jest.spyOn(component.closeModalEvent, 'emit');
    component.fromDate = '2026-07-01';
    component.toDate = '2026-07-31';
    component.type = 'group';
    component.category = 'Travel';
    component.status = 'settled';
    component.currency = 'USD';

    await component.onExport();

    expect(exportService.exportExpenses).toHaveBeenCalledWith(
      {
        from: '2026-07-01',
        to: '2026-07-31',
        type: 'group',
        category: 'Travel',
        status: 'settled',
        currency: 'USD',
      },
      'xlsx',
    );
    expect(closeSpy).toHaveBeenCalled();
    expect(component.isExporting).toBe(false);
  });

  it('surfaces the error and stays open when export fails', async () => {
    exportService.exportExpenses.mockRejectedValue({
      error: { message: 'Too many records' },
    });
    const closeSpy = jest.spyOn(component.closeModalEvent, 'emit');
    component.fromDate = '2026-07-01';
    component.toDate = '2026-07-31';

    await component.onExport();

    expect(component.errorMessage).toBe('Too many records');
    expect(closeSpy).not.toHaveBeenCalled();
    expect(component.isExporting).toBe(false);
  });
});
