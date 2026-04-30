'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Inline styles shared across components (matching the skill HTML template)
// ---------------------------------------------------------------------------
export const styles = {
  card: {
    border: '1px solid #e6e6e6',
    borderRadius: 14,
    padding: 14,
    background: '#fff',
  } as const,
  k: { color: '#666', fontSize: 12, marginBottom: 6 } as const,
  v: { fontSize: 22, fontWeight: 700 } as const,
  d: { marginTop: 8, fontSize: 12, color: '#444' } as const,
  badge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
  } as const,
  good: { background: '#e9f7ef', color: '#16794c' } as const,
  bad: { background: '#fdecec', color: '#b42318' } as const,
  warn: { background: '#fef3c7', color: '#92400e' } as const,
  neutral: { background: '#f5f5f5', color: '#444' } as const,
  th: {
    textAlign: 'left' as const,
    color: '#444',
    fontWeight: 700 as const,
    background: '#fafafa',
    padding: '10px',
    borderBottom: '1px solid #eee',
    fontSize: 13,
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid #eee',
    fontSize: 13,
  } as const,
  tdNum: {
    padding: '10px',
    borderBottom: '1px solid #eee',
    fontSize: 13,
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
};

// ---------------------------------------------------------------------------
// Date Controls (Client Component) — top of dashboard
// ---------------------------------------------------------------------------
export function DateControls(props: {
  from: string;
  to: string;
  focal: string;
  loading?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [focal, setFocal] = useState(props.focal);

  function apply() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (focal) params.set('focal', focal);
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  }

  function setFocalAndWindow(d: string) {
    setFocal(d);
    const fd = new Date(d + 'T00:00:00Z');
    const f = new Date(fd);
    f.setUTCDate(f.getUTCDate() - 13);
    setFrom(f.toISOString().slice(0, 10));
    setTo(d);
  }

  function logout() {
    fetch('/api/web/auth', { method: 'DELETE' }).then(() => router.push('/login'));
  }

  const busy = pending || props.loading;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-end',
        padding: '14px 16px',
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 14,
        marginBottom: 16,
      }}
    >
      <Field label="Focal date">
        <input
          type="date"
          value={focal}
          onChange={(e) => setFocalAndWindow(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="From">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="To">
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
      </Field>
      <button
        onClick={apply}
        disabled={busy}
        style={{
          padding: '8px 14px',
          background: busy ? '#9aa' : '#111',
          color: '#fff',
          border: 0,
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Loading…' : 'Apply'}
      </button>
      <div style={{ marginLeft: 'auto' }}>
        <button
          onClick={logout}
          style={{
            padding: '6px 10px',
            background: '#fafafa',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 12,
            color: '#444',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>
        {props.label}
      </span>
      {props.children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
};

// ---------------------------------------------------------------------------
// SummaryCards
// ---------------------------------------------------------------------------
export function SummaryCards(props: {
  totals: {
    leads: number;
    spend_total: number;
    spend_meta: number;
    spend_google: number;
    blended_cpl: number;
    qualified: number;
    cpql: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
  };
  dateRange: { from: string; to: string };
  focalDate?: string;
}) {
  const t = props.totals;
  const cards = [
    { k: 'Leads', v: fmt(t.leads), d: `${t.qualified} qualified · ${t.good} good` },
    {
      k: 'Total Spend',
      v: '₹' + fmt(t.spend_total),
      d: `Meta ₹${fmt(t.spend_meta)} · Google ₹${fmt(t.spend_google)}`,
    },
    { k: 'Blended CPL', v: t.leads > 0 ? '₹' + fmt(t.blended_cpl) : '—', d: 'spend / leads' },
    {
      k: 'CPQL',
      v: t.qualified > 0 ? '₹' + fmt(t.cpql) : '—',
      d: 'cost per qualified lead',
    },
    { k: 'Qualified rate', v: t.qualified_rate + '%', d: `${t.qualified} / ${t.leads}` },
    { k: 'Good rate', v: t.good_rate + '%', d: `${t.good} / ${t.leads}` },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}
    >
      {cards.map((c) => (
        <div key={c.k} style={styles.card}>
          <div style={styles.k}>{c.k}</div>
          <div style={styles.v}>{c.v}</div>
          <div style={styles.d}>{c.d}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Trend SVG chart — leads (line) + spend (line)
// ---------------------------------------------------------------------------
export function TrendChart(props: {
  daily: Array<{ date: string; leads: number; spend_total: number }>;
}) {
  const data = props.daily;
  if (!data.length) return null;

  const W = 720;
  const H = 220;
  const PAD_L = 50;
  const PAD_R = 50;
  const PAD_T = 18;
  const PAD_B = 30;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxLeads = Math.max(...data.map((d) => d.leads), 1);
  const maxSpend = Math.max(...data.map((d) => d.spend_total), 1);

  const x = (i: number) =>
    PAD_L + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const yLeads = (v: number) => PAD_T + innerH - (v / maxLeads) * innerH;
  const ySpend = (v: number) => PAD_T + innerH - (v / maxSpend) * innerH;

  const leadsPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yLeads(d.leads)}`).join(' ');
  const spendPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${ySpend(d.spend_total)}`)
    .join(' ');

  const tickStep = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div style={{ ...styles.card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Daily trend</span>
        <Legend color="#16794c" label="Leads" />
        <Legend color="#2563eb" label="Spend (₹)" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <line x1={PAD_L} y1={PAD_T + innerH} x2={PAD_L + innerW} y2={PAD_T + innerH} stroke="#ddd" />
        <path d={leadsPath} stroke="#16794c" strokeWidth={2} fill="none" />
        <path d={spendPath} stroke="#2563eb" strokeWidth={2} fill="none" strokeDasharray="4 3" />
        {data.map((d, i) =>
          i % tickStep === 0 ? (
            <text
              key={d.date}
              x={x(i)}
              y={PAD_T + innerH + 18}
              fontSize={10}
              fill="#666"
              textAnchor="middle"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
        <text x={PAD_L - 6} y={PAD_T + 4} fontSize={10} fill="#16794c" textAnchor="end">
          {fmt(maxLeads)}
        </text>
        <text x={W - PAD_R + 6} y={PAD_T + 4} fontSize={10} fill="#2563eb" textAnchor="start">
          ₹{fmt(maxSpend)}
        </text>
      </svg>
    </div>
  );
}

function Legend(props: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#444' }}>
      <span style={{ width: 12, height: 3, background: props.color, borderRadius: 2 }} />
      {props.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Decay panel
// ---------------------------------------------------------------------------
export function DecayPanel(props: { decay: any }) {
  if (!props.decay) return null;
  const d = props.decay;
  const items: Array<{ label: string; value: string; alert: boolean; sub?: string }> = [
    {
      label: 'CPL drift vs 7d',
      value: pct(d.cpl?.drift_pct_vs_7d),
      alert: !!d.cpl?.alert,
      sub: `focal ₹${fmt(d.cpl?.focal)} · 7d avg ₹${fmt(d.cpl?.avg_7d)}`,
    },
    {
      label: 'CPQL drift vs 7d',
      value: pct(d.cpql?.drift_pct),
      alert: !!d.cpql?.alert,
      sub: `focal ₹${fmt(d.cpql?.focal)} · 7d avg ₹${fmt(d.cpql?.avg_7d)}`,
    },
    {
      label: 'Frequency',
      value: fmt(d.frequency?.focal),
      alert: !!d.frequency?.alert,
      sub: `7d avg ${fmt(d.frequency?.avg_7d)} · velocity ${fmt(d.frequency?.velocity_per_day)}/day`,
    },
    {
      label: 'CTR decay',
      value: pct(d.ctr?.decay_pct),
      alert: !!d.ctr?.alert,
      sub: `focal ${fmt(d.ctr?.focal)}% · 7d avg ${fmt(d.ctr?.avg_7d)}%`,
    },
    {
      label: 'CPM drift',
      value: pct(d.cpm?.drift_pct),
      alert: !!d.cpm?.alert,
      sub: `focal ₹${fmt(d.cpm?.focal)} · 7d avg ₹${fmt(d.cpm?.avg_7d)}`,
    },
    {
      label: 'Good rate drop',
      value: (d.good_rate?.drop_pp >= 0 ? '+' : '') + fmt(d.good_rate?.drop_pp) + 'pp',
      alert: !!d.good_rate?.alert,
      sub: `focal ${fmt(d.good_rate?.focal)}% · 7d avg ${fmt(d.good_rate?.avg_7d)}%`,
    },
  ];
  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        Decay context · focal {d.focal_date}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {items.map((it) => (
          <div
            key={it.label}
            style={{
              padding: 10,
              border: '1px solid ' + (it.alert ? '#fecaca' : '#eee'),
              background: it.alert ? '#fff5f5' : '#fafafa',
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{it.label}</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: it.alert ? '#b42318' : '#111',
              }}
            >
              {it.value}
              {it.alert && <span style={{ marginLeft: 6, fontSize: 11 }}>⚠️</span>}
            </div>
            {it.sub && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{it.sub}</div>}
          </div>
        ))}
      </div>
      {d.notes?.length > 0 && (
        <ul style={{ marginTop: 12, paddingLeft: 20, fontSize: 13, color: '#444' }}>
          {d.notes.map((n: string, i: number) => (
            <li key={i} style={{ marginBottom: 3 }}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables: lanes, top ads, channels, stages
// ---------------------------------------------------------------------------
export function MetaLaneTable(props: { lanes: any[] }) {
  if (!props.lanes?.length) return null;
  return (
    <Section title="Meta lanes (campaign type)">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Lane</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>%</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qualified</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPQL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.lanes.map((l) => (
              <tr key={l.lane}>
                <td style={{ ...styles.td, fontWeight: 700 }}>{l.lane}</td>
                <td style={styles.tdNum}>₹{fmt(l.spend)}</td>
                <td style={styles.tdNum}>{fmt(l.spend_share)}%</td>
                <td style={styles.tdNum}>{fmt(l.leads)}</td>
                <td style={styles.tdNum}>{l.cpl > 0 ? '₹' + fmt(l.cpl) : '—'}</td>
                <td style={styles.tdNum}>{l.qualified}</td>
                <td style={styles.tdNum}>{l.cpql > 0 ? '₹' + fmt(l.cpql) : '—'}</td>
                <td style={styles.tdNum}>{l.good}</td>
                <td style={styles.td}>
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function TopAdsTable(props: { ads: any[] }) {
  if (!props.ads?.length) return null;
  // Show ads with leads > 0 OR spend > 1000 (so kill candidates with no leads still surface)
  const filtered = props.ads.filter((a) => a.leads > 0 || a.spend > 1000).slice(0, 25);
  return (
    <Section title="Top ads — winners & kill candidates">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Ad name</th>
              <th style={styles.th}>Lane</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual%</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good%</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPQL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Freq</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPM</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const rowBg =
                a.status === 'WINNER'
                  ? '#f0fdf4'
                  : a.status === 'KILL'
                  ? '#fef2f2'
                  : a.status === 'GOOD'
                  ? '#fdfff4'
                  : undefined;
              return (
                <tr key={a.ad_id} style={rowBg ? { background: rowBg } : undefined}>
                  <td style={{ ...styles.td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.ad_name}>
                    {a.ad_name}
                  </td>
                  <td style={styles.td}>{a.lane}</td>
                  <td style={styles.tdNum}>{a.leads}</td>
                  <td style={styles.tdNum}>{a.qual_rate}%</td>
                  <td style={styles.tdNum}>{a.good_rate}%</td>
                  <td style={styles.tdNum}>₹{fmt(a.spend)}</td>
                  <td style={styles.tdNum}>{a.cpl > 0 ? '₹' + fmt(a.cpl) : '—'}</td>
                  <td style={styles.tdNum}>{a.cpql > 0 ? '₹' + fmt(a.cpql) : '—'}</td>
                  <td style={styles.tdNum}>{fmt(a.frequency)}</td>
                  <td style={styles.tdNum}>₹{fmt(a.cpm)}</td>
                  <td style={styles.td}>
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function ChannelTable(props: { channels: any[] }) {
  if (!props.channels?.length) return null;
  return (
    <Section title="Channel performance">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Channel</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qualified</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual%</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good%</th>
            </tr>
          </thead>
          <tbody>
            {props.channels.map((c) => (
              <tr key={c.channel}>
                <td style={{ ...styles.td, fontWeight: 700 }}>{c.channel}</td>
                <td style={styles.tdNum}>{c.leads}</td>
                <td style={styles.tdNum}>{c.spend > 0 ? '₹' + fmt(c.spend) : '—'}</td>
                <td style={styles.tdNum}>{c.cpl > 0 ? '₹' + fmt(c.cpl) : '—'}</td>
                <td style={styles.tdNum}>{c.qualified}</td>
                <td style={styles.tdNum}>{c.good}</td>
                <td style={styles.tdNum}>{c.qualified_rate}%</td>
                <td style={styles.tdNum}>{c.good_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function StageDistribution(props: { stages: Array<{ stage: string; count: number; pct: number }> }) {
  if (!props.stages?.length) return null;
  const top = props.stages.slice(0, 12);
  return (
    <Section title="Stage distribution">
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={styles.th}>Stage</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>%</th>
          </tr>
        </thead>
        <tbody>
          {top.map((s) => (
            <tr key={s.stage}>
              <td style={styles.td}>{s.stage}</td>
              <td style={styles.tdNum}>{s.count}</td>
              <td style={styles.tdNum}>{s.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function InsightsPanel(props: { text?: string }) {
  if (!props.text || props.text.startsWith('(Gemini')) return null;
  return (
    <Section title="Insights">
      <div
        style={{
          fontSize: 13,
          color: '#222',
          whiteSpace: 'pre-wrap',
          background: '#fafafa',
          padding: 12,
          borderRadius: 10,
          lineHeight: 1.5,
        }}
      >
        {props.text}
      </div>
    </Section>
  );
}

export function NotesBanner(props: { notes?: string[] }) {
  if (!props.notes?.length) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '10px 12px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 10,
        fontSize: 12,
        color: '#92400e',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>Notes</strong>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {props.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, React.CSSProperties> = {
    WINNER: { background: '#dcfce7', color: '#15803d' },
    GOOD: { background: '#e0f2fe', color: '#0369a1' },
    OK: { background: '#e0f2fe', color: '#0369a1' },
    MONITOR: { background: '#fef3c7', color: '#92400e' },
    KILL: { background: '#fee2e2', color: '#b91c1c' },
    NO_LEADS: { background: '#f5f5f5', color: '#666' },
    INSUFFICIENT_DATA: { background: '#f5f5f5', color: '#666' },
  };
  const s = map[status] || map.NO_LEADS;
  return <span style={{ ...styles.badge, ...s }}>{status.replace('_', ' ')}</span>;
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

function ScrollX(props: { children: React.ReactNode }) {
  return <div style={{ overflowX: 'auto' }}>{props.children}</div>;
}

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  minWidth: 600,
};

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('en-IN');
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function pct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
