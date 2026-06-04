/**
 * Shared top navigation between /dashboard and /dashboard/themes.
 * Server Component — no client-side state.
 */
import Link from 'next/link';

interface Props {
  current: 'dashboard' | 'themes';
  userEmail?: string;
  isAdmin?: boolean;
}

export function TopNav(props: Props) {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginBottom: 16,
        padding: '10px 14px',
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 14,
      }}
    >
      <NavLink href="/dashboard" active={props.current === 'dashboard'}>
        Dashboard
      </NavLink>
      <NavLink href="/dashboard/themes" active={props.current === 'themes'}>
        Themes
      </NavLink>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {props.userEmail && (
          <span style={{ fontSize: 12, color: '#666' }}>{props.userEmail}</span>
        )}
        {props.isAdmin && (
          <a
            href="/admin"
            style={{
              padding: '6px 10px',
              background: '#fafafa',
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 12,
              color: '#444',
              textDecoration: 'none',
            }}
          >
            Admin
          </a>
        )}
      </div>
    </nav>
  );
}

function NavLink(props: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={props.href}
      style={{
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 8,
        textDecoration: 'none',
        color: props.active ? '#fff' : '#444',
        background: props.active ? '#111' : 'transparent',
      }}
    >
      {props.children}
    </Link>
  );
}
