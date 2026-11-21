/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { formatLogQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getLogStats, getTodayTokenQuotaStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS } from '../constants'
import { buildApiParams } from '../lib/utils'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

function StatBadge(props: {
  label: string
  value: string | number
  accent: string
}) {
  return (
    <span className='border-border/60 bg-muted/25 inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs shadow-xs'>
      <span className={cn('h-3.5 w-0.5 rounded-full', props.accent)} />
      <span className='text-muted-foreground'>{props.label}</span>
      <span className='text-foreground/85 font-mono font-semibold tabular-nums'>
        {props.value}
      </span>
    </span>
  )
}

function QuotaTable(props: {
  title: string
  accent: string
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className='border-border/60 bg-muted/20 min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-xs shadow-xs'>
      <div className='mb-1.5 flex items-center gap-2'>
        <span className={cn('h-3.5 w-0.5 rounded-full', props.accent)} />
        <span className='text-muted-foreground'>{props.title}</span>
      </div>
      <div className='max-h-52 overflow-auto'>
        <table className='w-full min-w-[22rem] text-left text-[11px]'>
          <thead className='text-muted-foreground bg-muted/30 sticky top-0 border-border/60 border-b'>
            <tr>
              {props.headers.map((header) => (
                <th key={header} className='px-1.5 py-1 font-medium'>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className='text-foreground/85 font-mono tabular-nums'>
            {props.rows.map((row) => (
              <tr key={row.join('\\u001f')} className='border-border/40 border-b last:border-0'>
                {row.map((cell, index) => (
                  <td key={`${index}-${cell}`} className={cn('max-w-52 truncate px-1.5 py-1', index === row.length - 1 && 'text-right')} title={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CommonLogsStats() {
  const { t } = useTranslation()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const searchParams = route.useSearch()
  const { sensitiveVisible } = useUsageLogsContext()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async () => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })

      const result = isAdmin
        ? requireServerSuccess(await getLogStats(params))
        : requireServerSuccess(await getUserLogStats(params))

      return result.success
        ? result.data || DEFAULT_LOG_STATS
        : DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  const { data: tokenStats } = useQuery({
    queryKey: [
      'usage-logs-today-token-quota',
      isAdmin,
      searchParams.startTime,
      searchParams.endTime,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getTodayTokenQuotaStats({
          start_timestamp: searchParams.startTime,
          end_timestamp: searchParams.endTime,
        })
      ),
    enabled: isAdmin,
    staleTime: 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className='flex items-center gap-2'>
        <Skeleton className='h-7 w-[150px] rounded-md' />
        <Skeleton className='h-7 w-[100px] rounded-md' />
        <Skeleton className='h-7 w-[120px] rounded-md' />
      </div>
    )
  }

  const channelRows = tokenStats?.data?.channels ?? []
  const detailRows = tokenStats?.data?.details ?? []
  const byChannel = new Map<number, typeof detailRows>()
  for (const row of detailRows) {
    const group = byChannel.get(row.channel_id)
    if (group) group.push(row)
    else byChannel.set(row.channel_id, [row])
  }
  const channelGroups = [...byChannel.values()].sort((a, b) =>
    a[0].channel_name.localeCompare(b[0].channel_name) || a[0].channel_id - b[0].channel_id
  )
  const channelTotals = new Map(
    channelRows.map((item) => [item.channel_id, item.quota])
  )
  const parseChannelMultiplier = (name: string) => {
    // Use the final "-<number>" for cost calculations without changing the displayed name.
    const match = name.trim().match(/-\s*([0-9]+(?:\.[0-9]+)?)\s*$/)
    if (!match) return null
    const multiplier = Number(match[1])
    return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null
  }
  const formatMultiplier = (value: number) => `${value.toFixed(2)}x`

  return (
    <div className='w-full space-y-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <StatBadge
          label={t('Usage')}
          value={sensitiveVisible ? formatLogQuota(stats?.quota || 0) : '••••'}
          accent='bg-sky-500/70'
        />
        <StatBadge
          label={t('RPM')}
          value={stats?.rpm || 0}
          accent='bg-rose-500/65'
        />
        <StatBadge
          label={t('TPM')}
          value={stats?.tpm || 0}
          accent='bg-slate-400/70'
        />
      </div>
      {isAdmin && detailRows.length > 0 ? (
        <div className='border-border/60 bg-muted/20 min-w-0 rounded-md border px-2.5 py-1.5 text-xs shadow-xs'>
          <div className='mb-1.5 flex items-center gap-2'>
            <span className='bg-violet-500/70 h-3.5 w-0.5 rounded-full' />
            <span className='text-muted-foreground'>{t('Today quota by upstream channel')}</span>
          </div>
          <div>
            <table className='w-full table-fixed border-collapse border border-foreground/70 text-center text-[11px] wrap-anywhere'>
              <thead className='text-muted-foreground bg-muted/30'>
                <tr>
                  <th scope='col' className='border-foreground/70 w-[8%] border px-1.5 py-1 font-medium'>{t('Channel ID')}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Upstream Channel')}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Upstream Cost', { defaultValue: '上游消耗' })}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Channel Total')}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Sub-channel / Token')}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Local Token Usage', { defaultValue: '本站令牌消耗' })}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Token Multiplier', { defaultValue: '令牌倍率' })}</th>
                  <th className='border-foreground/70 border px-1.5 py-1 font-medium'>{t('Actual Quota')}</th>
                </tr>
              </thead>
              <tbody className='text-foreground/85 font-mono tabular-nums'>
                {channelGroups.flatMap((group, groupIndex) => {
                  const channelName = group[0].channel_name || String(group[0].channel_id)
                  const upstreamMultiplier = parseChannelMultiplier(channelName)
                  const rows = group.map((item) => ({
                    item,
                    actualQuota:
                      item.multiplier != null && item.multiplier > 0 && upstreamMultiplier != null
                        ? (item.quota * upstreamMultiplier) / item.multiplier
                        : null,
                  }))
                  const upstreamCost = rows.reduce<number | null>(
                    (total, { actualQuota }) => total == null || actualQuota == null ? null : total + actualQuota,
                    0
                  )
                  const channelCount = rows.length
                  return rows.map(({ item, actualQuota }, index) => {
                    const firstInChannel = index === 0
                    const tokenMultiplier = item.multiplier
                    return (
                    <tr key={`${item.channel_id}-${item.token_id}-${item.token_name}-${tokenMultiplier}`} className={groupIndex % 2 === 0 ? 'bg-sky-50 dark:bg-sky-950/40' : 'bg-emerald-50 dark:bg-emerald-950/40'}>
                      {firstInChannel ? (
                        <td rowSpan={channelCount} className='border-foreground/70 border px-1.5 py-1 align-middle font-semibold'>{item.channel_id > 0 ? item.channel_id : '—'}</td>
                      ) : null}
                      {firstInChannel ? (
                        <td rowSpan={channelCount} className='border-foreground/70 border px-1.5 py-1 align-middle font-semibold text-center' title={channelName}>{channelName}</td>
                      ) : null}
                      {firstInChannel ? (
                        <td rowSpan={channelCount} className='border-foreground/70 border px-1.5 py-1 align-middle font-semibold'>{upstreamCost == null ? '—' : formatLogQuota(upstreamCost)}</td>
                      ) : null}
                      {firstInChannel ? (
                        <td rowSpan={channelCount} className='border-foreground/70 border px-1.5 py-1 align-middle font-semibold text-center'>{formatLogQuota(channelTotals.get(item.channel_id) ?? 0)}</td>
                      ) : null}
                      <td className='border-foreground/70 border px-1.5 py-1 text-center' title={item.token_name}>{item.token_name}</td>
                      <td className='border-foreground/70 border px-1.5 py-1'>{formatLogQuota(item.quota)}</td>
                      <td className='border-foreground/70 border px-1.5 py-1'>{tokenMultiplier == null ? '—' : formatMultiplier(tokenMultiplier)}</td>
                      <td className='border-foreground/70 border px-1.5 py-1'>{actualQuota == null ? '—' : formatLogQuota(actualQuota)}</td>
                    </tr>
                  )
                  })
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
