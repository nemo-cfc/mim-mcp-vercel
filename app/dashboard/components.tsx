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
  dateField: 'created_at' | 'booked_at';
  loading?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [focal, setFocal] = useState(props.focal);
  const [dateField, setDateField] = useState<'created_at' | 'booked_at'>(props.dateField);

  function apply() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (focal) params.set('focal', focal);
    if (dateField === 'booked_at') params.set('date_field', 'booked_at');
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
      <Field label="Date field">
        <DateFieldToggle value={dateField} onChange={setDateField} />
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

function DateFieldToggle(props: {
  value: 'created_at' | 'booked_at';
  onChange: (v: 'created_at' | 'booked_at') => void;
}) {
  const opts: Array<{ v: 'created_at' | 'booked_at'; label: string }> = [
    { v: 'created_at', label: 'Created at' },
    { v: 'booked_at', label: 'Booked at' },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid #ddd',
        borderRadius: 8,
        overflow: 'hidden',
        height: 32,
      }}
    >
      {opts.map((o, i) => {
        const active = props.value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => props.onChange(o.v)}
            style={{
              padding: '0 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: 0,
              borderLeft: i > 0 ? '1px solid #ddd' : 0,
              background: active ? '#111' : '#fff',
              color: active ? '#fff' : '#444',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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

// ===========================================================================
// VOLUME DASHBOARD COMPONENTS — match the canonical Lead Volume Report skill
// ===========================================================================

export function VolumeHeader(props: { volume: any }) {
  if (!props.volume) return null;
  const v = props.volume;
  const date = new Date(v.focal_date + 'T00:00:00Z');
  const dateLabel = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div style={{ marginBottom: 14 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 700 }}>
        Lead Volume Report — MiM Essay
      </h1>
      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
        Report Date: <strong>{dateLabel}</strong> ({v.weekday}) | 7D Window:{' '}
        {v.date_range_label} | Excludes Referrals & Lead-Lost-Returns
      </p>
    </div>
  );
}

export function VolumeSummaryCards(props: { volume: any }) {
  const v = props.volume;
  if (!v) return null;
  const sign = (n: number) => (n >= 0 ? '▲' : '▼');
  const absNum = (n: number) => Math.abs(n);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}
    >
      {/* Total Leads */}
      <div style={styles.card}>
        <div style={styles.k}>Total Leads</div>
        <div style={styles.v}>{v.total_leads}</div>
        <div style={styles.d}>
          <span
            style={{
              ...styles.badge,
              ...(v.delta_leads_vs_7d_avg >= 0 ? styles.good : styles.bad),
            }}
          >
            {sign(v.delta_leads_vs_7d_avg)} {absNum(v.delta_leads_vs_7d_avg)} vs 7D avg{' '}
            {v.trailing_7d.avg_leads.toFixed(0)}
          </span>
          <br />
          <span
            style={{
              ...styles.badge,
              ...(v.delta_leads_vs_prev >= 0 ? styles.good : styles.bad),
              marginTop: 4,
            }}
          >
            {sign(v.delta_leads_vs_prev)} {absNum(v.delta_leads_vs_prev)} vs prev {v.prev_day.leads}
          </span>
        </div>
      </div>
      {/* Total Spend */}
      <div style={styles.card}>
        <div style={styles.k}>Total Spend</div>
        <div style={styles.v}>₹{fmt(v.total_spend)}</div>
        <div style={styles.d}>7D total: ₹{fmt(v.trailing_7d.total_spend)}</div>
      </div>
      {/* Overall CPL */}
      <div style={styles.card}>
        <div style={styles.k}>Overall CPL</div>
        <div style={styles.v}>{v.total_leads > 0 ? '₹' + fmt(v.overall_cpl) : '—'}</div>
        <div style={styles.d}>
          <span
            style={{
              ...styles.badge,
              ...(v.delta_cpl_vs_7d_avg <= 0 ? styles.good : styles.bad),
            }}
          >
            {sign(v.delta_cpl_vs_7d_avg)} ₹{absNum(Math.round(v.delta_cpl_vs_7d_avg))} vs 7D avg ₹
            {fmt(v.trailing_7d.avg_cpl)}
          </span>
          <br />
          <span
            style={{
              ...styles.badge,
              ...(v.delta_cpl_vs_prev <= 0 ? styles.good : styles.bad),
              marginTop: 4,
            }}
          >
            {sign(v.delta_cpl_vs_prev)} ₹{absNum(Math.round(v.delta_cpl_vs_prev))} vs prev ₹
            {fmt(v.prev_day.cpl)}
          </span>
        </div>
      </div>
      {/* MOF Remarketing */}
      <div style={{ ...styles.card, background: '#fffbeb', borderColor: '#fde68a' }}>
        <div style={styles.k}>MOF Remarketing (Meta)</div>
        <div style={{ ...styles.v, color: '#92400e' }}>{v.mof_remarketing.leads} leads</div>
        <div style={styles.d}>
          Spend: ₹{fmt(v.mof_remarketing.spend)} | CPL:{' '}
          {v.mof_remarketing.leads > 0 ? '₹' + fmt(v.mof_remarketing.cpl) : '—'}
          <br />
          7D avg: {v.mof_remarketing.avg_leads_7d} leads @ ₹{fmt(v.mof_remarketing.avg_cpl_7d)}
        </div>
      </div>
      {/* TOF Attributed */}
      <div style={{ ...styles.card, background: '#fffbeb', borderColor: '#fde68a' }}>
        <div style={styles.k}>TOF Attributed</div>
        <div style={{ ...styles.v, color: '#92400e' }}>{v.tof.attributed.toFixed(1)} leads</div>
        <div style={styles.d}>
          TOF Spend: ₹{fmt(v.tof.spend)} | CPL: {v.tof.attributed > 0 ? '₹' + fmt(v.tof.cpl) : '—'}
          <br />
          7D avg: {v.tof.avg_attributed_7d} leads @ ₹{fmt(v.tof.avg_cpl_7d)}
        </div>
      </div>
    </div>
  );
}

export function VolumeTrendSVG(props: { rolling: any[] }) {
  const data = props.rolling;
  if (!data?.length) return null;
  const W = 760;
  const H = 180;
  const padL = 50;
  const padR = 30;
  const padT = 20;
  const padB = 35;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...data.map((d) => d.total), 1);
  const x = (i: number) =>
    padL + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.total)}`).join(' ');
  return (
    <div style={{ ...styles.card, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>7-Day Lead Trend (Fresh)</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#ddd" />
        <path d={path} stroke="#2563eb" strokeWidth={2} fill="none" />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.total)} r={d.is_focal ? 5 : 4} fill="#2563eb" />
            <text x={x(i)} y={y(d.total) - 8} fontSize={11} textAnchor="middle" fill="#111" fontWeight={700}>
              {d.total}
            </text>
            <text x={x(i)} y={H - 5} fontSize={10} textAnchor="middle" fill="#666">
              {d.weekday} {d.date.slice(8, 10)} {monthShort(d.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function monthShort(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10) - 1;
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] || '';
}

export function VolumeMethodologyPanel() {
  return (
    <div style={{ ...styles.card }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Methodology</div>
      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>
        <strong>Excluded from totals:</strong>
        <br />
        • analytics_source = 'referral' (operations referrals)
        <br />
        • source/initial_source contains "lead lost return" (sales reactivations)
        <br />
        <br />
        <strong>Total Leads:</strong> CRM fresh leads only.
        <br />
        <strong>Remart Leads:</strong> CRM channel = MOF Remarketing.
        <br />
        <br />
        <strong>TOF Attribution Weights:</strong>
        <br />
        • ManyChat / IG / YT / FB Organic: <strong>100%</strong>
        <br />
        • Google Ads: <strong>80%</strong> | SEO / Direct: <strong>75%</strong>
        <br />
        <br />
        <strong>Spend:</strong>
        <br />
        • Cold = C7 + C8 (utm_medium=cold/sandbox)
        <br />
        • MOF Remart = Remarketing campaign (C2)
        <br />
        • TOF = C3 + C5
        <br />
        • Overall CPL = (Cold+Remart+Google) ÷ Fresh Leads
      </div>
    </div>
  );
}

export function VolumeChannelTable(props: { volume: any }) {
  const v = props.volume;
  if (!v?.channel_breakdown?.length) return null;
  const sign = (n: number) => (n >= 0 ? '▲' : '▼');
  return (
    <Section title={`Channel-wise Breakdown — ${v.focal_date} vs Prev / 7D Avg`}>
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Channel</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Prev Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>7D Avg Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>7D Avg CPL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ Leads vs 7D</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ CPL vs 7D</th>
            </tr>
          </thead>
          <tbody>
            {v.channel_breakdown.map((c: any) => {
              const bg = c.is_summary_row ? '#fffbeb' : undefined;
              return (
                <tr key={c.channel} style={bg ? { background: bg } : undefined}>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{c.channel}</td>
                  <td style={styles.tdNum}>{c.leads}</td>
                  <td style={styles.tdNum}>
                    {c.spend !== null ? '₹' + fmt(c.spend) : '—'}
                  </td>
                  <td style={styles.tdNum}>{c.cpl !== null ? '₹' + fmt(c.cpl) : '—'}</td>
                  <td style={styles.tdNum}>{c.prev_leads}</td>
                  <td style={styles.tdNum}>{c.avg_leads_7d}</td>
                  <td style={styles.tdNum}>
                    {c.avg_cpl_7d !== null ? '₹' + fmt(c.avg_cpl_7d) : '—'}
                  </td>
                  <td style={styles.tdNum}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(c.delta_leads_vs_7d >= 0 ? styles.good : styles.bad),
                      }}
                    >
                      {sign(c.delta_leads_vs_7d)} {Math.abs(Math.round(c.delta_leads_vs_7d))}
                    </span>
                  </td>
                  <td style={styles.tdNum}>
                    {c.delta_cpl_vs_7d !== null ? (
                      <span
                        style={{
                          ...styles.badge,
                          ...(c.delta_cpl_vs_7d <= 0 ? styles.good : styles.bad),
                        }}
                      >
                        {sign(c.delta_cpl_vs_7d)} ₹{Math.abs(Math.round(c.delta_cpl_vs_7d))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
              <td style={styles.td}>TOTAL (CRM, fresh leads)</td>
              <td style={styles.tdNum}>{v.total_leads}</td>
              <td style={styles.tdNum}>₹{fmt(v.total_spend)}</td>
              <td style={styles.tdNum}>
                {v.total_leads > 0 ? '₹' + fmt(v.overall_cpl) : '—'}
              </td>
              <td style={styles.tdNum}>{v.prev_day.leads}</td>
              <td style={styles.tdNum}>{v.trailing_7d.avg_leads}</td>
              <td style={styles.tdNum}>₹{fmt(v.trailing_7d.avg_cpl)}</td>
              <td style={styles.tdNum}>—</td>
              <td style={styles.tdNum}>—</td>
            </tr>
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function MofRemartDailyTable(props: { mof: any }) {
  const m = props.mof;
  if (!m?.daily?.length) return null;
  return (
    <Section title="MOF Remarketing — Daily">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Day</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPL</th>
            </tr>
          </thead>
          <tbody>
            {m.daily.map((d: any) => (
              <tr
                key={d.date}
                style={d.is_focal ? { background: '#fffbeb', fontWeight: 600 } : undefined}
              >
                <td style={styles.td}>
                  <strong>
                    {d.weekday} {d.date.slice(8, 10)} {monthShort(d.date)}
                  </strong>
                </td>
                <td style={styles.tdNum}>{d.leads}</td>
                <td style={styles.tdNum}>₹{fmt(d.spend)}</td>
                <td style={styles.tdNum}>{d.leads > 0 ? '₹' + fmt(d.cpl) : '—'}</td>
              </tr>
            ))}
            <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
              <td style={styles.td}>7D Total / Avg</td>
              <td style={styles.tdNum}>
                {m.trailing_7d.leads + m.leads}
              </td>
              <td style={styles.tdNum}>₹{fmt(m.trailing_7d.spend + m.spend)}</td>
              <td style={styles.tdNum}>
                {m.trailing_7d.leads + m.leads > 0
                  ? '₹' +
                    fmt((m.trailing_7d.spend + m.spend) / (m.trailing_7d.leads + m.leads))
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function TOFAttributionTable(props: { tof: any }) {
  const t = props.tof;
  if (!t?.sub_channels?.length) return null;
  const sign = (n: number) => (n >= 0 ? '▲' : '▼');
  return (
    <Section title="TOF Attribution Summary">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Sub-Channel</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Weight</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Attributed</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ vs Prev</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>7D Avg</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ vs 7D</th>
            </tr>
          </thead>
          <tbody>
            {t.sub_channels.map((s: any) => (
              <tr key={s.sub_channel}>
                <td style={{ ...styles.td, fontWeight: 700 }}>{s.sub_channel}</td>
                <td style={styles.tdNum}>{(s.weight * 100).toFixed(0)}%</td>
                <td style={styles.tdNum}>{s.leads}</td>
                <td style={styles.tdNum}>{s.attributed.toFixed(1)}</td>
                <td style={styles.tdNum}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(s.delta_vs_prev >= 0 ? styles.good : styles.bad),
                    }}
                  >
                    {sign(s.delta_vs_prev)} {Math.abs(s.delta_vs_prev).toFixed(1)}
                  </span>
                </td>
                <td style={styles.tdNum}>{s.avg_7d.toFixed(1)}</td>
                <td style={styles.tdNum}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(s.delta_vs_7d >= 0 ? styles.good : styles.bad),
                    }}
                  >
                    {sign(s.delta_vs_7d)} {Math.abs(s.delta_vs_7d).toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
            <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
              <td style={styles.td}>TOTAL TOF Attributed</td>
              <td style={styles.tdNum}>—</td>
              <td style={styles.tdNum}>{t.leads}</td>
              <td style={styles.tdNum}>{t.attributed.toFixed(1)}</td>
              <td style={styles.tdNum}>—</td>
              <td style={styles.tdNum}>{t.avg_attributed_7d.toFixed(1)}</td>
              <td style={styles.tdNum}>—</td>
            </tr>
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function RollingChannelTrendTable(props: { rolling: any[] }) {
  if (!props.rolling?.length) return null;
  const totals = props.rolling.reduce(
    (acc, d) => ({
      cold_meta: acc.cold_meta + d.cold_meta,
      remart_meta: acc.remart_meta + d.remart_meta,
      manychat: acc.manychat + d.manychat,
      google_ads: acc.google_ads + d.google_ads,
      youtube: acc.youtube + d.youtube,
      instagram: acc.instagram + d.instagram,
      seo_direct: acc.seo_direct + d.seo_direct,
      others: acc.others + d.others,
      total: acc.total + d.total,
    }),
    {
      cold_meta: 0,
      remart_meta: 0,
      manychat: 0,
      google_ads: 0,
      youtube: 0,
      instagram: 0,
      seo_direct: 0,
      others: 0,
      total: 0,
    }
  );
  return (
    <Section title="Rolling 7-Day Trend — Fresh Leads by Channel">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Cold Meta</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Remart (Meta)</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>ManyChat</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Google</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>YouTube</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Instagram</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>SEO/Direct</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Others</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {props.rolling.map((d: any) => (
              <tr
                key={d.date}
                style={d.is_focal ? { background: '#fffbeb', fontWeight: 700 } : undefined}
              >
                <td style={styles.td}>
                  <strong>
                    {d.weekday} {d.date.slice(8, 10)} {monthShort(d.date)}
                  </strong>
                </td>
                <td style={styles.tdNum}>{d.cold_meta}</td>
                <td style={styles.tdNum}>{d.remart_meta}</td>
                <td style={styles.tdNum}>{d.manychat}</td>
                <td style={styles.tdNum}>{d.google_ads}</td>
                <td style={styles.tdNum}>{d.youtube}</td>
                <td style={styles.tdNum}>{d.instagram}</td>
                <td style={styles.tdNum}>{d.seo_direct}</td>
                <td style={styles.tdNum}>{d.others}</td>
                <td style={styles.tdNum}>
                  <strong>{d.total}</strong>
                </td>
              </tr>
            ))}
            <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
              <td style={styles.td}>7D Total</td>
              <td style={styles.tdNum}>{totals.cold_meta}</td>
              <td style={styles.tdNum}>{totals.remart_meta}</td>
              <td style={styles.tdNum}>{totals.manychat}</td>
              <td style={styles.tdNum}>{totals.google_ads}</td>
              <td style={styles.tdNum}>{totals.youtube}</td>
              <td style={styles.tdNum}>{totals.instagram}</td>
              <td style={styles.tdNum}>{totals.seo_direct}</td>
              <td style={styles.tdNum}>{totals.others}</td>
              <td style={styles.tdNum}>{totals.total}</td>
            </tr>
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

// ===========================================================================
// QUALITY DASHBOARD COMPONENTS — match the canonical Lead Quality Report skill
// ===========================================================================

export function QualitySummaryCards(props: { quality: any }) {
  const q = props.quality;
  if (!q) return null;
  const fmtDate = (s: string) => {
    if (!s) return '—';
    const d = new Date(s + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
  const sign = (n: number) => (n >= 0 ? '+' : '');
  const badPos = (delta: number) => delta < 0;
  const badNeg = (delta: number) => delta > 0;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}
    >
      {/* Card 1: Leads Booked */}
      <div style={styles.card}>
        <div style={styles.k}>Leads</div>
        <div style={styles.v}>{q.leads}</div>
        <div style={styles.d}>
          vs Prev ({fmtDate(q.prev_day.date)}):{' '}
          <span style={{ ...styles.badge, ...(badPos(q.delta_leads_vs_prev) ? styles.bad : styles.good) }}>
            {sign(q.delta_leads_vs_prev)}{q.delta_leads_vs_prev}
          </span>
          <br />
          vs 7D Avg ({(q.trailing_7d.leads / 7).toFixed(0)}):{' '}
          <span style={{ ...styles.badge, ...(badPos(q.delta_leads_vs_7d_avg) ? styles.bad : styles.good) }}>
            {sign(q.delta_leads_vs_7d_avg)}{q.delta_leads_vs_7d_avg}
          </span>
        </div>
      </div>
      {/* Card 2: Qualified */}
      <div style={styles.card}>
        <div style={styles.k}>Qualified ({q.qualified_rate.toFixed(1)}%)</div>
        <div style={styles.v}>{q.qualified}</div>
        <div style={styles.d}>
          CPQL ₹{fmt(q.cpql)}
          <br />
          vs 7D CPQL:{' '}
          <span style={{ ...styles.badge, ...(badNeg(q.delta_cpql_vs_7d) ? styles.bad : styles.good) }}>
            ₹{sign(q.delta_cpql_vs_7d)}{fmt(q.delta_cpql_vs_7d)}
          </span>
        </div>
      </div>
      {/* Card 3: Good */}
      <div style={styles.card}>
        <div style={styles.k}>Good ({q.good_rate.toFixed(1)}%)</div>
        <div style={styles.v}>{q.good}</div>
        <div style={styles.d}>
          CPGL ₹{fmt(q.cpgl)}
          {q.ss_pending_count > 0 && (
            <>
              <br />
              {q.ss_pending_count} SS leads pending grading
            </>
          )}
        </div>
      </div>
      {/* Card 4: Projected Good (only if SS pending) */}
      {q.ss_pending_count > 0 && (
        <div style={{ ...styles.card, background: '#fefce8', borderColor: '#fde68a' }}>
          <div style={styles.k}>Proj. Good (w/ SS)</div>
          <div style={styles.v}>{q.ss_projection.projected_total_good.toFixed(1)}</div>
          <div style={styles.d}>
            Proj. CPGL ₹{fmt(q.ss_projection.projected_cpgl)}
            <br />
            Proj. Good Rate {q.ss_projection.projected_good_rate.toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

export function QualityTrendSVG(props: { daily: any[] }) {
  const data = props.daily;
  if (!data?.length) return null;
  const W = 500;
  const H = 180;
  const padL = 30;
  const padR = 30;
  const padT = 20;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxRate = Math.max(
    ...data.map((d) => Math.max(d.qualified_rate, d.good_rate)),
    1
  );
  const x = (i: number) =>
    padL + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (rate: number) => padT + innerH - (rate / maxRate) * innerH;
  const goodPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.good_rate)}`).join(' ');
  const qualPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.qualified_rate)}`).join(' ');
  return (
    <div style={{ ...styles.card, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        7-Day Quality Trend
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 220 }}>
        <path d={qualPath} stroke="#9ca3af" strokeWidth={2} strokeDasharray="6 3" fill="none" />
        <path d={goodPath} stroke="#16794c" strokeWidth={2.5} fill="none" />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.good_rate)} r={d.is_focal ? 5 : 3.5} fill="#16794c" />
            <text
              x={x(i)}
              y={y(d.good_rate) - 8}
              fontSize={10}
              textAnchor="middle"
              fill="#16794c"
            >
              {Math.round(d.good_rate)}%
            </text>
            <text x={x(i)} y={H - 5} fontSize={9} textAnchor="middle" fill="#888">
              {d.date.slice(5)} {d.weekday}
            </text>
          </g>
        ))}
        <text x={W - 70} y={15} fontSize={10} fill="#16794c">
          — Good%
        </text>
        <text x={W - 70} y={28} fontSize={10} fill="#9ca3af">
          --- Qual%
        </text>
      </svg>
    </div>
  );
}

export function QualityDefinitionsPanel() {
  return (
    <div style={{ ...styles.card }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Quality Definitions</div>
      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6 }}>
        <strong>Qualified</strong> = Reached "Calls today" (connected with support)
        <br />
        <strong>Good</strong> = Pressure Sell / Ultra-hot / Token / Lead won
        <br />
        <br />
        <strong>SS Projection</strong> = good_today + SS_count × (prior 6D good-given-qual rate)
        <br />
        <strong>CPQL/CPGL</strong> = LeadGen spend ÷ Qual/Good leads of the booking date
      </div>
    </div>
  );
}

export function CPQLCPGLTable(props: { quality: any }) {
  const q = props.quality;
  if (!q) return null;
  const fmtDate = (s: string) => {
    if (!s) return '—';
    const d = new Date(s + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
      timeZone: 'UTC',
    });
  };
  const rows = [
    {
      label: 'CPQL',
      focal: q.cpql,
      prev: q.prev_day.cpql,
      d7: q.trailing_7d.cpql,
      dPrev: q.delta_cpql_vs_prev,
      d7Delta: q.delta_cpql_vs_7d,
    },
    {
      label: 'CPGL (current)',
      focal: q.cpgl,
      prev: q.prev_day.cpgl,
      d7: q.trailing_7d.cpgl,
      dPrev: q.delta_cpgl_vs_prev,
      d7Delta: q.delta_cpgl_vs_7d,
    },
  ];
  return (
    <Section title={`CPQL / CPGL (LeadGen Spend: ₹${fmt(q.spend_leadgen)} | 7D LeadGen: ₹${fmt(q.trailing_7d.spend_leadgen)})`}>
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Metric</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>{fmtDate(q.focal_date)}</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>{fmtDate(q.prev_day.date)}</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>7D Avg</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ vs Prev</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ vs 7D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={styles.td}>{r.label}</td>
                <td style={styles.tdNum}>{r.focal > 0 ? '₹' + fmt(r.focal) : '—'}</td>
                <td style={styles.tdNum}>{r.prev > 0 ? '₹' + fmt(r.prev) : '—'}</td>
                <td style={styles.tdNum}>{r.d7 > 0 ? '₹' + fmt(r.d7) : '—'}</td>
                <td style={styles.tdNum}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(r.dPrev > 0 ? styles.bad : styles.good),
                    }}
                  >
                    ₹{r.dPrev >= 0 ? '+' : ''}
                    {fmt(r.dPrev)}
                  </span>
                </td>
                <td style={styles.tdNum}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(r.d7Delta > 0 ? styles.bad : styles.good),
                    }}
                  >
                    ₹{r.d7Delta >= 0 ? '+' : ''}
                    {fmt(r.d7Delta)}
                  </span>
                </td>
              </tr>
            ))}
            {q.ss_pending_count > 0 && (
              <tr style={{ background: '#fefce8', fontStyle: 'italic' }}>
                <td style={styles.td}>CPGL (Projected w/ SS)</td>
                <td style={styles.tdNum}>₹{fmt(q.ss_projection.projected_cpgl)}</td>
                <td style={styles.tdNum}>—</td>
                <td style={styles.tdNum}>—</td>
                <td style={styles.tdNum}>—</td>
                <td style={styles.tdNum}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function QualityChannelTable(props: { channels: any[]; quality: any }) {
  if (!props.channels?.length) return null;
  const q = props.quality;
  const totalLeads = props.channels.reduce((s, c) => s + c.leads, 0);
  const totalQual = props.channels.reduce((s, c) => s + c.qualified, 0);
  const totalGood = props.channels.reduce((s, c) => s + c.good, 0);
  const total7d = props.channels.reduce((s, c) => s + c.leads_7d, 0);
  const totalQualRate = totalLeads > 0 ? (totalQual / totalLeads) * 100 : 0;
  const totalGoodRate = totalLeads > 0 ? (totalGood / totalLeads) * 100 : 0;
  const total7dQualRate =
    q?.trailing_7d?.qualified_rate ?? 0;
  const total7dGoodRate =
    q?.trailing_7d?.good_rate ?? 0;
  const sign = (n: number) => (n >= 0 ? '+' : '');
  return (
    <Section title="Channel Quality">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Channel</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual %</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good %</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>7D Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ Qual% vs 7D</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Δ Good% vs 7D</th>
            </tr>
          </thead>
          <tbody>
            {props.channels.map((c) => (
              <tr key={c.channel}>
                <td style={{ ...styles.td, fontWeight: 700 }}>{c.channel}</td>
                <td style={styles.tdNum}>{c.leads}</td>
                <td style={styles.tdNum}>{c.qualified}</td>
                <td style={styles.tdNum}>{c.good}</td>
                <td style={styles.tdNum}>{c.qualified_rate.toFixed(1)}%</td>
                <td style={styles.tdNum}>{c.good_rate.toFixed(1)}%</td>
                <td style={styles.tdNum}>{c.leads_7d}</td>
                <td style={styles.tdNum}>
                  <span style={{ ...styles.badge, ...(c.delta_qual_pp >= 0 ? styles.good : styles.bad) }}>
                    {sign(c.delta_qual_pp)}{c.delta_qual_pp.toFixed(1)}pp
                  </span>
                </td>
                <td style={styles.tdNum}>
                  <span style={{ ...styles.badge, ...(c.delta_good_pp >= 0 ? styles.good : styles.bad) }}>
                    {sign(c.delta_good_pp)}{c.delta_good_pp.toFixed(1)}pp
                  </span>
                </td>
              </tr>
            ))}
            <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
              <td style={styles.td}>TOTAL</td>
              <td style={styles.tdNum}>{totalLeads}</td>
              <td style={styles.tdNum}>{totalQual}</td>
              <td style={styles.tdNum}>{totalGood}</td>
              <td style={styles.tdNum}>{totalQualRate.toFixed(1)}%</td>
              <td style={styles.tdNum}>{totalGoodRate.toFixed(1)}%</td>
              <td style={styles.tdNum}>{total7d}</td>
              <td style={styles.tdNum}>
                <span style={{ ...styles.badge, ...(totalQualRate >= total7dQualRate ? styles.good : styles.bad) }}>
                  {sign(totalQualRate - total7dQualRate)}{(totalQualRate - total7dQualRate).toFixed(1)}pp
                </span>
              </td>
              <td style={styles.tdNum}>
                <span style={{ ...styles.badge, ...(totalGoodRate >= total7dGoodRate ? styles.good : styles.bad) }}>
                  {sign(totalGoodRate - total7dGoodRate)}{(totalGoodRate - total7dGoodRate).toFixed(1)}pp
                </span>
              </td>
            </tr>
            {q?.ss_pending_count > 0 && (
              <tr style={{ background: '#fefce8', fontStyle: 'italic' }}>
                <td style={styles.td}>TOTAL (Projected)</td>
                <td style={styles.tdNum}>{totalLeads}</td>
                <td style={styles.tdNum}>{totalQual}</td>
                <td style={styles.tdNum}>{q.ss_projection.projected_total_good.toFixed(1)}</td>
                <td style={styles.tdNum}>{totalQualRate.toFixed(1)}%</td>
                <td style={styles.tdNum}>{q.ss_projection.projected_good_rate.toFixed(1)}%</td>
                <td style={styles.tdNum}>—</td>
                <td style={styles.tdNum}>—</td>
                <td style={styles.tdNum}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function StageDistributionWithCategories(props: { stages: any[] }) {
  if (!props.stages?.length) return null;
  const totalLeads = props.stages.reduce((s, st) => s + st.count, 0);
  const totalShown = totalLeads;
  const rowBg = (cat: string) => {
    if (cat === 'HIGH_INTENT' || cat === 'OUTCOME_WON') return '#f0fdf4';
    if (cat === 'DISQUALIFIED' || cat === 'CONTACT_FAILED' || cat === 'OUTCOME_LOST')
      return '#fef3c7';
    return undefined;
  };
  return (
    <Section title="Stage Distribution">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Stage</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>% of Total</th>
              <th style={styles.th}>Category</th>
            </tr>
          </thead>
          <tbody>
            {props.stages.map((s) => (
              <tr key={s.stage} style={{ background: rowBg(s.category) }}>
                <td style={styles.td}>{s.stage}</td>
                <td style={styles.tdNum}>{s.count}</td>
                <td style={styles.tdNum}>{s.pct.toFixed(1)}%</td>
                <td style={styles.td}>{s.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
        Distribution is across {totalShown} leads on the focal day (booking-date scoped).
      </div>
    </Section>
  );
}

export function QualityRollingTable(props: { daily: any[] }) {
  if (!props.daily?.length) return null;
  const totalLeads = props.daily.reduce((s, d) => s + d.leads, 0);
  const totalQual = props.daily.reduce((s, d) => s + d.qualified, 0);
  const totalGood = props.daily.reduce((s, d) => s + d.good, 0);
  const totalQualRate = totalLeads > 0 ? (totalQual / totalLeads) * 100 : 0;
  const totalGoodRate = totalLeads > 0 ? (totalGood / totalLeads) * 100 : 0;
  return (
    <Section title="Rolling 7-Day Quality Trend">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual %</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good %</th>
            </tr>
          </thead>
          <tbody>
            {props.daily.map((d) => {
              const date = new Date(d.date + 'T00:00:00Z');
              const label = `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ${d.weekday}`;
              return (
                <tr
                  key={d.date}
                  style={d.is_focal ? { background: '#f0fdf4', fontWeight: 600 } : undefined}
                >
                  <td style={styles.td}>
                    <strong>{label}</strong>
                    {d.is_focal && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626', fontWeight: 700 }}>◆</span>
                    )}
                  </td>
                  <td style={styles.tdNum}>{d.leads}</td>
                  <td style={styles.tdNum}>{d.qualified}</td>
                  <td style={styles.tdNum}>{d.good}</td>
                  <td style={styles.tdNum}>{d.qualified_rate.toFixed(1)}%</td>
                  <td style={styles.tdNum}>{d.good_rate.toFixed(1)}%</td>
                </tr>
              );
            })}
            <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
              <td style={styles.td}>7D TOTAL</td>
              <td style={styles.tdNum}>{totalLeads}</td>
              <td style={styles.tdNum}>{totalQual}</td>
              <td style={styles.tdNum}>{totalGood}</td>
              <td style={styles.tdNum}>{totalQualRate.toFixed(1)}%</td>
              <td style={styles.tdNum}>{totalGoodRate.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </ScrollX>
    </Section>
  );
}

export function QualityInsightsPanel(props: { bullets?: string[] }) {
  if (!props.bullets?.length) return null;
  return (
    <Section title="Key Insights">
      <div style={{ ...styles.card, padding: 12, background: '#fafafa' }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {props.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Focal Day Cards — snapshot of the specific day being audited
// ---------------------------------------------------------------------------
export function FocalDayCards(props: {
  focalDate: string;
  daily: any[];
  dateField: string;
}) {
  const row = props.daily.find((d) => d.date === props.focalDate);
  if (!row) return null;
  const dfLabel = props.dateField === 'booked_at' ? 'booked' : 'created';
  const cards = [
    {
      k: `Leads ${dfLabel} that day`,
      v: fmt(row.leads),
      d: `${row.qualified} qualified · ${row.good} good`,
    },
    {
      k: 'Spend that day',
      v: '₹' + fmt(row.spend_total),
      d: `Meta ₹${fmt(row.spend_meta)} · Google ₹${fmt(row.spend_google)}`,
    },
    {
      k: 'CPL',
      v: row.cpl > 0 ? '₹' + fmt(row.cpl) : '—',
      d: 'spend ÷ leads',
    },
    {
      k: 'CPQL',
      v: row.cpql > 0 ? '₹' + fmt(row.cpql) : '—',
      d: 'cost per qualified lead',
    },
    {
      k: 'CTR',
      v: row.ctr > 0 ? row.ctr + '%' : '—',
      d: `freq ${fmt(row.frequency)} · CPM ₹${fmt(row.cpm)}`,
    },
    {
      k: 'Impressions',
      v: fmt(row.impressions),
      d: `${row.leads > 0 ? fmt(row.impressions / row.leads) : '—'} impr / lead`,
    },
  ];
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          color: '#666',
          margin: '4px 0 6px',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        Focal day — {props.focalDate}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.k}
            style={{
              ...styles.card,
              borderColor: '#fde68a',
              background: '#fffbeb',
            }}
          >
            <div style={styles.k}>{c.k}</div>
            <div style={styles.v}>{c.v}</div>
            <div style={styles.d}>{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Trend SVG chart — leads (line) + spend (line) + focal day marker
// ---------------------------------------------------------------------------
export function TrendChart(props: {
  daily: Array<{ date: string; leads: number; spend_total: number }>;
  focalDate?: string;
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
        {/* Focal day vertical marker */}
        {props.focalDate &&
          (() => {
            const idx = data.findIndex((d) => d.date === props.focalDate);
            if (idx < 0) return null;
            const fx = x(idx);
            return (
              <g>
                <line
                  x1={fx}
                  y1={PAD_T}
                  x2={fx}
                  y2={PAD_T + innerH}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  opacity={0.6}
                />
                <text
                  x={fx}
                  y={PAD_T - 4}
                  fontSize={10}
                  fill="#dc2626"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  focal
                </text>
              </g>
            );
          })()}
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

export function DailyTrendTable(props: {
  daily: Array<any>;
  focalDate?: string;
}) {
  if (!props.daily?.length) return null;
  return (
    <Section title="Daily breakdown">
      <ScrollX>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Qual</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Good</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend Meta</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend Google</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Spend Total</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPQL</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CTR</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>CPM</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Freq</th>
            </tr>
          </thead>
          <tbody>
            {props.daily.map((d) => {
              const isFocal = d.date === props.focalDate;
              return (
                <tr
                  key={d.date}
                  style={
                    isFocal
                      ? { background: '#fffbeb', fontWeight: 600 }
                      : undefined
                  }
                >
                  <td style={styles.td}>
                    {d.date}
                    {isFocal && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: '#dc2626',
                          fontWeight: 700,
                        }}
                      >
                        ◆ focal
                      </span>
                    )}
                  </td>
                  <td style={styles.tdNum}>{d.leads}</td>
                  <td style={styles.tdNum}>{d.qualified}</td>
                  <td style={styles.tdNum}>{d.good}</td>
                  <td style={styles.tdNum}>₹{fmt(d.spend_meta)}</td>
                  <td style={styles.tdNum}>₹{fmt(d.spend_google)}</td>
                  <td style={styles.tdNum}>₹{fmt(d.spend_total)}</td>
                  <td style={styles.tdNum}>{d.cpl > 0 ? '₹' + fmt(d.cpl) : '—'}</td>
                  <td style={styles.tdNum}>{d.cpql > 0 ? '₹' + fmt(d.cpql) : '—'}</td>
                  <td style={styles.tdNum}>{d.ctr > 0 ? d.ctr + '%' : '—'}</td>
                  <td style={styles.tdNum}>{d.cpm > 0 ? '₹' + fmt(d.cpm) : '—'}</td>
                  <td style={styles.tdNum}>{fmt(d.frequency)}</td>
                </tr>
              );
            })}
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
