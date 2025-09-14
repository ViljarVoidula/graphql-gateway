import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Text,
  Title,
  Tooltip
} from '@mantine/core';
import { IconColumns, IconCopy, IconRefresh, IconTable } from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedFetch } from '../utils/auth';

const QUERY = `query SchemaChanges($serviceId: ID!, $filters: SchemaChangeFilterInput) {\n  schemaChanges(serviceId: $serviceId, filters: $filters) {\n    id previousHash newHash diff classification createdAt schemaSDL\n  }\n}`;

interface SchemaChangeItem {
  id: string;
  previousHash?: string | null;
  newHash: string;
  diff: string;
  classification: 'breaking' | 'non_breaking' | 'unknown';
  createdAt: string;
  schemaSDL: string;
}

interface Props {
  serviceId: string;
}

// Threshold for collapsing long unchanged blocks
const COLLAPSE_THRESHOLD = 8; // lines
const CONTEXT_HEAD_TAIL = 2; // show first/last N lines of collapsed block
const PAGE_SIZE = 20;

interface SideBySideRow {
  type: 'context' | 'add' | 'remove' | 'pair';
  oldLine?: string;
  newLine?: string;
  groupIndex?: number; // context group index for collapsing
}

export const SchemaChangesPanel: React.FC<Props> = ({ serviceId }) => {
  const [changes, setChanges] = useState<SchemaChangeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'latest' | 'all'>('latest');
  const [filterClassification, setFilterClassification] = useState<'all' | 'breaking' | 'non_breaking' | 'unknown'>('all');
  const [sideBySide, setSideBySide] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastFetched, setLastFetched] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, Set<number>>>({});
  const [cursor, setCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [rawSDLView, setRawSDLView] = useState<SchemaChangeItem | null>(null);
  const inFlight = useRef(false);

  // Reset when service changes
  useEffect(() => {
    setChanges([]);
    setLastFetched(0);
    setCursor(null);
  }, [serviceId]);

  const filtered = useMemo(() => {
    let list = [...changes];
    if (filterClassification !== 'all') list = list.filter((c) => c.classification === filterClassification);
    if (view === 'latest' && list.length > 0) list = list.slice(0, 1);
    return list;
  }, [changes, view, filterClassification]);

  const counts = useMemo(() => {
    const base = { breaking: 0, non_breaking: 0, unknown: 0 } as Record<string, number>;
    for (const c of changes) base[c.classification] = (base[c.classification] || 0) + 1;
    return base;
  }, [changes]);

  const load = useCallback(
    async (opts?: { append?: boolean; reset?: boolean }) => {
      if (inFlight.current) return; // guard
      const append = opts?.append;
      const reset = opts?.reset;
      inFlight.current = true;
      if (!append) setLoading(true);
      else setLoadingMore(true);
      try {
        const classificationsVar = filterClassification !== 'all' ? [filterClassification] : undefined;
        const filters: any = { limit: PAGE_SIZE };
        const localCursor = cursor; // snapshot
        if (append && localCursor) {
          filters.afterCreatedAt = localCursor.createdAt;
          filters.afterId = localCursor.id;
        }
        if (classificationsVar) filters.classifications = classificationsVar;
        const response = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ query: QUERY, variables: { serviceId, filters } })
        });
        const json = await response.json();
        if (json.errors) throw new Error(json.errors[0].message);
        const incoming: SchemaChangeItem[] = json.data.schemaChanges || [];
        setLastFetched(incoming.length);
        setChanges((prev) => {
          if (append) {
            const merged = [...prev, ...incoming.filter((i) => !prev.find((p) => p.id === i.id))];
            return merged;
          }
          return incoming;
        });
        if (incoming.length > 0) {
          const last = incoming[incoming.length - 1];
          setCursor({ createdAt: last.createdAt, id: last.id });
        } else if (reset) {
          setCursor(null);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load schema changes', e);
      } finally {
        if (!append) setLoading(false);
        else setLoadingMore(false);
        inFlight.current = false;
      }
    },
    [serviceId, filterClassification, cursor]
  );

  // Consolidated effect: triggers only on serviceId or classification change
  useEffect(() => {
    setCursor(null);
    load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, filterClassification]);

  const copy = (text: string) => navigator.clipboard.writeText(text);

  const toggleGroup = (changeId: string, groupIndex: number) => {
    setExpandedGroups((prev) => {
      const set = new Set(prev[changeId] || []);
      if (set.has(groupIndex)) set.delete(groupIndex);
      else set.add(groupIndex);
      return { ...prev, [changeId]: set };
    });
  };

  const renderUnified = (changeId: string, diff: string) => {
    const lines = diff.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let groupCounter = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('  ')) {
        let start = i;
        while (i < lines.length && lines[i].startsWith('  ')) i++;
        const end = i;
        const blockLen = end - start;
        const expanded = expandedGroups[changeId]?.has(groupCounter) || false;
        if (blockLen > COLLAPSE_THRESHOLD && !expanded) {
          const head = lines.slice(start, start + CONTEXT_HEAD_TAIL);
          const tail = lines.slice(end - CONTEXT_HEAD_TAIL, end);
          const hiddenCount = blockLen - head.length - tail.length;
          [...head, ...tail].forEach((line, idx) => {
            const trimmed = line.slice(2);
            elements.push(
              <div
                key={start + ':' + idx}
                style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 6px', display: 'flex' }}
              >
                <span style={{ opacity: 0.6, width: 18 }}> </span>
                <span style={{ flex: 1 }}>{trimmed}</span>
              </div>
            );
          });
          elements.splice(
            head.length,
            0,
            <div
              key={'collapse-' + groupCounter + '-' + changeId}
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                padding: '2px 6px',
                cursor: 'pointer',
                background: 'rgba(99,110,123,0.1)'
              }}
              onClick={() => toggleGroup(changeId, groupCounter)}
            >
              <span style={{ opacity: 0.6 }}>… {hiddenCount} unchanged lines (click to expand)</span>
            </div>
          );
          groupCounter++;
        } else {
          for (let k = start; k < end; k++) {
            const line = lines[k];
            const trimmed = line.slice(2);
            elements.push(
              <div key={k} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 6px', display: 'flex' }}>
                <span style={{ opacity: 0.6, width: 18 }}> </span>
                <span style={{ flex: 1 }}>{trimmed}</span>
              </div>
            );
          }
          if (blockLen > COLLAPSE_THRESHOLD) groupCounter++;
        }
      } else {
        const line = lines[i];
        const prefix = line.slice(0, 2);
        const trimmed = line.slice(2);
        let bg = 'transparent';
        if (prefix === '+ ') bg = 'rgba(46,160,67,0.15)';
        else if (prefix === '- ') bg = 'rgba(248,81,73,0.15)';
        elements.push(
          <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 6px', display: 'flex', background: bg }}>
            <span style={{ opacity: 0.6, width: 18 }}>{prefix.trim() || ' '}</span>
            <span style={{ flex: 1 }}>{trimmed}</span>
          </div>
        );
        i++;
      }
    }
    return elements;
  };

  const buildSideBySideRows = (diff: string): SideBySideRow[] => {
    const lines = diff.split('\n');
    const rows: SideBySideRow[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('  ')) {
        rows.push({ type: 'context', oldLine: line.slice(2), newLine: line.slice(2) });
        i++;
      } else if (line.startsWith('- ')) {
        if (i + 1 < lines.length && lines[i + 1].startsWith('+ ')) {
          rows.push({ type: 'pair', oldLine: line.slice(2), newLine: lines[i + 1].slice(2) });
          i += 2;
        } else {
          rows.push({ type: 'remove', oldLine: line.slice(2) });
          i++;
        }
      } else if (line.startsWith('+ ')) {
        rows.push({ type: 'add', newLine: line.slice(2) });
        i++;
      } else {
        rows.push({ type: 'context', oldLine: line, newLine: line });
        i++;
      }
    }
    let group = 0;
    let j = 0;
    while (j < rows.length) {
      if (rows[j].type === 'context') {
        const start = j;
        while (j < rows.length && rows[j].type === 'context') j++;
        const len = j - start;
        if (len > COLLAPSE_THRESHOLD) {
          for (let k = start; k < j; k++) rows[k].groupIndex = group;
          group++;
        }
      } else j++;
    }
    return rows;
  };

  // Basic intra-line highlighter for pair changes
  const highlightLineDiff = (oldLine?: string, newLine?: string) => {
    if (!oldLine || !newLine) return { oldRendered: oldLine, newRendered: newLine };
    if (oldLine === newLine) return { oldRendered: oldLine, newRendered: newLine };
    // Find common prefix
    let start = 0;
    while (start < oldLine.length && start < newLine.length && oldLine[start] === newLine[start]) start++;
    // Find common suffix
    let endOld = oldLine.length - 1;
    let endNew = newLine.length - 1;
    while (endOld >= start && endNew >= start && oldLine[endOld] === newLine[endNew]) {
      endOld--;
      endNew--;
    }
    const oldMid = oldLine.slice(start, endOld + 1);
    const newMid = newLine.slice(start, endNew + 1);
    return {
      oldRendered: (
        <span>
          {oldLine.slice(0, start)}
          <span style={{ background: 'rgba(248,81,73,0.35)' }}>{oldMid}</span>
          {oldLine.slice(endOld + 1)}
        </span>
      ),
      newRendered: (
        <span>
          {newLine.slice(0, start)}
          <span style={{ background: 'rgba(46,160,67,0.35)' }}>{newMid}</span>
          {newLine.slice(endNew + 1)}
        </span>
      )
    };
  };

  const renderSideBySide = (changeId: string, diff: string) => {
    const rows = buildSideBySideRows(diff);
    const expanded = expandedGroups[changeId] || new Set<number>();
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      if (r.type === 'context' && r.groupIndex != null) {
        const g = r.groupIndex;
        const start = i;
        while (i < rows.length && rows[i].groupIndex === g) i++;
        const end = i;
        const block = rows.slice(start, end);
        const expandedBlock = expanded.has(g);
        if (!expandedBlock) {
          const head = block.slice(0, CONTEXT_HEAD_TAIL);
          const tail = block.slice(-CONTEXT_HEAD_TAIL);
          const hidden = block.length - head.length - tail.length;
          head.forEach((h, idx) => elements.push(sideBySideRowElement(h, idx + ':' + start)));
          elements.push(
            <div
              key={'collapse-sbs-' + g}
              style={{
                display: 'flex',
                fontFamily: 'monospace',
                fontSize: 12,
                background: 'rgba(99,110,123,0.1)',
                cursor: 'pointer'
              }}
              onClick={() => toggleGroup(changeId, g)}
            >
              <div style={{ width: '50%', padding: '2px 6px' }}>… {hidden} unchanged lines</div>
              <div style={{ width: '50%', padding: '2px 6px' }}>(click to expand)</div>
            </div>
          );
          tail.forEach((t, idx) => elements.push(sideBySideRowElement(t, idx + ':' + end)));
        } else {
          block.forEach((b, idx) => elements.push(sideBySideRowElement(b, idx + ':' + start)));
          elements.push(
            <div
              key={'collapse-sbs-expanded-' + g}
              style={{
                display: 'flex',
                fontFamily: 'monospace',
                fontSize: 12,
                background: 'rgba(99,110,123,0.05)',
                cursor: 'pointer'
              }}
              onClick={() => toggleGroup(changeId, g)}
            >
              <div style={{ width: '100%', padding: '2px 6px', textAlign: 'center' }}>Collapse unchanged block ▲</div>
            </div>
          );
        }
      } else {
        elements.push(sideBySideRowElement(r, i));
        i++;
      }
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ display: 'flex', fontFamily: 'monospace', fontSize: 11, background: '#161b22', color: '#8b949e' }}>
          <div style={{ width: '50%', padding: '2px 6px' }}>Old</div>
          <div style={{ width: '50%', padding: '2px 6px' }}>New</div>
        </div>
        {elements}
      </div>
    );
  };

  const sideBySideRowElement = (r: SideBySideRow, key: React.Key) => {
    let oldBg = 'transparent';
    let newBg = 'transparent';
    if (r.type === 'add') newBg = 'rgba(46,160,67,0.15)';
    else if (r.type === 'remove') oldBg = 'rgba(248,81,73,0.15)';
    else if (r.type === 'pair') {
      oldBg = 'rgba(248,81,73,0.12)';
      newBg = 'rgba(46,160,67,0.12)';
    }
    let oldContent = r.oldLine || '';
    let newContent = r.newLine || '';
    if (r.type === 'pair') {
      const hl = highlightLineDiff(oldContent, newContent);
      oldContent = '';
      newContent = '';
      return (
        <div key={key} style={{ display: 'flex', fontFamily: 'monospace', fontSize: 12 }}>
          <div style={{ width: '50%', background: oldBg, padding: '2px 6px', whiteSpace: 'pre-wrap' }}>{hl.oldRendered}</div>
          <div style={{ width: '50%', background: newBg, padding: '2px 6px', whiteSpace: 'pre-wrap' }}>{hl.newRendered}</div>
        </div>
      );
    }
    return (
      <div key={key} style={{ display: 'flex', fontFamily: 'monospace', fontSize: 12 }}>
        <div style={{ width: '50%', background: oldBg, padding: '2px 6px', whiteSpace: 'pre-wrap' }}>{oldContent}</div>
        <div style={{ width: '50%', background: newBg, padding: '2px 6px', whiteSpace: 'pre-wrap' }}>{newContent}</div>
      </div>
    );
  };

  const classBadge = (cls: string) => (
    <Badge
      size="xs"
      color={cls === 'breaking' ? 'red' : cls === 'non_breaking' ? 'green' : 'gray'}
      variant={cls === 'breaking' ? 'filled' : 'light'}
      radius="sm"
    >
      {cls.replace('_', ' ')}
    </Badge>
  );

  return (
    <Paper withBorder p="lg" mt="md">
      <Group position="apart" mb="sm">
        <Group spacing="sm">
          <Title order={3}>Schema Changes</Title>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as any)}
            data={[
              { label: 'Latest', value: 'latest' },
              { label: 'All', value: 'all' }
            ]}
          />
          <SegmentedControl
            size="xs"
            value={filterClassification}
            onChange={(v) => setFilterClassification(v as any)}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Breaking', value: 'breaking' },
              { label: 'Non-breaking', value: 'non_breaking' },
              { label: 'Unknown', value: 'unknown' }
            ]}
          />
          <Tooltip label={sideBySide ? 'Switch to unified view' : 'Switch to side-by-side view'}>
            <ActionIcon size="sm" variant={sideBySide ? 'filled' : 'light'} onClick={() => setSideBySide((s) => !s)}>
              {sideBySide ? <IconTable size={14} /> : <IconColumns size={14} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group spacing="xs">
          <Tooltip label="Reload">
            <ActionIcon variant="light" onClick={() => load()} loading={loading as any}>
              {loading ? <Loader size={14} /> : <IconRefresh size={14} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Group spacing={6} mb="xs">
        <Badge size="xs" color="red" variant="outline">
          Breaking: {counts.breaking}
        </Badge>
        <Badge size="xs" color="green" variant="outline">
          Non-breaking: {counts.non_breaking}
        </Badge>
        <Badge size="xs" color="gray" variant="outline">
          Unknown: {counts.unknown}
        </Badge>
        <Badge size="xs" color="blue" variant="outline">
          Total: {changes.length}
        </Badge>
      </Group>
      {filtered.length === 0 && !loading && (
        <Text size="sm" color="dimmed">
          No schema changes recorded.
        </Text>
      )}
      <ScrollArea h={400} offsetScrollbars>
        {filtered.map((c) => (
          <Paper key={c.id} withBorder p="sm" mb="sm" radius="md">
            <Group position="apart" mb={6} spacing="xs">
              <Group spacing={6}>
                {classBadge(c.classification)}
                <Badge size="xs" color="blue" variant="outline">
                  {c.previousHash ? c.previousHash.slice(0, 7) : '∅'} → {c.newHash.slice(0, 7)}
                </Badge>
              </Group>
              <Group spacing={6}>
                <Text size="xs" color="dimmed">
                  {new Date(c.createdAt).toLocaleString()}
                </Text>
                <Group spacing={4}>
                  <Tooltip label="Copy diff">
                    <ActionIcon size="xs" variant="subtle" onClick={() => copy(c.diff)}>
                      <IconCopy size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="View full SDL snapshot">
                    <Button size="xs" compact variant="light" onClick={() => setRawSDLView(c)}>
                      SDL
                    </Button>
                  </Tooltip>
                </Group>
              </Group>
            </Group>
            <Code block sx={{ background: '#0d1117', color: '#c9d1d9', borderRadius: 4, padding: 0 }}>
              {sideBySide ? renderSideBySide(c.id, c.diff) : renderUnified(c.id, c.diff)}
            </Code>
          </Paper>
        ))}
      </ScrollArea>
      {filtered.length > 0 && view === 'latest' && changes.length > 1 && (
        <Button variant="subtle" size="xs" mt="sm" onClick={() => setView('all')}>
          Show all {changes.length} changes
        </Button>
      )}
      {view === 'all' && lastFetched === PAGE_SIZE && (
        <Button mt="sm" size="xs" variant="light" loading={loadingMore} onClick={() => load({ append: true })}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
      {rawSDLView && (
        <Paper withBorder p="md" mt="sm" sx={{ position: 'relative' }}>
          <Group position="apart" mb="xs">
            <Text size="sm" weight={500}>
              SDL Snapshot (hash {rawSDLView.newHash.slice(0, 7)})
            </Text>
            <Group spacing={4}>
              <Button size="xs" variant="subtle" onClick={() => copy(rawSDLView.schemaSDL)}>
                Copy SDL
              </Button>
              <Button size="xs" variant="light" onClick={() => setRawSDLView(null)}>
                Close
              </Button>
            </Group>
          </Group>
          <ScrollArea h={300} offsetScrollbars>
            <Code block sx={{ fontSize: 12 }}>
              {rawSDLView.schemaSDL}
            </Code>
          </ScrollArea>
        </Paper>
      )}
    </Paper>
  );
};

export default SchemaChangesPanel;
