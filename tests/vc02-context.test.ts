// tests/vc02-context.test.ts
import { buildContextSnapshot } from '../lib/context-engine';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`FAIL ${msg}`);
    process.exit(1);
  } else {
    console.log(`ok ${msg}`);
  }
}

// Primitive deep equality based on JSON
function jsonEq(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// -------------------------------------------------------------------
// Test suite for buildContextSnapshot
// -------------------------------------------------------------------
function runTests() {
  // ----- 1. Empty / missing input -----
  let snap = buildContextSnapshot({});
  assert(snap.project === 'unknown project', 'empty input -> project unknown');
  assert(snap.activity === 'unknown', 'empty input -> activity unknown');
  assert(snap.modifiedCount === 0, 'empty input -> modifiedCount 0');
  assert(snap.latestCommit === 'none', 'empty input -> latestCommit none');
  assert(snap.clipboardSecret === false, 'empty input -> clipboardSecret false');
  assert(snap.brief === null, 'empty input -> brief null');
  assert(snap.topRisk === null, 'empty input -> topRisk null');
  assert(Array.isArray(snap.waiting) && snap.waiting.length === 0, 'empty input -> waiting []');
  assert(Array.isArray(snap.recentEvents) && snap.recentEvents.length === 0, 'empty input -> recentEvents []');
  const expectedUnknowns = ['virtualDesktop','activeApp','gitRepo','gitBranch','latestCommit','modifiedFiles'];
  assert(jsonEq(snap.unknowns.sort(), expectedUnknowns.sort()), 'empty input unknowns list');

  // ----- 2. Full realistic state -----
  const fullInput = {
    currentState: {
      virtualDesktop: 'Main',
      activeApp: 'Code',
      windowTitle: 'App.tsx',
      workspacePath: '/home/user',
      gitRepo: 'C:/projects/veridian',
      gitBranch: 'main',
      latestCommit: 'a1b2c3d',
      modifiedFiles: ['file1.ts','file2.ts'],
      clipboardIsSecret: true,
      browserTitle: 'Verifier',
    },
    timeline: [
      { id: '1', timestamp: '2024-01-01T10:00:00Z', type: 'INFO', title: 'Opened IDE', details: '' },
      { id: '2', timestamp: '2024-01-01T10:05:00Z', type: 'WARNING', title: 'Lint warnings', details: '' },
      { id: '3', timestamp: '2024-01-01T10:10:00Z', type: 'ERROR', title: 'Build failed', details: '' },
      { id: '4', timestamp: '2024-01-01T09:00:00Z', type: 'INFO', title: 'Closed IDE', details: '' },
    ],
    brief: {
      desktop: 'Main',
      updatedAt: '2024-01-01T09:55:00Z',
      wasDoing: 'Implemented context engine',
      nextStep: 'Write tests',
    },
    waiting: [
      { source: 'watcher', title: 'File saved', detail: 'user edited something', ageSec: 12, status: 'pending', path: '/tmp' },
      { source: 'build', title: 'Build queued', detail: 'Waiting for lock', ageSec: 45, status: 'queued', path: '' },
      { source: 'ci', title: 'CI running', detail: 'Job #42', ageSec: 120, status: 'running', path: '' },
      { source: 'deploy', title: 'Deploy pending', detail: 'Approved', ageSec: 300, status: 'pending', path: '' },
      { source: 'monitor', title: 'Alert', detail: 'High CPU', ageSec: 5, status: 'triggered', path: '' },
      { source: 'db', title: 'Backup', detail: 'In progress', ageSec: 600, status: 'running', path: '' },
      { source: 'security', title: 'Scan', detail: 'New vulnerability', ageSec: 30, status: 'alert', path: '' },
      { source: 'logs', title: 'Log rotated', detail: 'Old logs cleaned', ageSec: 0, status: 'done', path: '' },
      { source: 'extra', title: 'Extra waiting', detail: '...', ageSec: 999, status: '...', path: '' }, // trimmed
    ],
    repos: [
      { name: 'frontend', branch: 'develop', risk: 'MEDIUM', ahead: 2 },
      { name: 'backend', branch: 'main', risk: 'CRITICAL', ahead: 5, behind: 1 },
      { name: 'shared', branch: 'feature', risk: 'LOW', ahead: 0 },
      { name: 'infra', branch: 'master', risk: 'HIGH', ahead: 1 },
    ],
    now: '2024-01-01T10:15:00.000Z',
  };

  snap = buildContextSnapshot(fullInput as any);
  assert(snap.project === 'veridian@main', `project: expected 'veridian@main', got '${snap.project}'`);
  assert(snap.activity === 'Code — App.tsx', `activity: expected 'Code — App.tsx', got '${snap.activity}'`);
  assert(snap.modifiedCount === 2, `modifiedCount: expected 2, got ${snap.modifiedCount}`);
  assert(snap.latestCommit === 'a1b2c3d', `latestCommit: expected 'a1b2c3d', got '${snap.latestCommit}'`);
  assert(snap.clipboardSecret === true, `clipboardSecret: expected true, got ${snap.clipboardSecret}`);
  assert(snap.brief !== null && snap.brief.wasDoing === 'Implemented context engine' && snap.brief.nextStep === 'Write tests', `brief mapping failed`);
  assert(snap.topRisk !== null && snap.topRisk.name === 'backend' && snap.topRisk.branch === 'main' && snap.topRisk.risk === 'CRITICAL', `topRisk mismatch: got ${JSON.stringify(snap.topRisk)}`);
  assert(snap.waiting.length === 8, `waiting length: expected 8, got ${snap.waiting.length}`);
  assert(snap.recentEvents.length === 3, `recentEvents length: expected 3, got ${snap.recentEvents.length}`);
  assert(snap.recentEvents[0].title === 'Opened IDE', `recentEvents newest first mismatch`);
  assert(snap.unknowns.length === 0, `unknowns should be empty, got ${snap.unknowns}`);

  // ----- 3. Missing / empty values -----
  const missingInput = {
    currentState: {
      virtualDesktop: '',
      activeApp: null,
      gitRepo: '',
      gitBranch: undefined,
      latestCommit: '',
      modifiedFiles: [],
    },
    timeline: null,
    brief: null,
    waiting: null,
    repos: [],
    now: '2024-01-01T00:00:00.000Z',
  };
  snap = buildContextSnapshot(missingInput as any);
  assert(snap.project === 'unknown project', 'missing gitRepo -> unknown project');
  assert(snap.activity === 'unknown', 'missing activeApp -> unknown');
  assert(snap.modifiedCount === 0, 'empty modifiedFiles count');
  assert(snap.latestCommit === 'none', 'missing latestCommit -> none');
  assert(snap.clipboardSecret === false, 'missing clipboardIsSecret -> false');
  assert(jsonEq(snap.unknowns.sort(), expectedUnknowns.sort()), 'unknowns list correct when missing');

  // ----- 4. Windows‑style gitRepo basename -----
  const winInput = {
    currentState: {
      gitRepo: 'C:\\\\Users\\\\Dev\\\\myapp',
      gitBranch: 'feature/bar',
    },
    now: '2024-01-01T00:00:00.000Z',
  };
  snap = buildContextSnapshot(winInput);
  assert(snap.project === 'myapp@feature/bar', `windows path basename: expected 'myapp@feature/bar', got '${snap.project}'`);

  // ----- 5. No absolute paths leak -----
  const pathCheckInputs = [fullInput, missingInput, winInput];
  pathCheckInputs.forEach((inp) => {
    const s = buildContextSnapshot(inp as any);
    const walk = (val: any) => {
      if (typeof val === 'string') {
        // Block Windows drive letters and POSIX absolute paths
        const noWinPath = !/^[a-zA-Z]:[\\\\/]/.test(val);
        const noPosixPath = !/^\/[^/]*$/.test(val);
        assert(noWinPath && noPosixPath, `absolute path found: ${val}`);
      } else if (Array.isArray(val)) {
        val.forEach(walk);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(walk);
      }
    };
    walk(s);
  });
  console.log('All path checks passed');

  // ----- 6. Timeline ordering heuristic -----
  const ascendingTimeline = [
    { timestamp: '2024-01-01T09:00:00Z', type: 'INFO', title: 'Older' },
    { timestamp: '2024-01-01T10:00:00Z', type: 'INFO', title: 'Newer' },
  ];
  const ascSnap = buildContextSnapshot({ timeline: ascendingTimeline });
  assert(ascSnap.recentEvents.length === 2, 'ascending timeline -> last N');
  assert(ascSnap.recentEvents[0].title === 'Older', 'ascending timeline ordering correct');

  // ----- 7. Waiting cap at 8 -----
  const manyWait = Array.from({ length: 20 }, (_, i) => ({
    title: `Wait ${i}`,
    detail: `Detail ${i}`,
    status: 'pending',
    ageSec: i,
  }));
  const manySnap = buildContextSnapshot({ waiting: manyWait });
  assert(manySnap.waiting.length === 8, `waiting cap at 8: got ${manySnap.waiting.length}`);

  // ----- 8. TopRisk when missing risk values -----
  const reposNoRisk = [
    { name: 'noRiskRepo', branch: 'main' },
    { name: 'lowRisk', branch: 'dev', risk: 'LOW' },
  ];
  const riskSnap = buildContextSnapshot({ repos: reposNoRisk as any });
  assert(riskSnap.topRisk === null, 'topRisk null when no risk values');

  // ----- 9. Clipboard secret Boolean coercion -----
  const csInput = {
    currentState: {
      clipboardIsSecret: 1, // truthy number
    },
  };
  const csSnap = buildContextSnapshot(csInput as any);
  assert(csSnap.clipboardSecret === true, 'clipboard secret coerces truthy');

  // ----- 10. Explicit null brief -----
  const briefNullSnap = buildContextSnapshot({ brief: null });
  assert(briefNullSnap.brief === null, 'explicit null brief -> null');

  console.log('All tests passed');
}

runTests();
