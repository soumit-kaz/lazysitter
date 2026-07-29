'use strict';

const path = require('path');
const { log, c } = require('./util');
const S = require('./fe-session');

const SUBCOMMANDS = ['start', 'resume', 'checkpoint', 'end', 'status', 'split', 'claim', 'heartbeat'];

function pad(s, n) {
  s = String(s == null ? '' : s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function out(json, payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function list(flag) {
  if (flag == null) return [];
  return String(flag).split(',').map((s) => s.trim()).filter(Boolean);
}

function run(root, cwd, sub, flags) {
  const asJson = !!flags.json;

  if (sub === 'start') {
    const res = S.start(root, cwd, {
      run: flags.run,
      feature: flags.feature || flags._rest,
      partition: flags.partition,
      budget: flags.budget,
      sessionId: flags.session,
      force: !!flags.force,
      takeover: !!flags.takeover,
    });
    if (asJson) return out(true, res);
    if (!res.ok) {
      log.err(res.message || res.reason);
      if (res.conflicts) for (const cf of res.conflicts) log.info(`    live run: ${cf.run} (sessions: ${cf.holders.join(', ')})`);
      process.exitCode = 1;
      return;
    }
    log.info('');
    log.ok(`${res.resumed ? 'Re-attached to' : 'Started'} run ${c.bold(res.slug)} — session ${c.cyan(res.sessionId)}`);
    log.info(`  run dir:   ${path.relative(root, res.dir).replace(/\\/g, '/')}`);
    log.info(`  partition: ${flags.partition || 'main'}`);
    if (res.lease && res.lease.expiredTakeover) log.warn('  took over an EXPIRED lease from a dead session — integrity was re-verified');
    if (res.lease && res.lease.takenOver) log.warn('  SEIZED a live lease with --takeover — this is recorded in session-log.jsonl');
    log.info('');
    log.info(c.dim('  Checkpoint after every wave:  lazysitter fe-session checkpoint --run <slug> --wave <id> --status complete'));
    log.info('');
    return;
  }

  if (sub === 'resume') {
    const res = S.resume(root, cwd, {
      run: flags.run,
      partition: flags.partition,
      sessionId: flags.session,
      takeover: !!flags.takeover,
      reconcile: !!flags.reconcile,
    });
    if (asJson) return out(true, { ok: res.ok, verification: res.verification && res.verification.report, briefPath: res.briefPath, sessionId: res.sessionId });
    if (!res.verification || !res.verification.checkpoint) {
      log.err(`Nothing to resume: ${(res.verification && res.verification.report.blocking.join('; ')) || 'no checkpoint'}`);
      process.exitCode = 1;
      return;
    }
    const r = res.verification.report;
    log.info('');
    log.info(`${c.bold('Resume')} ${flags.run} — ${res.ok ? c.green('SAFE TO CONTINUE') : c.red('BLOCKED')}`);
    log.info('');
    for (const b of r.blocking) log.err(`  ${b}`);
    for (const d of r.degraded) log.warn(`  ${d}`);
    for (const n of r.notes) log.info(c.dim(`  ${n}`));
    for (const w of r.willRerun) {
      log.info('');
      log.warn(`  wave ${w.wave} was interrupted`);
      log.info(`    already complete (skip): ${w.agentsAlreadyComplete.join(', ') || 'none'}`);
      log.info(`    still to run:            ${w.agentsToRun.join(', ') || '(re-derive from the plan)'}`);
    }
    log.info('');
    log.ok(`Resume brief → ${path.relative(root, res.briefPath).replace(/\\/g, '/')}`);
    log.info(c.dim('  Read that file. It is the whole handoff — do not reconstruct the previous session\'s context.'));
    if (!res.ok) {
      log.info('');
      log.err('  Not resumed: the lease was NOT taken and no session was recorded. Resolve the blocking items above.');
      process.exitCode = 1;
    } else {
      log.info(`  session ${c.cyan(res.sessionId)} now holds partition "${flags.partition || 'main'}"`);
    }
    log.info('');
    return;
  }

  if (sub === 'checkpoint') {
    const res = S.checkpointWave(root, cwd, {
      run: flags.run,
      wave: flags.wave,
      status: flags.status,
      agentComplete: list(flags['agent-complete']),
      agentsPending: flags['agents-pending'] != null ? list(flags['agents-pending']) : undefined,
      artifact: list(flags.artifact),
      frozenTest: list(flags['frozen-test']),
      factBlock: list(flags['fact-block']),
      limitation: list(flags.limitation),
      spent: flags.spent,
      forecast: flags.forecast,
      sessionId: flags.session,
      partition: flags.partition,
    });
    if (asJson) return out(true, res);
    if (!res.ok) {
      log.err(res.message);
      process.exitCode = 1;
      return;
    }
    log.ok(`checkpoint: ${res.wave.id} → ${res.wave.status}${res.wave.agentsComplete.length ? ` (done: ${res.wave.agentsComplete.join(', ')})` : ''}`);
    return;
  }

  if (sub === 'end') {
    const res = S.end(root, { run: flags.run, sessionId: flags.session, partition: flags.partition, reason: flags.reason, force: !!flags.force });
    if (asJson) return out(true, res);
    if (!res.ok) {
      log.err(res.message);
      process.exitCode = 1;
      return;
    }
    log.ok(`session ended${res.session ? ` (${res.session.id})` : ''} — lease released: ${res.released}`);
    return;
  }

  if (sub === 'status') {
    const res = S.status(root, cwd, { run: flags.run });
    if (asJson) return out(true, res);
    if (!flags.run) {
      if (!res.runs.length) return log.info('no runs recorded');
      const w = Math.max(3, ...res.runs.map((r) => r.run.length));
      log.info('');
      log.info(`  ${pad('run', w)} ${pad('progress', 9)} ${pad('next wave', 16)} ${pad('live sessions', 22)} updated`);
      log.info(`  ${'-'.repeat(w)} ${'-'.repeat(9)} ${'-'.repeat(16)} ${'-'.repeat(22)} ${'-'.repeat(20)}`);
      for (const r of res.runs) {
        log.info(
          `  ${pad(r.run, w)} ${pad(r.progress, 9)} ${pad(r.next, 16)} ${pad(r.liveSessions.join(', ') || (r.staleLeases ? c.yellow(`${r.staleLeases} stale`) : '—'), 22)} ${r.updatedAt}`
        );
      }
      log.info('');
      return;
    }
    const cp = res.checkpoint;
    if (!cp) return log.err(`no checkpoint for run "${flags.run}"`);
    log.info('');
    log.info(`${c.bold(cp.run)} — ${cp.feature}`);
    log.info(`  resumable: ${res.resumable ? c.green('yes') : c.red('no')}   updated: ${cp.updatedAt}`);
    log.info('');
    for (const w of cp.waves) {
      const mark = w.status === 'complete' ? c.green('✓') : w.status === 'in_progress' ? c.yellow('⏸') : c.dim('·');
      log.info(`  ${mark} ${pad(w.id, 16)} ${pad(w.status, 12)} ${(w.agentsComplete || []).join(', ')}`);
    }
    log.info('');
    for (const b of res.verification.blocking) log.err(`  ${b}`);
    for (const d of res.verification.degraded) log.warn(`  ${d}`);
    log.info('');
    return;
  }

  if (sub === 'split') {
    const res = S.planSplit(root, cwd, { run: flags.run, sessions: flags.sessions });
    if (asJson) return out(true, res);
    if (!res.ok) {
      log.err(res.message);
      process.exitCode = 1;
      return;
    }
    log.info('');
    log.info(`${c.bold('Parallel split')} — run ${res.run}, wave ${c.cyan(res.wave)}, partitioned by ${res.partitionedBy}`);
    log.info(c.dim(`  ${res.why}`));
    log.info('');
    for (const s of res.sessions) {
      log.info(`  ${c.bold(s.partition)}`);
      log.info(`    agents:  ${s.agents.join(', ')}`);
      log.info(`    start:   ${c.dim(s.command)}`);
    }
    log.info('');
    for (const r of res.rules) log.info(`  · ${r}`);
    log.info('');
    return;
  }

  if (sub === 'claim') {
    const res = S.claim(root, { run: flags.run, partition: flags.partition, sessionId: flags.session, files: list(flags.files) });
    if (asJson) return out(true, res);
    if (!res.ok) {
      log.err(res.message);
      for (const cf of res.conflicts) log.err(`    ${cf.file} → held by ${cf.heldBy} (session ${cf.session})`);
      process.exitCode = 1;
      return;
    }
    log.ok(`claimed ${res.claimed.length} file(s) for partition ${flags.partition}`);
    return;
  }

  if (sub === 'heartbeat') {
    const res = S.heartbeat(S.runDir(root, S.slugify(flags.run)), flags.partition || 'main', flags.session, {});
    if (asJson) return out(true, res);
    if (!res.ok) {
      log.err(res.message);
      process.exitCode = 1;
      return;
    }
    log.ok('heartbeat recorded');
    return;
  }

  log.err(`Unknown fe-session subcommand: ${sub}`);
  log.info(`  known: ${SUBCOMMANDS.join(', ')}`);
  process.exitCode = 1;
}

function help() {
  log.info(`
${c.bold('lazysitter fe-session')} — resume a run in a new session, and run several sessions safely

${c.bold('One session hits a limit, the next continues')}
  fe-session start --feature "<request>" [--budget N]     begin a run, take the lease
  fe-session checkpoint --run <slug> --wave <id> --status complete
                        [--agent-complete a,b] [--artifact PLAN.md] [--spent N]
                        [--frozen-test path] [--fact-block "..."] [--limitation "..."]
  fe-session resume --run <slug> [--reconcile] [--takeover]
                                                          verify integrity, write RESUME-BRIEF.md
  fe-session end --run <slug> --session <id> [--reason usage-limit]
  fe-session status [--run <slug>]                        all runs, or one run's wave state

${c.bold('Several sessions at once')}
  fe-session split --run <slug> --sessions 3              propose a SAFE partition of the next wave
  fe-session start --run <slug> --partition <name>        each session claims its own partition
  fe-session claim --run <slug> --partition <name> --files a.tsx,b.tsx
                                                          one writer per file, enforced
  fe-session heartbeat --run <slug> --partition <name> --session <id>

${c.bold('Safety rules this enforces for you')}
  · Leases EXPIRE (15 min without a heartbeat) — a dead session never blocks the tree forever.
  · A live lease is never silently stolen; --takeover is explicit and logged.
  · Checkpoints are written atomically — an interrupted write cannot corrupt the state.
  · A resume onto a moved HEAD BLOCKS until you reconcile it.
  · An interrupted wave re-runs; only its finished agents are skipped.
  · Two runs in ONE working tree are refused — use a git worktree per concurrent feature.
  · Barrier waves (design, spec, integrate, merge-gate) refuse to be split across sessions.

${c.dim('Add --json to any command.')}
`);
}

module.exports = { run, help, SUBCOMMANDS };
