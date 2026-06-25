import { TestBed } from '@angular/core/testing';
import { AutomergeService } from './automerge.service';

interface TestResource {
  title: string;
  body: string;
  category: string;
  version: number;
}

describe('AutomergeService', () => {
  let service: AutomergeService;

  const serverState: TestResource = {
    title: 'Original title',
    body: 'Server updated body',
    category: 'Food',
    version: 2,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AutomergeService);
  });

  // ─── detectOverlap ────────────────────────────────────────────────────────

  describe('detectOverlap()', () => {
    it('returns empty array when no local fields conflict with server state', () => {
      // User edited `category` to 'Food' — server already has 'Food'
      const localPayload: Partial<TestResource> = { category: 'Food' };
      expect(service.detectOverlap(localPayload, serverState)).toEqual([]);
    });

    it('returns conflicting field names when server has different values', () => {
      // User edited `body`; server also changed `body` to something different
      const localPayload: Partial<TestResource> = {
        body: 'My local body edit',
      };
      expect(service.detectOverlap(localPayload, serverState)).toEqual([
        'body',
      ]);
    });

    it('returns multiple conflicting fields when several differ', () => {
      const localPayload: Partial<TestResource> = {
        title: 'My local title',
        body: 'My local body',
      };
      const result = service.detectOverlap(localPayload, serverState);
      expect(result).toContain('title');
      expect(result).toContain('body');
      expect(result.length).toBe(2);
    });

    it('ignores the version field even when values differ', () => {
      const localPayload: Partial<TestResource> = {
        version: 1, // outdated version
        title: 'Original title', // same as server → no conflict
      };
      expect(service.detectOverlap(localPayload, serverState)).toEqual([]);
    });

    it('returns only truly conflicting fields when payload is mixed', () => {
      const localPayload: Partial<TestResource> = {
        title: 'My title', // differs from server → conflict
        category: 'Food', // matches server → no conflict
        body: 'My local body', // differs from server → conflict
      };
      const result = service.detectOverlap(localPayload, serverState);
      expect(result).toContain('title');
      expect(result).toContain('body');
      expect(result).not.toContain('category');
    });
  });

  // ─── merge ────────────────────────────────────────────────────────────────

  describe('merge()', () => {
    it('applies all local edits when there are no overlapping fields', () => {
      const localPayload: Partial<TestResource> = {
        title: 'My new title',
        category: 'Dining',
      };
      const merged = service.merge(serverState, localPayload, []);
      expect(merged['title']).toBe('My new title');
      expect(merged['category']).toBe('Dining');
      // Server-only fields preserved
      expect(merged['body']).toBe('Server updated body');
      expect(merged['version']).toBe(2);
    });

    it('excludes overlapping fields from the local merge (keeps server value)', () => {
      const localPayload: Partial<TestResource> = {
        title: 'My new title',
        body: 'My local body', // this field is overlapping
      };
      const merged = service.merge(serverState, localPayload, ['body']);
      // Non-overlapping local edit applied
      expect(merged['title']).toBe('My new title');
      // Overlapping field retains server state value
      expect(merged['body']).toBe('Server updated body');
    });

    it('starts from server state so server-only fields are always preserved', () => {
      const localPayload: Partial<TestResource> = { title: 'Updated' };
      const merged = service.merge(serverState, localPayload, []);
      expect(merged['version']).toBe(serverState.version);
      expect(merged['body']).toBe(serverState.body);
      expect(merged['category']).toBe(serverState.category);
    });
  });
});
