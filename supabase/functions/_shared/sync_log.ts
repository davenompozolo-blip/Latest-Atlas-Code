// Shared sync_log client used by every Alpaca sync function.
// Each function opens a row on entry, writes counts on success, or an error
// message on failure. Sub-function rows set parent_id to the orchestrator's
// row so the terminal can show hierarchical status.

export interface SyncCounts {
  positions_seen?: number
  positions_upserted?: number
  transactions_upserted?: number
  prices_upserted?: number
}

export interface SyncLogClient {
  id: number | null
  open(): Promise<number>
  success(counts?: SyncCounts, details?: Record<string, unknown>): Promise<void>
  partial(counts: SyncCounts, details: Record<string, unknown>): Promise<void>
  error(err: unknown): Promise<void>
}

export interface SyncLogOpts {
  functionName: string
  source?: string
  parentId?: number | null
}

export function createSyncLog(sql: any, opts: SyncLogOpts): SyncLogClient {
  const source = opts.source ?? 'edge_function'
  const parentId = opts.parentId ?? null
  const client: SyncLogClient = {
    id: null,
    async open() {
      const rows = await sql<{ id: number }[]>`
        insert into public.sync_log (status, source, function_name, parent_id)
        values ('running', ${source}, ${opts.functionName}, ${parentId})
        returning id
      `
      client.id = rows[0].id
      return client.id
    },
    async success(counts = {}, details = {}) {
      if (client.id == null) throw new Error('sync_log.success called before open()')
      await sql`
        update public.sync_log set
          finished_at           = now(),
          status                = 'success',
          positions_seen        = ${counts.positions_seen ?? null},
          positions_upserted    = ${counts.positions_upserted ?? null},
          transactions_upserted = ${counts.transactions_upserted ?? null},
          prices_upserted       = ${counts.prices_upserted ?? null},
          details               = ${sql.json(details)}
        where id = ${client.id}
      `
    },
    async partial(counts, details) {
      if (client.id == null) throw new Error('sync_log.partial called before open()')
      await sql`
        update public.sync_log set
          finished_at           = now(),
          status                = 'partial',
          positions_seen        = ${counts.positions_seen ?? null},
          positions_upserted    = ${counts.positions_upserted ?? null},
          transactions_upserted = ${counts.transactions_upserted ?? null},
          prices_upserted       = ${counts.prices_upserted ?? null},
          details               = ${sql.json(details)}
        where id = ${client.id}
      `
    },
    async error(err) {
      if (client.id == null) return
      const message = err instanceof Error ? err.message : String(err)
      try {
        await sql`
          update public.sync_log set
            finished_at   = now(),
            status        = 'error',
            error_message = ${message}
          where id = ${client.id}
        `
      } catch (e) {
        console.error('sync_log error update failed:', e)
      }
    },
  }
  return client
}
