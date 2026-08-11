import { Route } from '@angular/router';
import { appRoutes } from '../../app.routes';
import { NAV_ITEMS } from '../../shared/layouts/main-layout.component';

/**
 * Guards the People navigation contract: People is reachable, /friends redirects
 * to it (backwards compatibility), and the primary nav exposes People.
 */
describe('People navigation', () => {
  const layoutChildren: Route[] =
    appRoutes.find((r) => r.path === '' && r.children)?.children ?? [];

  it('exposes a lazy /people route', () => {
    const people = layoutChildren.find((r) => r.path === 'people');
    expect(people).toBeDefined();
    expect(people?.loadChildren).toBeInstanceOf(Function);
  });

  it('redirects /friends to /people for backwards compatibility', () => {
    const friends = layoutChildren.find((r) => r.path === 'friends');
    expect(friends?.redirectTo).toBe('people');
  });

  it('lists People in the primary navigation', () => {
    const people = NAV_ITEMS.find((n) => n.path === '/people');
    expect(people).toBeDefined();
    expect(people?.label).toBe('People');
  });
});
