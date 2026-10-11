#!/usr/bin/env python3
"""Read four immutable reports; never run load or infer absent metrics as zero."""
import argparse
import json
import math
from pathlib import Path

COUNTS = ('inputEvents', 'producedEffectRows', 'hydratedEffectRows',
          'reusedSessions', 'reusedOwnerHeads', 'rebuiltSessions',
          'dirtyVisitors', 'fullPlans', 'deltaPlans', 'fallbackPlans')
NUMERIC = ('calls', 'failed', 'totalMs', 'maxMs', 'rows', 'requests',
           'requestBodyBytes', 'responseBodyBytes', 'queryTextBytes', 'bytes')


def number(value, field):
    if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                              or not math.isfinite(value) or value < 0):
        raise ValueError('invalid numeric field: ' + field)
    return value


def metrics(rows, fields):
    if not isinstance(rows, list):
        raise ValueError('metric rows must be an array')
    result = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('metric row must be an object')
        item = {key: row.get(key) for key in ('operation', 'stage', 'adapter', 'chPhase')}
        for key in fields:
            item[key] = number(row.get(key), key)
            item[key + 'MeasuredCalls'] = number(row.get(key + 'MeasuredCalls'), key + 'MeasuredCalls')
        result.append(item)
    return result


def extract(path):
    if not path.exists():
        return {'state': 'pending', 'file': str(path)}
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError('report must be an object')
    for key in ('planned', 'sent', 'acceptedEvents', 'unsent', 'queryAttempts'):
        if key not in data:
            raise ValueError('missing required report field: ' + key)
        number(data[key], key)
    server = data.get('phaseMetrics', {}).get('server', {})
    if not isinstance(server, dict):
        raise ValueError('server metrics must be an object')
    adapters = server.get('adapterAggregates', [])
    phases = server.get('chPhaseAggregates', [])
    if not isinstance(adapters, list) or not isinstance(phases, list):
        raise ValueError('metrics must be arrays')
    wall = {'overallWallSeconds': None, 'processPeakKiB': None, 'exit': None}
    sidecar = Path(str(path) + '.wall.txt')
    if sidecar.exists():
        for line in sidecar.read_text().splitlines():
            key, separator, value = line.partition('=')
            if separator and key in wall:
                parsed = float(value) if key == 'overallWallSeconds' else int(value)
                wall[key] = number(parsed, key)
    plan_path = Path(str(path) + '.plan.json')
    plan = json.loads(plan_path.read_text()) if plan_path.exists() else None
    if plan is not None and not isinstance(plan, dict):
        raise ValueError('plan must be an object')
    return {
        'state': 'available', 'file': str(path), 'status': data.get('status'),
        'schedule': {key: data.get(key) for key in ('planned', 'scheduled', 'sent', 'acceptedEvents', 'unsent')},
        'queries': {key: data.get(key) for key in ('queryAttempts', 'queryFailed', 'querySkippedBusy', 'querySampleCounts')},
        'finalIntegrity': {key: data.get(key) for key in ('drainReached', 'drainDeadlineReached', 'assertionsRun', 'assertionsPassed', 'assertionsExecuted', 'finalMetadata')},
        'source': {key: data.get(key) for key in ('sourceSha', 'sourceDigestBefore', 'sourceDigestAfter', 'sourceUnchanged')},
        'cleanup': data.get('cleanup'), 'cleanupFailed': data.get('cleanupFailed'),
        'plan': plan, 'processWallAndPeak': wall,
        'workerStagesCumulative': metrics([r for r in adapters if r.get('operation') == 'background_worker'], NUMERIC),
        'factsCHPhasesCumulative': metrics([r for r in phases if r.get('adapter') == 'facts'], NUMERIC),
        'workerIncrementalCounts': metrics([r for r in adapters if r.get('operation') == 'background_worker' and r.get('stage') == 'incremental_session_reuse'], COUNTS),
        'fallbackReasons': server.get('incrementalFallbackReasons'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', default='/tmp/baize-030b7ef-300')
    args = parser.parse_args()
    groups = {name: extract(Path(args.prefix + suffix + '.json')) for name, suffix in (
        ('fullWidth1', '-width1'), ('fullWidth2', '-width2'),
        ('deltaWidth1', '-delta-width1'), ('deltaWidth2', '-delta-width2'))}
    print(json.dumps({'schemaVersion': 1,
        'timingMeaning': 'Stage and CH phase milliseconds are cumulative, nested and overlapping; never sum them into wall. Sidecar wall includes the whole child process.',
        'comparisonLimit': 'Full runs omitted BAIZE_INCREMENTAL_SESSIONS and are not delta controls. Different query counts or produced work preclude causal speedup claims. Missing values are null; absent reports are pending.',
        'groups': groups}, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
