export default function Home() {
  return (
    <main
      style={{
        fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
        padding: '2rem',
        maxWidth: 720,
        margin: '0 auto',
        color: '#111',
      }}
    >
      <h1 style={{ marginBottom: 4 }}>MiM Essay MCP</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Marketing dashboard + remote MCP server for MiM Essay.
      </p>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a
          href="/dashboard"
          style={{
            padding: '10px 16px',
            background: '#111',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Open dashboard →
        </a>
      </div>

      <h2 style={{ marginTop: 32, fontSize: 18 }}>For Claude.ai</h2>
      <p style={{ fontSize: 13, color: '#444' }}>
        Add a custom connector pointing at <code>/api/mcp?token=&lt;MCP_BEARER_TOKEN&gt;</code>.
        The connector exposes tools for{' '}
        <code>get_combined_dashboard</code>, <code>get_volume_report</code>,{' '}
        <code>get_quality_report</code>, <code>get_leads</code>,{' '}
        <code>get_meta_ad_spend</code>, <code>get_google_ads_spend</code>.
      </p>

      <h2 style={{ marginTop: 32, fontSize: 18 }}>Endpoints</h2>
      <ul style={{ fontSize: 13, color: '#444' }}>
        <li>
          <code>POST /api/mcp</code> — MCP HTTP transport (bearer auth)
        </li>
        <li>
          <code>GET /dashboard</code> — Web dashboard (cookie auth, falls back to /login)
        </li>
        <li>
          <code>GET /api/refresh</code> — Cron-triggered cache refresh (legacy, optional)
        </li>
      </ul>
    </main>
  );
}
