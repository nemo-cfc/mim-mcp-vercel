'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('en-IN');
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function ThemesPanel(props: { data: any }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [hours, setHours] = useState(props.data.window_hours);

  function apply(newHours: number) {
    setHours(newHours);
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set('hours', String(newHours));
    startTransition(() => router.push(`/dashboard/themes?${next.toString()}`));
  }

  const totals = props.data.totals;
  return (
    <>
      {/* Window controls */}
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
        <span style={{ fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>
          Window
        </span>
        {[1, 2, 4, 8, 12, 24].map((h) => {
          const active = h === hours;
          return (
            <button
              key={h}
              onClick={() => apply(h)}
              disabled={pending}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid #ddd',
                borderRadius: 8,
                background: active ? '#111' : '#fff',
                color: active ? '#fff' : '#444',
                cursor: pending ? 'wait' : 'pointer',
              }}
            >
              {h}h
            </button>
          );
        })}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#444' }}>
          <strong>{totals.active}</strong> active · <strong>{totals.inactive}</strong> inactive ·
          spend <strong>₹{fmt(totals.recent_spend)}</strong> in window
        </div>
      </div>

      {/* Notes banner */}
      {props.data.notes?.length > 0 && (
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
            {props.data.notes.map((n: string, i: number) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Theme cards */}
      <div style={{ display: 'grid', gap: 12 }}>
        {props.data.themes
          .filter((t: any) => t.total_ad_count > 0 || t.theme === 'Other')
          .map((t: any) => (
            <ThemeCard key={t.theme} theme={t} totalSpend={totals.recent_spend} />
          ))}
      </div>
    </>
  );
}

function ThemeCard(props: { theme: any; totalSpend: number }) {
  const [expanded, setExpanded] = useState(false);
  const t = props.theme;
  const sharePct = props.totalSpend > 0 ? (t.recent_spend / props.totalSpend) * 100 : 0;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 14,
        padding: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t.theme}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            ₹{fmt(t.recent_spend)} spent ({sharePct.toFixed(1)}% of window) ·{' '}
            {fmt(t.recent_impressions)} impressions
          </div>
        </div>
        <Pill label="Active" value={t.active_ad_count} color="good" />
        <Pill label="Inactive" value={t.inactive_ad_count} color="muted" />
        <Pill label="Total" value={t.total_ad_count} color="neutral" />
        {(t.active_ad_count > 0 || t.inactive_ad_count > 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 600,
              background: '#fafafa',
              border: '1px solid #ddd',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide ads' : 'Show ads'}
          </button>
        )}
      </div>

      {/* Drilldown */}
      {expanded && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <AdList
            title={`Active ads (${t.active_ad_count})`}
            ads={t.active_ads}
            mode="active"
            emptyText="None — no ads in this theme spent in the window"
          />
          <AdList
            title={`Inactive ads (${t.inactive_ad_count})`}
            ads={t.inactive_ads}
            mode="inactive"
            emptyText="None — all ads in this theme are spending"
          />
        </div>
      )}
    </div>
  );
}

function AdList(props: {
  title: string;
  ads: any[];
  mode: 'active' | 'inactive';
  emptyText: string;
}) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#444' }}>
        {props.title}
      </div>
      {props.ads.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>{props.emptyText}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {props.ads.map((a: any) => (
            <li
              key={a.ad_id}
              style={{
                padding: '6px 8px',
                fontSize: 12,
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={a.ad_name}
              >
                {a.ad_name || '(unnamed)'}
              </span>
              {props.mode === 'active' ? (
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: '#0369a1',
                    fontWeight: 600,
                  }}
                >
                  ₹{fmt(a.spend)}
                </span>
              ) : (
                <StatusChip status={a.effective_status} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill(props: { label: string; value: number; color: 'good' | 'muted' | 'neutral' }) {
  const palette: Record<string, React.CSSProperties> = {
    good: { background: '#dcfce7', color: '#15803d' },
    muted: { background: '#f5f5f5', color: '#666' },
    neutral: { background: '#e0f2fe', color: '#0369a1' },
  };
  return (
    <div
      style={{
        ...palette[props.color],
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        gap: 6,
        alignItems: 'baseline',
      }}
    >
      <span style={{ opacity: 0.7, fontWeight: 600 }}>{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

function StatusChip(props: { status?: string }) {
  if (!props.status || props.status === 'UNKNOWN') {
    return <span style={{ fontSize: 11, color: '#888' }}>—</span>;
  }
  const palette: Record<string, React.CSSProperties> = {
    ACTIVE: { background: '#dcfce7', color: '#15803d' },
    PAUSED: { background: '#f5f5f5', color: '#444' },
    CAMPAIGN_PAUSED: { background: '#f5f5f5', color: '#444' },
    ADSET_PAUSED: { background: '#f5f5f5', color: '#444' },
    DELETED: { background: '#fee2e2', color: '#b91c1c' },
    ARCHIVED: { background: '#f5f5f5', color: '#666' },
    DISAPPROVED: { background: '#fee2e2', color: '#b91c1c' },
    PENDING_REVIEW: { background: '#fef3c7', color: '#92400e' },
    WITH_ISSUES: { background: '#fef3c7', color: '#92400e' },
    IN_PROCESS: { background: '#e0f2fe', color: '#0369a1' },
  };
  const s = palette[props.status] || palette.PAUSED;
  const label =
    props.status === 'CAMPAIGN_PAUSED'
      ? 'PAUSED (camp.)'
      : props.status === 'ADSET_PAUSED'
      ? 'PAUSED (adset)'
      : props.status.replace(/_/g, ' ');
  return (
    <span
      style={{
        ...s,
        padding: '3px 8px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 10,
      }}
    >
      {label}
    </span>
  );
}
