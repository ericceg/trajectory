import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/activities', label: 'Activities' },
  { path: '/statistics', label: 'Statistics' },
  { path: '/settings', label: 'Settings' }
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-gradient-to-b from-panel to-bg px-5 py-6">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">Trajectory</p>
        <h1 className="text-2xl font-semibold text-white">Trajectory</h1>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `block rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-white shadow-card'
                  : 'text-muted hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
