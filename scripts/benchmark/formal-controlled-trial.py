#!/usr/bin/env python3
"""Local immutable formal trial; never changes scheduler, database policy or ACK.
Requires original benchmark service environment. No credential values are logged.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import resource
import subprocess
import time
from urllib.parse import urlsplit


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def read_limit(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--sha', required=True)
    parser.add_argument('--reuse', choices=['0', '1'], required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root, repo, output = Path(args.source_root).resolve(), Path(args.repository).resolve(), Path(args.output).resolve()
    for name in ['TEST_DATABASE_URL', 'CLICKHOUSE_TEST_URL', 'REDIS_URL']:
        if urlsplit(os.environ.get(name, '')).hostname not in ['127.0.0.1', 'localhost', '::1']:
            raise SystemExit('Explicit loopback fixture required: ' + name)
    if len(args.sha) != 40 or any(c not in '0123456789abcdef' for c in args.sha):
        raise SystemExit('Full immutable SHA required')
    if not root.is_dir() or not repo.is_dir():
        raise SystemExit('Existing source and repository required')
    now = utc_now()
    since_hour = now.minute * 60 + now.second
    if since_hour < 120 or 3600 - since_hour < 600:
        raise SystemExit('Do not start within two minutes after / ten minutes before a UTC hour boundary')
    spaces = {}
    for label, path in [('repository', repo), ('source', root), ('temporary', output.parent)]:
        stat = os.statvfs(path)
        free = stat.f_bavail * stat.f_frsize
        spaces[label] = free
        if free < 2 * 1024 ** 3:
            raise SystemExit('Disk preflight failed: ' + label)
    if any(Path(str(output) + suffix).exists() for suffix in ['', '.plan.json', '.wall.json', '.log']):
        raise SystemExit('Refusing to overwrite prior evidence')
    # The existing Node harness authenticates the complete Git blob tree before
    # and after execution. Both arms must use this same source SHA.
    plan = {'sourceSha': args.sha, 'startedAtUtc': now.isoformat(), 'events': 5000,
            'batchEvents': 50, 'intervalMs': 1000, 'queryIntervalMs': 10000,
            'maxQueued': 8, 'maxConcurrent': 2, 'drainLimitMs': 120000,
            'durationLimitMs': 220000, 'coverageReuse': 1, 'pagePathBatch': 1,
            'publicationConcurrency': 2, 'remainingReadDefault': 3,
            'remainingCanonicalReuse': int(args.reuse), 'timeline': True,
            'spacesBefore': spaces, 'runtime': {'node': subprocess.check_output(['node', '--version'], text=True).strip(),
            'cpuMax': read_limit('/sys/fs/cgroup/cpu.max'), 'memoryMax': read_limit('/sys/fs/cgroup/memory.max')},
            'ack': 'formal accepted after actual canonical publication and PG receipt commit',
            'input': 'unchanged original UUID/Date.now generator; same shape, not byte-identical wire data',
            'schedulerContractChanged': False}
    Path(str(output) + '.plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    env = os.environ.copy()
    env.update({'APP_ROOT': str(root), 'SOURCE_REPOSITORY': str(repo), 'SOURCE_SHA': args.sha,
                'BAIZE_INCREMENTAL_SESSIONS': '1', 'BAIZE_COVERAGE_SELECTED_RUNS': '1',
                'BAIZE_SESSION_PAGE_PATH_BATCH': '1', 'BAIZE_FACT_PUBLICATION_CONCURRENCY': '2',
                'BAIZE_SERIAL_RESOURCE_GATE': '1', 'BAIZE_BENCHMARK_TIMELINE': '1',
                'BAIZE_REMAINING_CANONICAL_REUSE': args.reuse, 'BENCHMARK_STORAGE': 'strict-clickhouse',
                'BENCHMARK_BATCHES': '100', 'BENCHMARK_SITES': '1', 'BENCHMARK_OUTPUT': str(output)})
    began = time.monotonic()
    with Path(str(output) + '.log').open('x') as log:
        result = subprocess.run(['node', '--import', 'tsx', str(root / 'scripts/independent-pipeline-benchmark.ts')],
                                cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
    wall = {'exit': result.returncode, 'overallWallSeconds': time.monotonic() - began,
            'finishedAtUtc': utc_now().isoformat(),
            'processPeakKiB': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
            'scope': 'Node app+harness child peak; excludes PG/CH/Redis'}
    Path(str(output) + '.wall.json').write_text(json.dumps(wall, indent=2) + '\n')
    print(json.dumps(wall))
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
