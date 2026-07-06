#!/usr/bin/env node
'use strict';

// CLI surface for the Program Mode engine — the glue the Program-Office orchestrator
// (an LLM agent with the Bash tool) uses to drive the deterministic core. Every command
// reads/writes durable state under <root>/program/ so it survives across sessions.
//
// The clock is read HERE, at the boundary (never inside the engine, which must replay
// deterministically). Pass --now <epoch> to pin it; otherwise the wall clock is used.
//
// Usage:
//   node program-mode/cli.js <cmd> [args] [--root .] [--now <epoch>]
//
//   init
//   node add <id> [--cost N] [--files a,b,c] [--type feature|foundation|consultation]
//   dep <from> <to> [--on contract|merged]
//   status <id> <status>
//   freeze <id>
//   checkpoint <id> <tier>
//   show
//   waves | critical | ready | concurrent [--k N]
//   mem-capture <text> [--situation a,b] [--producer x] [--severity N] [--always-on]
//   mem-retrieve [--situation a,b] [--producer x] [--k N]

const { execFileSync } = require('child_process');
const fs = require('fs');
const { plan, scheduler, memory, store, gates, gatecmds, faultinject } = require('./index');

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[key] = true;
      else {
        opt[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, opt };
}

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];
  const root = opt.root || '.';
  const now = opt.now ? Number(opt.now) : Math.floor(Date.now() / 1000);
  const list = (s) => (typeof s === 'string' ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

  const need = () => {
    const p = store.loadPlan(root);
    if (!p) fail('no program/PROGRAM-PLAN.json — run `init` first');
    return p;
  };
  const out = (o) => console.log(JSON.stringify(o, null, 2));

  switch (cmd) {
    case 'init': {
      if (store.loadPlan(root)) fail('program already initialized');
      store.savePlan(root, plan.createPlan({ now }));
      console.log(`initialized ${store.programDir(root)}`);
      break;
    }
    case 'add': {
      const p = need();
      plan.addNode(p, {
        id: pos[1],
        cost: opt.cost ? Number(opt.cost) : 1,
        files: list(opt.files),
        type: opt.type,
      });
      store.savePlan(root, p);
      console.log(`added node ${pos[1]}`);
      break;
    }
    case 'dep': {
      const p = need();
      plan.addDep(p, pos[1], pos[2], opt.on || 'merged');
      store.savePlan(root, p);
      console.log(`${pos[1]} depends on ${pos[2]} (on ${opt.on || 'merged'})`);
      break;
    }
    case 'status': {
      const p = need();
      plan.setStatus(p, pos[1], pos[2], { now });
      store.savePlan(root, p);
      console.log(`${pos[1]} → ${pos[2]}`);
      break;
    }
    case 'freeze': {
      const p = need();
      plan.freezeContract(p, pos[1], { now });
      store.savePlan(root, p);
      console.log(`${pos[1]} contract frozen`);
      break;
    }
    case 'checkpoint': {
      const p = need();
      plan.checkpoint(p, pos[1], pos[2], { now });
      store.savePlan(root, p);
      console.log(`${pos[1]} checkpoint = ${pos[2]}`);
      break;
    }
    case 'show':
      out(need());
      break;
    case 'waves':
      out(scheduler.topoWaves(need()));
      break;
    case 'critical':
      out(scheduler.criticalPath(need()));
      break;
    case 'ready':
      out(scheduler.readyNodes(need()));
      break;
    case 'concurrent':
      out(scheduler.pickConcurrent(need(), opt.k ? Number(opt.k) : Infinity));
      break;
    case 'mem-capture': {
      const s = store.loadMemory(root);
      memory.capture(s, {
        text: pos.slice(1).join(' '),
        situation: list(opt.situation),
        producer: list(opt.producer),
        severity: opt.severity ? Number(opt.severity) : 3,
        alwaysOn: !!opt['always-on'],
      }, { now });
      store.saveMemory(root, s);
      console.log('captured');
      break;
    }
    case 'mem-retrieve': {
      const s = store.loadMemory(root);
      out(memory.retrieve(s, {
        situation: list(opt.situation),
        producer: list(opt.producer),
        k: opt.k ? Number(opt.k) : 6,
        now,
      }));
      break;
    }
    case 'gate': {
      // Run the real fail-fast gate ladder over a diff. --diff <file>, else `git diff HEAD`.
      let diffText = '';
      if (opt.diff) diffText = fs.readFileSync(opt.diff, 'utf8');
      else {
        try {
          diffText = execFileSync('git', ['diff', 'HEAD'], { cwd: root, encoding: 'utf8' });
        } catch {
          diffText = '';
        }
      }
      const exec = gatecmds.makeExec({ root, diffText });
      const result = gates.runLadder(gates.ladder(), { diffText }, exec);
      console.log(gates.renderVerdict(result));
      process.exit(result.verdict === 'PASS' ? 0 : 1);
      break;
    }
    case 'coverage': {
      // Fault-injection self-test: prove the ladder catches the defect classes it claims to.
      const defects = [
        { id: 'leaked-key', expectGate: 'secrets' },
        { id: 'unused-export', expectGate: 'dead-code' },
        { id: 'type-error', expectGate: 'typecheck-build' },
        { id: 'lint-violation', expectGate: 'lint' },
      ];
      const cov = faultinject.measureCoverage(gates.ladder(), defects);
      out({ rate: cov.rate, caught: cov.caught, total: cov.total, uncovered: cov.uncovered });
      break;
    }
    default:
      fail(`unknown command: ${cmd || '(none)'} — see the header of program-mode/cli.js`);
  }
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

main();
