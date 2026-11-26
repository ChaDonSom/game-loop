/**
 * Who is connected, from `welcome`, `join`, and `leave` (reliable streams). Plain data, no Vue, so tests can run it.
 *
 * Each message comes on its own stream, and streams have no order between them. So the roster keeps the last
 * `rosterSeq` per id, and ignores an event that is not newer for that id. A `leave` stays as a mark (present: false),
 * so a late `join` with an older `rosterSeq` cannot bring the player back.
 *
 * `rosterSeq` restarts when the server restarts. Call `clear()` on each new connection, before any message arrives.
 */
export class Roster {
  private entries = new Map<string, { present: boolean; rosterSeq: number }>()

  clear() {
    this.entries.clear()
  }

  /** Applies one `join` (present) or `leave` (absent). Returns true if the roster changed. */
  apply(id: string, present: boolean, rosterSeq: number) {
    const entry = this.entries.get(id)
    if (entry && entry.rosterSeq >= rosterSeq) return false
    this.entries.set(id, { present, rosterSeq })
    return !entry || entry.present !== present
  }

  /**
   * Applies `welcome`: `ids` were the players connected at `rosterSeq`. A known id that is not in `ids` had left by then,
   * unless a newer event for it already arrived.
   */
  applySnapshot(ids: string[], rosterSeq: number) {
    const listed = new Set(ids)
    for (const [id, entry] of this.entries) {
      if (!listed.has(id) && entry.rosterSeq < rosterSeq) this.entries.set(id, { present: false, rosterSeq })
    }
    for (const id of ids) this.apply(id, true, rosterSeq)
  }

  has(id: string) {
    return this.entries.get(id)?.present === true
  }

  get size() {
    let count = 0
    for (const entry of this.entries.values()) if (entry.present) count++
    return count
  }
}
