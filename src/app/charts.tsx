import { useEffect, useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BurndownPoint, VelocityPoint, WorkloadRow } from '../domain/metrics'
import { shortDate } from '../domain/dates'

/* ---------- theme ---------- */

export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

export interface ChartPalette {
  series: string[]
  neutral: string
  grid: string
  axis: string
  text: string
  surface: string
}

export function useChartPalette(): ChartPalette {
  const dark = useIsDark()
  return useMemo(
    () =>
      dark
        ? { series: ['#3987e5', '#d95926', '#199e70', '#c98500'], neutral: '#8a8984', grid: '#334155', axis: '#475569', text: '#cbd5e1', surface: '#0f172a' }
        : { series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], neutral: '#8a8984', grid: '#e2e8f0', axis: '#cbd5e1', text: '#475569', surface: '#ffffff' },
    [dark],
  )
}

function tooltipStyle(p: ChartPalette) {
  return {
    contentStyle: { background: p.surface, border: `1px solid ${p.grid}`, borderRadius: 8, fontSize: 12, color: p.text },
    labelStyle: { color: p.text, fontWeight: 600 },
    itemStyle: { color: p.text },
  }
}

const tick = (p: ChartPalette) => ({ fontSize: 11, fill: p.text })

/* ---------- Burndown ---------- */

export function BurndownChart({ data, height = 260 }: { data: BurndownPoint[]; height?: number }) {
  const p = useChartPalette()
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={p.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick(p)} axisLine={{ stroke: p.axis }} tickLine={false} />
        <YAxis tick={tick(p)} axisLine={false} tickLine={false} allowDecimals={false} unit=" SP" width={56} />
        <Tooltip {...tooltipStyle(p)} formatter={(v) => (v === null || v === undefined ? '—' : `${v} SP`)} />
        <Legend wrapperStyle={{ fontSize: 12, color: p.text }} />
        <Area type="stepAfter" dataKey="scope" name="Scope" fill={p.neutral} fillOpacity={0.08} stroke="none" isAnimationActive={false} />
        <Line type="linear" dataKey="ideal" name="Ideal" stroke={p.neutral} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="actual" name="Remaining" stroke={p.series[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: p.surface }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---------- Burnup ---------- */

export interface BurnupPoint {
  date: string
  scope: number
  completed: number | null
}

export function BurnupChart({ data, height = 260 }: { data: BurnupPoint[]; height?: number }) {
  const p = useChartPalette()
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={p.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick(p)} axisLine={{ stroke: p.axis }} tickLine={false} />
        <YAxis tick={tick(p)} axisLine={false} tickLine={false} allowDecimals={false} unit=" SP" width={56} />
        <Tooltip {...tooltipStyle(p)} formatter={(v) => (v === null || v === undefined ? '—' : `${v} SP`)} />
        <Legend wrapperStyle={{ fontSize: 12, color: p.text }} />
        <Line type="stepAfter" dataKey="scope" name="Total scope" stroke={p.neutral} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="completed" name="Completed" stroke={p.series[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: p.surface }} activeDot={{ r: 5 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---------- Velocity ---------- */

export function VelocityChart({ data, height = 220, average }: { data: VelocityPoint[]; height?: number; average?: number }) {
  const p = useChartPalette()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid stroke={p.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={tick(p)} axisLine={{ stroke: p.axis }} tickLine={false} />
        <YAxis tick={tick(p)} axisLine={false} tickLine={false} allowDecimals={false} unit=" SP" width={56} />
        <Tooltip {...tooltipStyle(p)} cursor={{ fill: p.grid, fillOpacity: 0.4 }} formatter={(v) => `${v} SP`} />
        <Legend wrapperStyle={{ fontSize: 12, color: p.text }} />
        <Bar dataKey="committed" name="Committed" fill="transparent" stroke={p.neutral} strokeWidth={1.5} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="completed" name="Completed" fill={p.series[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        {average !== undefined && average > 0 && <ReferenceLine y={average} stroke={p.series[1]} strokeDasharray="4 4" label={{ value: `avg ${average}`, position: 'insideTopRight', fontSize: 11, fill: p.text }} />}
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ---------- Workload ---------- */

export function WorkloadChart({ data, height }: { data: WorkloadRow[]; height?: number }) {
  const p = useChartPalette()
  const rows = data.map((r) => ({ name: r.member.name, assigned: r.assigned, capacity: r.capacity, done: r.done }))
  const h = height ?? Math.max(160, rows.length * 40 + 60)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid stroke={p.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={tick(p)} axisLine={{ stroke: p.axis }} tickLine={false} allowDecimals={false} unit=" SP" />
        <YAxis type="category" dataKey="name" tick={tick(p)} axisLine={false} tickLine={false} width={110} />
        <Tooltip {...tooltipStyle(p)} cursor={{ fill: p.grid, fillOpacity: 0.4 }} formatter={(v) => `${v} SP`} />
        <Legend wrapperStyle={{ fontSize: 12, color: p.text }} />
        <Bar dataKey="capacity" name="Capacity" fill="transparent" stroke={p.neutral} strokeWidth={1.5} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        <Bar dataKey="assigned" name="Assigned" fill={p.series[0]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        <Bar dataKey="done" name="Done" fill={p.series[2]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
