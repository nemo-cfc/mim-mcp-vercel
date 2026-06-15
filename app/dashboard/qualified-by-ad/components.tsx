'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (n === 0) return '·';
  return String(n);
}

export function DateControls(props: {
  from: string;
  to: string;
  dateField: 'created_at' | 'booked_at';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [dateField, setDateField] = useState(props.dateField);

  function apply() {
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    params.set('date_field', dateField);
    startTransition(() => router.push(`/dashboard/qualified-by-ad?${params.toString()}`));
  }

  function refreshPreviews() {
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    params.set('date_field', dateField);
    params.set('refresh', '1');
    startTransition(() => router.push(`/dashboard/qualified-by-ad?${params.toString()}`));
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 14,
        padding: '12px 14px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <label style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>From</label>
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        disabled={pending}
        style={{
          padding: '6px 10px',
          fontSize: 12,
          border: '1px solid #ddd',
          borderRadius: 8,
        }}
      />
      <label style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>To</label>
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        disabled={pending}
        style={{
          padding: '6px 10px',
          fontSize: 12,
          border: '1px solid #ddd',
          borderRadius: 8,
        }}
      />
      <label style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Group by</label>
      <select
        value={dateField}
        onChange={(e) => setDateField(e.target.value as any)}
        disabled={pending}
        style={{
          padding: '6px 10px',
          fontSize: 12,
          border: '1px solid #ddd',
          borderRadius: 8,
        }}
      >
        <option value="created_at">created at</option>
        <option value="booked_at">booked at</option>
      </select>
      <button
        onClick={apply}
        disabled={pending}
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        Apply
      </button>
      <button
        onClick={refreshPreviews}
        disabled={pending}
        title="Re-fetch all Meta preview URLs (use if any 'View ad' links are broken)"
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          background: '#fafafa',
          color: '#444',
          border: '1px solid #ddd',
          borderRadius: 8,
          cursor: pending ? 'wait' : 'pointer',
          marginLeft: 'auto',
        }}
      >
        🔄 Refresh all preview URLs
      </button>
    </div>
  );
}

export function QualifiedByAdTable(props: { data: any }) {
  const { stages, rows } = props.data;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 14,
        padding: 0,
        overflow: 'auto',
      }}
    >
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 1 }}>
            <th style={th('left', 320, true)}>Ad / Source</th>
            <th style={th('right', 70)}>Total</th>
            {stages.map((s: string) => (
              <th key={s} style={th('right', 92)}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={stages.length + 2} style={{ ...td(), color: '#888', fontStyle: 'italic', textAlign: 'center', padding: 24 }}>
                No qualified leads in the selected window.
              </td>
            </tr>
          )}
          {rows.map((r: any, idx: number) => (
            <AdRow key={`${r.ad_id || 'ch'}:${idx}`} row={r} stages={stages} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdRow(props: { row: any; stages: string[] }) {
  const [refreshing, setRefreshing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(props.row.preview_url);
  const [cached, setCached] = useState(props.row.preview_cached);

  async function refreshOne() {
    if (!props.row.is_meta || !props.row.ad_id) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/refresh-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: props.row.ad_id }),
      });
      const j = await res.json();
      if (j.permalink_url) {
        setPreviewUrl(j.permalink_url);
        setCached(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  }

  const isMeta = props.row.is_meta;

  return (
    <tr style={{ borderTop: '1px solid #eee' }}>
      <td style={td('left', 320, true)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isMeta && previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#0369a1',
                  textDecoration: 'none',
                  fontWeight: 600,
                  flex: 1,
                  wordBreak: 'break-word',
                }}
                title={previewUrl}
              >
                {props.row.ad_name || `(ad ${props.row.ad_id})`}
              </a>
            ) : (
              <span style={{ flex: 1, fontWeight: isMeta ? 600 : 500, color: isMeta ? '#111' : '#666' }}>
                {props.row.ad_name}
              </span>
            )}
            {isMeta && (
              <button
                onClick={refreshOne}
                disabled={refreshing}
                title="Re-fetch this ad's preview URL"
                style={{
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 600,
                  background: refreshing ? '#eee' : '#fafafa',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: refreshing ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {refreshing ? '...' : '🔄'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {props.row.channel}
            {props.row.ad_id && <> · <code style={{ fontSize: 10 }}>{props.row.ad_id}</code></>}
            {isMeta && cached && <> · <span style={{ color: '#aaa' }}>cached</span></>}
          </div>
        </div>
      </td>
      <td style={td('right', 70, true)}>
        <strong>{props.row.total_qualified}</strong>
      </td>
      {props.stages.map((s: string) => {
        const v = props.row.stages?.[s] || 0;
        return (
          <td key={s} style={{ ...td('right', 92), color: v === 0 ? '#bbb' : '#111', fontWeight: v > 0 ? 600 : 400 }}>
            {fmt(v)}
          </td>
        );
      })}
    </tr>
  );
}

function th(align: 'left' | 'right', width?: number, sticky?: boolean): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 12px',
    fontWeight: 700,
    fontSize: 12,
    color: '#444',
    borderBottom: '1px solid #eee',
    background: '#fafafa',
    width,
    minWidth: width,
    ...(sticky ? { position: 'sticky', left: 0, zIndex: 2 } : {}),
  };
}

function td(align: 'left' | 'right' = 'left', width?: number, sticky?: boolean): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 12px',
    fontVariantNumeric: 'tabular-nums',
    width,
    minWidth: width,
    ...(sticky ? { position: 'sticky', left: 0, background: '#fff', zIndex: 1 } : {}),
  };
}
