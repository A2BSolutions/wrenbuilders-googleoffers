'use strict';
/*
 * Idempotency state machine for /api/survey-lead.
 *
 * States per key (campaign:submission_id):
 *   (absent)    -> begin() => 'claimed'     lease taken, record = processing
 *   processing  -> begin() => 'in_progress' another attempt holds a live lease (caller returns 409, client retries)
 *   processing, lease expired -> begin() => 'takeover'  previous attempt died or timed out. IN DOUBT: it may already
 *                                have reached GHL. We choose at-least-once, so the lead is never lost.
 *   done        -> begin() => 'done'        already accepted by GHL. Caller returns ok:true WITHOUT forwarding again.
 *
 * complete(key) marks done. release(key, token) clears our lease after a failed forward so a retry can run.
 *
 * IMPORTANT: the only store implemented here is in-process memory. On Vercel each function instance has its own memory
 * and instances are recycled, so this is BEST EFFORT and NOT durable. It stops same-instance double clicks and fast
 * retries only. A durable store (one that supports atomic create-if-absent with a lease, e.g. Redis SET NX PX) needs
 * approval before it is added. The adapter interface below is what that store must implement.
 */

const crypto = require('crypto');

function createMemoryStore({ leaseMs = 30000, doneTtlMs = 24 * 60 * 60 * 1000, maxEntries = 5000 } = {}) {
  const map = new Map();
  function sweep(now) {
    if (map.size < maxEntries) return;
    for (const [k, r] of map) if ((r.state === 'done' && r.expires <= now) || (r.state === 'processing' && r.lease_until + doneTtlMs <= now)) map.delete(k);
    while (map.size >= maxEntries) map.delete(map.keys().next().value); // oldest first
  }
  return {
    kind: 'memory',
    durable: false,
    async begin(key, now) {
      const r = map.get(key);
      if (r && r.state === 'done' && r.expires > now) return { outcome: 'done' };
      if (r && r.state === 'processing' && r.lease_until > now) return { outcome: 'in_progress' };
      const token = crypto.randomUUID();
      const attempts = (r && r.state === 'processing' ? r.attempts : 0) + 1;
      sweep(now);
      map.set(key, { state: 'processing', token, lease_until: now + leaseMs, attempts });
      return { outcome: r && r.state === 'processing' ? 'takeover' : 'claimed', token, attempts };
    },
    async complete(key, token, now) {
      map.set(key, { state: 'done', expires: now + doneTtlMs });
    },
    async release(key, token) {
      const r = map.get(key);
      if (r && r.state === 'processing' && r.token === token) map.delete(key);
    },
  };
}

module.exports = { createMemoryStore };
