import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/pos/components/page-header'
import { usePos } from '@/pos/lib/pos-context'
import { useCompanySettings } from '@/hooks/use-settings'
import { toSkumsConnectorConfig } from '@/pos/lib/skums-connector'
import {
  fetchSkumsRosterBoard,
  type SkumsRosterBoard,
  type SkumsRosterBoardZone,
} from '@/pos/lib/skums-client'
import { cn } from '@/lib/utils'

/** Demo board when SKUMS is offline — matches sample seed staff at Bugis+. */
function demoRosterBoard(date: string): SkumsRosterBoard {
  const day = date
  function sgt(h: number, dur: number) {
    const start = new Date(`${day}T${String(h).padStart(2, '0')}:00:00+08:00`)
    const end = new Date(start.getTime() + dur * 3600 * 1000)
    return { starts_at: start.toISOString(), ends_at: end.toISOString() }
  }
  const mk = (
    id: string,
    name: string,
    h: number,
    dur: number,
    status = 'published',
  ) => ({
    id,
    employee_id: id,
    employee_name: name,
    ...sgt(h, dur),
    status,
    notes: null as string | null,
  })

  const zones: SkumsRosterBoardZone[] = [
    {
      zone: { id: 'z1', code: 'zone_1', name: 'Zone 1' },
      shifts: [mk('e-jarrell', 'Jarrell', 9, 8), mk('e-jazelle', 'Jazelle', 11, 5)],
    },
    {
      zone: { id: 'z2', code: 'zone_2', name: 'Zone 2' },
      shifts: [mk('e-jeremy', 'Jeremy', 10, 6), mk('e-fern', 'Fern', 12, 4)],
    },
    {
      zone: { id: 'z3', code: 'zone_3', name: 'Zone 3' },
      shifts: [mk('e-kristle', 'Kristle', 10, 5), mk('e-mj', 'MJ', 14, 4)],
    },
    {
      zone: { id: 'zc', code: 'cashier', name: 'Cashier' },
      shifts: [mk('e-tiffany', 'Tiffany', 10, 6), mk('e-hiok', 'Hiok', 14, 5)],
    },
    {
      zone: { id: 'zb', code: 'back_of_house', name: 'Back of House' },
      shifts: [mk('e-soobin', 'Soobin', 8, 8)],
    },
  ]

  const shift_count = zones.reduce((n, z) => n + z.shifts.length, 0)
  return {
    date: day,
    timezone: 'Asia/Singapore',
    window: {
      from: `${day}T00:00:00+08:00`,
      to: `${day}T23:59:59.999+08:00`,
    },
    zone_count: zones.length,
    shift_count,
    zones,
  }
}

function formatHour(iso: string) {
  return new Date(iso).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
    hour12: false,
  })
}

function isOnNow(startsAt: string, endsAt: string, now = new Date()) {
  const t = now.getTime()
  return t >= new Date(startsAt).getTime() && t < new Date(endsAt).getTime()
}

export default function RosterPage() {
  const { mode, user } = usePos()
  const { data: settings } = useCompanySettings()
  const todaySgt = useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }),
    [],
  )
  const [date, setDate] = useState(todaySgt)
  const [board, setBoard] = useState<SkumsRosterBoard | null>(null)
  const [source, setSource] = useState<'live' | 'demo'>('demo')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const connector = toSkumsConnectorConfig(settings ?? null)

    if (connector) {
      try {
        const next = await fetchSkumsRosterBoard({ date, timezone: 'Asia/Singapore' }, connector)
        setBoard(next)
        setSource('live')
        setLoading(false)
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load roster'
        // Fall through to demo when offline / unscoped
        if (mode !== 'demo') {
          setError(msg)
        }
      }
    }

    setBoard(demoRosterBoard(date))
    setSource('demo')
    if (!connector && mode === 'live') {
      setError('Connect SKUMS in Settings to load the live roster board.')
    }
    setLoading(false)
  }, [date, settings, mode])

  useEffect(() => {
    void load()
  }, [load])

  const peopleOnFloor = useMemo(() => {
    if (!board) return []
    const rows: { name: string; zone: string; starts: string; ends: string; now: boolean }[] = []
    for (const col of board.zones) {
      for (const s of col.shifts) {
        rows.push({
          name: s.employee_name || '—',
          zone: col.zone.name,
          starts: formatHour(s.starts_at),
          ends: formatHour(s.ends_at),
          now: isOnNow(s.starts_at, s.ends_at),
        })
      }
    }
    return rows.sort((a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name))
  }, [board])

  const myName = user?.name

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        icon={Users}
        title="Roster board"
        subtitle="Where everyone is assigned by zone (hourly)"
        action={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {board?.date || date} · {board?.timezone || 'Asia/Singapore'}
          </span>
          <span className="rounded-full border px-2 py-0.5">
            {source === 'live' ? 'Live SKUMS' : 'Demo board'}
          </span>
          {board && (
            <span>
              {board.shift_count} shift{board.shift_count === 1 ? '' : 's'} · {board.zone_count}{' '}
              zones
            </span>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            {error}
          </div>
        )}

        {loading && !board ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading roster…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(board?.zones || []).map((col) => (
                <section
                  key={col.zone.id || col.zone.code}
                  className="rounded-xl border bg-card shadow-sm"
                >
                  <header className="flex items-center justify-between border-b px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold">{col.zone.name}</h2>
                    </div>
                    <span className="text-xs text-muted-foreground">{col.shifts.length}</span>
                  </header>
                  <ul className="divide-y">
                    {col.shifts.length === 0 && (
                      <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                        Nobody scheduled
                      </li>
                    )}
                    {col.shifts.map((s) => {
                      const onNow = isOnNow(s.starts_at, s.ends_at)
                      const isMe =
                        myName &&
                        s.employee_name &&
                        s.employee_name.toLowerCase() === myName.toLowerCase()
                      return (
                        <li
                          key={s.id}
                          className={cn(
                            'px-3 py-2.5',
                            onNow && 'bg-primary/5',
                            isMe && 'ring-1 ring-inset ring-primary/30',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">
                                {s.employee_name || '—'}
                                {isMe && (
                                  <span className="ml-1.5 text-xs font-normal text-primary">you</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatHour(s.starts_at)}–{formatHour(s.ends_at)}
                              </p>
                            </div>
                            {onNow && (
                              <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                                Now
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <section className="mt-6 rounded-xl border bg-card">
              <header className="border-b px-3 py-2.5">
                <h2 className="text-sm font-semibold">Everyone today</h2>
                <p className="text-xs text-muted-foreground">Flat list across all zones</p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Zone</th>
                      <th className="px-3 py-2 font-medium">Hours (SGT)</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peopleOnFloor.map((row) => (
                      <tr
                        key={`${row.name}-${row.zone}-${row.starts}`}
                        className={cn('border-b last:border-0', row.now && 'bg-primary/5')}
                      >
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2">{row.zone}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.starts}–{row.ends}
                        </td>
                        <td className="px-3 py-2">
                          {row.now ? (
                            <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                              On floor now
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Scheduled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!peopleOnFloor.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                          No shifts for this day
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
