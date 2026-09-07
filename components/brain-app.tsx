'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import {
  ArrowRight, BrainCircuit, Check, ChevronRight, CircleDot, Database,
  FileSearch, GitBranch, KeyRound, Layers3, Network, Search, Send, ShieldCheck, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { PERSONAS } from '@/src/modules/canonical/ids';
import type { ContextEvidence, ContextResponse } from '@/src/modules/context/types';

const PRESET = "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const EMPTY_GRAPH: ContextResponse['graph'] = { nodes: [], edges: [] };

function percentage(value: number) { return `${Math.round(value * 100)}%`; }

function EvidenceCard({ item, index }: { item: ContextEvidence; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article id={`evidence-${index + 1}`} className="evidence-card">
      <div className="evidence-index">{index + 1}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`signal-pill ${item.stance === 'SUPPORTS' ? 'supporting' : 'contradicting'}`}>
            <Check className="size-3" /> {item.stance === 'SUPPORTS' ? 'Supports hypothesis' : 'Contradicts hypothesis'}
          </span>
          <span className="signal-pill">{Math.round(item.confidence * 100)}% confidence</span>
          <span className="signal-pill">{item.provenance.assertionKind}</span>
        </div>
        <h3>{item.title}</h3>
        <p className="mt-2 leading-6 text-[var(--muted-foreground)]">{item.summary}</p>
        <button className="source-link" type="button" onClick={() => setExpanded((value) => !value)}>
          <FileSearch className="size-3.5" /> {item.source.title}
          <ChevronRight className={`size-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        {expanded ? (
          <div className="provenance-panel">
            <div><span>Source URI</span><code>{item.source.uri}</code></div>
            <div><span>Provenance excerpt</span><p>“{item.source.excerpt}”</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div><span>Assertion</span><code>{item.provenance.assertionId.slice(0, 13)}…</code></div>
              <div><span>Process</span><code>{item.provenance.process}@{item.provenance.processVersion}</code></div>
            </div>
          </div>
        ) : null}
        <div className="ranking-grid">
          {(['lexical', 'authority', 'confidence', 'freshness'] as const).map((factor) => (
            <div key={factor} className="ranking-factor">
              <span>{factor}</span>
              <div><i style={{ width: percentage(item.ranking[factor] / 0.62) }} /></div>
              <strong>+{item.ranking[factor].toFixed(2)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="score-orb" aria-label={`Ranking score ${item.ranking.total.toFixed(2)}`}>{item.ranking.total.toFixed(2)}</div>
    </article>
  );
}

function ContextGraph({ graph }: { graph: ContextResponse['graph'] }) {
  const { nodes, edges } = useMemo(() => {
    const typeCounts = new Map<string, number>();
    const positions: Record<string, { x: number; y: number }> = {
      Evidence: { x: 0, y: 0 },
      ResearchNote: { x: 245, y: 0 },
      MeetingNote: { x: 245, y: 0 },
      Project: { x: 500, y: 80 },
      Hypothesis: { x: 745, y: 0 },
      Client: { x: 745, y: 190 },
    };
    const flowNodes: Node[] = graph.nodes.map((node) => {
      const index = typeCounts.get(node.type) ?? 0;
      typeCounts.set(node.type, index + 1);
      const base = positions[node.type] ?? { x: 500, y: 280 };
      const isSource = node.type.endsWith('Note');
      return {
        id: node.id,
        position: { x: base.x, y: base.y + index * 105 },
        data: { label: <span><small>{node.type}</small>{node.label}</span> },
        style: {
          width: isSource ? 190 : 205,
          border: node.type === 'Evidence' ? '1px solid #9fcdbb' : '1px solid #d7e1dc',
          borderRadius: 10,
          background: node.type === 'Project' ? '#173b31' : '#fff',
          color: node.type === 'Project' ? '#fff' : '#1d332c',
          boxShadow: '0 7px 18px rgba(28, 54, 45, .08)',
          fontSize: 10,
          fontWeight: 650,
          textAlign: 'left' as const,
        },
      };
    });
    const flowEdges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type.replaceAll('_', ' ').toLowerCase(),
      markerEnd: { type: MarkerType.ArrowClosed, color: '#719b8c' },
      style: { stroke: edge.type === 'SUPPORTS' ? '#4f9a79' : '#9aaca4', strokeWidth: 1.4 },
      labelStyle: { fill: '#60736c', fontSize: 8, fontWeight: 650 },
      labelBgStyle: { fill: '#f8faf8', fillOpacity: 0.92 },
    }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [graph]);

  return (
    <section id="relationships" className="section-block graph-section">
      <div className="section-heading">
        <div><span className="eyebrow">Permissioned resource graph</span><h2>How this context connects</h2></div>
        <span>{nodes.length} visible resources · {edges.length} asserted edges</span>
      </div>
      <div className="graph-canvas" aria-label="Focused context graph">
        <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.45} maxZoom={1.5}>
          <Background color="#dbe4df" gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="graph-legend"><span><i className="evidence-dot" />Evidence</span><span><i className="source-dot" />Source content</span><span><i className="entity-dot" />Canonical entity</span><strong><ShieldCheck />Filtered before graph assembly</strong></div>
    </section>
  );
}

function SourceSystems({ systems }: { systems: ContextResponse['sourceSystems'] }) {
  return (
    <section id="sources" className="section-block">
      <div className="section-heading">
        <div><span className="eyebrow">Connector lifecycle</span><h2>Source systems</h2></div>
        <span>{systems.filter((system) => system.status === 'healthy').length} of {systems.length} healthy</span>
      </div>
      <div className="source-system-grid">
        {systems.map((system) => (
          <article key={system.id} className="source-system-card">
            <div><Database /><span><strong>{system.name}</strong><small>{system.type}</small></span></div>
            <span className={`source-status ${system.status}`}><i />{system.status}</span>
            <p>{system.type === 'crm-accounts'
              ? 'Resolves CRM account 381 and atlas-bank to the canonical Atlas Bank resource.'
              : system.type === 'documents'
                ? 'Maps the Atlas client folder and its source keys to the same canonical client.'
              : 'Cursor-backed fixture ingestion with immutable source versions and provenance.'}</p>
            <time>{system.lastSuccessfulSyncAt ? `Synced ${new Date(system.lastSuccessfulSyncAt).toLocaleDateString('en-GB')}` : 'Awaiting first sync'}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function OntologyView({ ontology }: { ontology: ContextResponse['ontology'] }) {
  return (
    <section id="ontology" className="section-block ontology-section">
      <div className="section-heading">
        <div><span className="eyebrow">Canonical model</span><h2>Ontology</h2></div>
        <span className="ontology-version">{ontology.version} · {ontology.status}</span>
      </div>
      <div className="ontology-summary">
        <div><strong>{ontology.resourceTypes.length}</strong><span>Resource types</span></div>
        <div><strong>{ontology.relationships.length}</strong><span>Relationship rules</span></div>
        <div><KeyRound /><span>Checksum<code>{ontology.checksum.slice(0, 12)}…</code></span></div>
      </div>
      <div className="ontology-grid">
        <div className="ontology-panel">
          <h3>Resource types</h3>
          <div className="type-list">
            {ontology.resourceTypes.map((type) => (
              <article key={type.name}><i>{type.name.slice(0, 1)}</i><span><strong>{type.name}</strong><small>{type.kind} · {type.description}</small></span></article>
            ))}
          </div>
        </div>
        <div className="ontology-panel">
          <h3>Allowed relationships</h3>
          <div className="relationship-list">
            {ontology.relationships.map((relationship) => (
              <article key={relationship.name}>
                <strong>{relationship.name.replaceAll('_', ' ')}</strong>
                <div><span>{relationship.from.join(' · ')}</span><ArrowRight /><span>{relationship.to.join(' · ')}</span></div>
                <p>{relationship.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function BrainApp() {
  const [query, setQuery] = useState(PRESET);
  const [actorId, setActorId] = useState<string>(PERSONAS[0].id);
  const [result, setResult] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (nextActorId = actorId, nextQuery = query) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-actor': nextActorId },
        body: JSON.stringify({ query: nextQuery, maxEvidence: 6 }),
      });
      if (!response.ok) throw new Error('The context service could not complete this request.');
      const context = await response.json() as ContextResponse;
      setResult(context);
      return context;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Context request failed.');
    } finally {
      setLoading(false);
    }
  }, [actorId, query]);

  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void ask();
  }, [ask]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: 'resolve_organisational_context',
      title: 'Resolve organisational context',
      description: 'Resolve a question into the same permission-aware evidence and trace shown in the current Northstar Context view.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 3, maxLength: 500 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(input: unknown) {
        if (!input || typeof input !== 'object' || typeof (input as { query?: unknown }).query !== 'string') {
          throw new Error('A query string is required.');
        }
        const nextQuery = (input as { query: string }).query.trim();
        if (nextQuery.length < 3 || nextQuery.length > 500) throw new Error('Query must be 3–500 characters.');
        setQuery(nextQuery);
        const context = await ask(actorId, nextQuery);
        if (!context) throw new Error('Context could not be resolved.');
        return { traceId: context.traceId, actor: context.actor.name, summary: context.summary, evidenceCount: context.evidence.length };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [actorId, ask]);

  function changeActor(nextActorId: string) {
    setActorId(nextActorId);
    void ask(nextActorId);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><BrainCircuit /><span>Northstar<br /><strong>Context</strong></span></div>
        <nav aria-label="Product navigation">
          <p>Workspace</p>
          <a className="active" href="#ask"><Sparkles />Ask</a>
          <a href="#evidence"><Search />Explore</a>
          <a href="#relationships"><Network />Graph <span>Live</span></a>
          <p>System</p>
          <a href="#sources"><Database />Sources</a>
          <a href="#ontology"><Layers3 />Ontology <span>v1</span></a>
        </nav>
        <div className="sidebar-flow">
          <p>Context pipeline</p>
          <div><span>Source</span><ArrowRight /><span>Evidence</span><ArrowRight /><span>Context</span></div>
          <small>Live · offline mode</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">Northstar Labs</span><h1>Organisational Context Brain</h1></div>
          <div className="topbar-actions">
            <span className="health"><i /> {result?.sourceSystems?.filter((source) => source.status === 'healthy').length ?? 4} sources healthy</span>
            <NativeSelect aria-label="Demo persona" value={actorId} onChange={(event) => changeActor(event.target.value)}>
              {PERSONAS.map((persona) => (
                <NativeSelectOption key={persona.id} value={persona.id}>{persona.name} · {persona.role}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </header>

        <div className="content-grid">
          <section className="main-column" id="ask">
            <div className="title-row">
              <div><span className="eyebrow green">Evidence before synthesis</span><h2>Ask the organisation</h2><p>Resolve a question into permission-aware evidence, entities and provenance.</p></div>
              <span className="mode-badge"><CircleDot /> No generative AI</span>
            </div>

            <Card className="question-card">
              <CardContent>
                <label htmlFor="question">Question</label>
                <textarea id="question" value={query} onChange={(event) => setQuery(event.target.value)} />
                <div className="question-footer">
                  <span><ShieldCheck /> Context will be scoped to {PERSONAS.find((persona) => persona.id === actorId)?.name}</span>
                  <Button onClick={() => void ask()} disabled={loading} size="lg">{loading ? 'Resolving…' : 'Resolve context'} <Send /></Button>
                </div>
              </CardContent>
            </Card>

            {error ? <div className="error-panel">{error} Check the database setup and try again.</div> : null}

            {result ? (
              <>
                <section className="answer-panel" aria-live="polite">
                  <div className="answer-heading">
                    <div className="answer-icon"><BrainCircuit /></div>
                    <div><span>Context synthesis</span><strong>Evidence-led, deterministic</strong></div>
                    <span className="freshness">Updated from {result.evidence.length} accessible evidence items</span>
                  </div>
                  <p>{result.summary}</p>
                  <div className="citation-row">
                    {result.evidence.map((item, index) => <a key={item.id} href={`#evidence-${index + 1}`}>[{index + 1}] {item.source.title}</a>)}
                  </div>
                </section>

                <section id="entities" className="entity-strip">
                  <span>Resolved context</span>
                  {result.interpretedQuery.entities.map((entity) => (
                    <div key={entity.id}><i>{entity.type.slice(0, 1)}</i><span>{entity.name}<small>{entity.matchedAlias ? `via “${entity.matchedAlias}” · ` : ''}{entity.type}{entity.identityKeys?.[0] ? ` · ${entity.identityKeys[0].sourceSystem}:${entity.identityKeys[0].externalKey}` : ''}</small></span></div>
                  ))}
                </section>

                {result.sourceSystems ? <SourceSystems systems={result.sourceSystems} /> : null}

                <ContextGraph graph={result.graph ?? EMPTY_GRAPH} />

                <section id="evidence" className="section-block">
                  <div className="section-heading">
                    <div><span className="eyebrow">Selected context</span><h2>Evidence</h2></div>
                    <span>{result.evidence.length} permitted results · ranked by {result.rankingVersion}</span>
                  </div>
                  <div className="evidence-list">
                    {result.evidence.map((item, index) => <EvidenceCard key={item.id} item={item} index={index} />)}
                  </div>
                </section>

                {result.ontology ? <OntologyView ontology={result.ontology} /> : null}
              </>
            ) : null}
          </section>

          <aside className="inspector" aria-label="Brain Inspector">
            <div className="inspector-heading">
              <div><GitBranch /><span><strong>Brain Inspector</strong><small>Live context trace</small></span></div>
              <span className="live-dot">Live</span>
            </div>
            {result ? (
              <>
                <div className="actor-card">
                  <span className="avatar">{PERSONAS.find((persona) => persona.id === actorId)?.initials}</span>
                  <div><strong>{result.actor.name}</strong><small>{result.actor.role}</small></div><ShieldCheck />
                </div>
                <ol className="trace-list">
                  {result.trace.map((stage, index) => (
                    <li key={stage.stage}><span>{index + 1}</span><div><strong>{stage.stage}</strong><p>{stage.detail}</p></div></li>
                  ))}
                </ol>
                <div className="security-note"><ShieldCheck /><div><strong>Fail-closed retrieval</strong><p>Only actor-visible resources enter candidate retrieval. Restricted titles, scores and snippets are never included here.</p></div></div>
                <div className="trace-id"><span>Trace ID</span><code>{result.traceId}</code></div>
              </>
            ) : <div className="inspector-loading">Building a permissioned context trace…</div>}
          </aside>
        </div>
      </main>
    </div>
  );
}
