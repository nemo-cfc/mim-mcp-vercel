export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1>MiM Essay MCP Server</h1>
      <p>
        This is a remote MCP server for MiM Essay CRM analytics. It is designed to be added as a
        Custom Connector in Claude.ai.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/mcp</code> — MCP HTTP transport (bearer auth required)
        </li>
        <li>
          <code>GET /api/sse</code> — MCP SSE transport (bearer auth required)
        </li>
        <li>
          <code>GET /api/refresh</code> — Cron-triggered cache refresh (cron secret required)
        </li>
      </ul>
      <h2>Tools</h2>
      <ul>
        <li>
          <code>get_leads</code> — enriched leads filtered by date range
        </li>
        <li>
          <code>get_marketing_dashboard</code> — channel-wise totals + qualified/good rates
        </li>
        <li>
          <code>get_channel_matrix</code> — channel matrix only
        </li>
      </ul>
    </main>
  );
}
