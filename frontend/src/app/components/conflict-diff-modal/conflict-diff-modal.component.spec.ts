import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { ConflictDiffModalComponent } from './conflict-diff-modal.component';
import { ConflictContext, ConflictResolution } from '../../interceptors/conflict.types';

const makeContext = (
  overrides: Partial<ConflictContext<Record<string, unknown>>> = {},
): ConflictContext<Record<string, unknown>> => ({
  resourceUrl: '/api/v1/notes/abc-123',
  localPayload: { body: 'My local edit', version: 5 },
  serverState:  { body: 'Server edit', title: 'Note', version: 6 },
  localVersion: 5,
  overlappingFields: ['body'],
  ...overrides,
});

describe('ConflictDiffModalComponent', () => {
  let fixture: ComponentFixture<ConflictDiffModalComponent>;
  let component: ConflictDiffModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConflictDiffModalComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ConflictDiffModalComponent);
    component = fixture.componentInstance;
    component.context = makeContext();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays the conflicting field name in the header', () => {
    const header = fixture.nativeElement as HTMLElement;
    expect(header.textContent).toContain('body');
  });

  it('shows the three strategy buttons when no strategy is selected', () => {
    expect(fixture.debugElement.query(By.css('#cdm-btn-keep-mine'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('#cdm-btn-keep-theirs'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('#cdm-btn-manual-merge'))).toBeTruthy();
  });

  it('shows the confirm bar and hides strategy buttons after a strategy is selected', () => {
    component.selectStrategy('keep-mine');
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#cdm-btn-keep-mine'))).toBeNull();
    expect(fixture.debugElement.query(By.css('#cdm-btn-confirm'))).toBeTruthy();
  });

  it('emits keep-mine resolution with localPayload and new server version on confirm', () => {
    const resolutions: ConflictResolution<Record<string, unknown>>[] = [];
    component.resolved.subscribe((r) => resolutions.push(r));

    component.selectStrategy('keep-mine');
    component.confirm();

    expect(resolutions.length).toBe(1);
    expect(resolutions[0].strategy).toBe('keep-mine');
    if (resolutions[0].strategy !== 'cancelled') {
      expect(resolutions[0].newVersion).toBe(6);
    }
  });

  it('emits keep-theirs resolution with only version on confirm', () => {
    const resolutions: ConflictResolution<Record<string, unknown>>[] = [];
    component.resolved.subscribe((r) => resolutions.push(r));

    component.selectStrategy('keep-theirs');
    component.confirm();

    expect(resolutions[0].strategy).toBe('keep-theirs');
    if (resolutions[0].strategy !== 'cancelled') {
      expect(resolutions[0].mergedPayload['version']).toBe(6);
    }
  });

  it('shows the textarea in manual merge mode', () => {
    component.selectStrategy('manual');
    fixture.detectChanges();

    const textarea = fixture.debugElement.query(By.css('#cdm-editor'));
    expect(textarea).toBeTruthy();
  });

  it('seeds the manual merge textarea with the local value', () => {
    component.selectStrategy('manual');
    fixture.detectChanges();

    expect(component.manualText()).toBe('My local edit');
  });

  it('emits manual resolution with the edited text', () => {
    const resolutions: ConflictResolution<Record<string, unknown>>[] = [];
    component.resolved.subscribe((r) => resolutions.push(r));

    component.selectStrategy('manual');
    component.manualText.set('Combined edit');
    component.confirm();

    expect(resolutions[0].strategy).toBe('manual');
    if (resolutions[0].strategy !== 'cancelled') {
      expect(resolutions[0].mergedPayload['body']).toBe('Combined edit');
    }
  });

  it('emits cancelled resolution when cancel is clicked', () => {
    const resolutions: ConflictResolution<Record<string, unknown>>[] = [];
    component.resolved.subscribe((r) => resolutions.push(r));

    component.cancel();

    expect(resolutions[0].strategy).toBe('cancelled');
  });

  it('returns to strategy picker when Back is clicked after strategy selection', () => {
    component.selectStrategy('keep-mine');
    fixture.detectChanges();

    component.activeStrategy.set(null);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#cdm-btn-keep-mine'))).toBeTruthy();
  });
});
