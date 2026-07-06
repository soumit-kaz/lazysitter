'use strict';

// LazySitter Program Mode — deterministic engine (Phase 1 of docs/PROGRAM-MODE.md §16).
//
// This is the load-bearing, token-free core the beast sits on: the DAG state model, the
// scheduler, the fail-fast gate ladder, institutional memory, durable state, and the
// lease protocol. It holds no LLM logic — it is the deterministic substrate the
// Program-Office orchestrator (an agent) drives. Everything here is additive; it never
// touches the single-feature pipeline.

module.exports = {
  plan: require('./lib/plan'),
  scheduler: require('./lib/scheduler'),
  gates: require('./lib/gates'),
  gatecmds: require('./lib/gatecmds'),
  memory: require('./lib/memory'),
  librarian: require('./lib/librarian'),
  registry: require('./lib/registry'),
  queue: require('./lib/queue'),
  trace: require('./lib/trace'),
  faultinject: require('./lib/faultinject'),
  coordinator: require('./lib/coordinator'),
  store: require('./lib/store'),
  lease: require('./lib/lease'),
};
