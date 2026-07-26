import { TestBed } from '@angular/core/testing';
import { CryptoRecoveryVisibilityService } from './crypto-recovery-visibility.service';

describe('CryptoRecoveryVisibilityService', () => {
  let service: CryptoRecoveryVisibilityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CryptoRecoveryVisibilityService],
    });
    service = TestBed.inject(CryptoRecoveryVisibilityService);
  });

  it('a single registered instance is topmost', () => {
    const id = service.register();
    expect(service.isTopmost(id)()).toBe(true);
  });

  it('only the most-recently-registered instance is topmost (e.g. a modal opened over a page)', () => {
    const pageId = service.register();
    expect(service.isTopmost(pageId)()).toBe(true);

    const modalId = service.register();
    expect(service.isTopmost(pageId)()).toBe(false);
    expect(service.isTopmost(modalId)()).toBe(true);
  });

  it('the underlying instance regains topmost once the newer one unregisters (modal closed)', () => {
    const pageId = service.register();
    const modalId = service.register();
    expect(service.isTopmost(pageId)()).toBe(false);

    service.unregister(modalId);

    expect(service.isTopmost(pageId)()).toBe(true);
  });

  it('handles three simultaneously mounted instances correctly', () => {
    const a = service.register();
    const b = service.register();
    const c = service.register();

    expect(service.isTopmost(a)()).toBe(false);
    expect(service.isTopmost(b)()).toBe(false);
    expect(service.isTopmost(c)()).toBe(true);

    service.unregister(c);
    expect(service.isTopmost(b)()).toBe(true);

    service.unregister(b);
    expect(service.isTopmost(a)()).toBe(true);
  });

  it('an unregistered id is never topmost', () => {
    const id = service.register();
    service.unregister(id);
    expect(service.isTopmost(id)()).toBe(false);
  });
});
