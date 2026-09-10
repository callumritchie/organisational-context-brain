'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  Activity,
  ArrowRight,
  BellRing,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  Eye,
  FileSearch,
  FlaskConical,
  GitBranch,
  KeyRound,
  Layers3,
  Network,
  PencilLine,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { PERSONAS } from '@/src/modules/canonical/ids';
import type { AnswerResponse } from '@/src/modules/ai/types';
import type {
  ContextEvidence,
  ContextResponse,
} from '@/src/modules/context/types';
import {
  DEMO_RANKING_V3,
  type RankingFactor,
} from '@/src/modules/ranking/demo-ranking-v3';

const PRESET =
  "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const EMPTY_GRAPH: ContextResponse['graph'] = { nodes: [], edges: [] };
const RANKING_FACTORS = Object.keys(DEMO_RANKING_V3.weights) as RankingFactor[];
type View = 'ask' | 'brain' | 'govern';

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}
function factorLabel(factor: RankingFactor) {
  return factor.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function EvidenceCard({
  item,
  index,
}: {
  item: ContextEvidence;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article id={`evidence-${index + 1}`} className="evidence-card">
      <div className="evidence-index">{index + 1}</div>
      <div className="evidence-body">
        <div className="evidence-meta">
          <span
            className={`signal-pill ${item.stance === 'SUPPORTS' ? 'supporting' : 'contradicting'}`}
          >
            {item.stance === 'SUPPORTS' ? <Check /> : <CircleDot />}
            {item.stance === 'SUPPORTS' ? 'Supports' : 'Challenges'}
          </span>
          <span className="signal-pill">
            {Math.round(item.confidence * 100)}% confidence
          </span>
          <span className="signal-pill">{item.provenance.assertionKind}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <button
          className="source-link"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          <FileSearch /> {item.source.title}
          <ChevronRight className={expanded ? 'rotate' : ''} />
          <span>{expanded ? 'Hide evidence detail' : 'Inspect evidence'}</span>
        </button>
        {expanded ? (
          <div className="evidence-detail">
            <div className="provenance-panel">
              <div>
                <span>Source URI</span>
                <code>{item.source.uri}</code>
              </div>
              <div>
                <span>Verbatim source excerpt</span>
                <p>“{item.source.excerpt}”</p>
              </div>
              <div className="detail-pair">
                <div>
                  <span>Assertion</span>
                  <code>{item.provenance.assertionId.slice(0, 13)}…</code>
                </div>
                <div>
                  <span>Process</span>
                  <code>
                    {item.provenance.process}@{item.provenance.processVersion}
                  </code>
                </div>
              </div>
            </div>
            <div className="ranking-grid">
              {RANKING_FACTORS.map((factor) => (
                <div key={factor} className="ranking-factor">
                  <span>{factorLabel(factor)}</span>
                  <div>
                    <i
                      style={{
                        width: percentage(
                          item.ranking[factor] /
                            DEMO_RANKING_V3.weights[factor],
                        ),
                      }}
                    />
                  </div>
                  <strong>+{item.ranking[factor].toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div
        className="score-orb"
        aria-label={`Ranking score ${item.ranking.total.toFixed(2)}`}
      >
        {item.ranking.total.toFixed(2)}
      </div>
    </article>
  );
}

function SystemFlow({ result }: { result: ContextResponse }) {
  const contested = result.epistemicState.status === 'contested';
  const [focus, setFocus] = useState<'question' | 'monitor' | 'system'>(
    'question',
  );
  const focusCopy =
    focus === 'question'
      ? 'Follow a question from permissioned source evidence, through shared meaning and graph relationships, into a cited answer and recommendation.'
      : focus === 'monitor'
        ? 'Follow a background agent as it watches a hypothesis, detects a material signal, and returns an observation for governed review.'
        : 'Explore the complete architecture: both loops reuse the same identities, ontology, provenance, permissions and knowledge graph.';
  return (
    <section className="system-map" aria-labelledby="system-map-title">
      <div className="map-heading">
        <div>
          <span className="eyebrow">Living context architecture</span>
          <h2 id="system-map-title">
            How scattered data becomes governed intelligence
          </h2>
        </div>
        <div className="map-legend">
          <span className="external-key">External</span>
          <span className="semantic-key">Semantic layer</span>
          <span className="brain-key">Context Brain</span>
          <span className="verified-key">Verified</span>
        </div>
      </div>
      <div
        className="flow-controls"
        role="group"
        aria-label="Choose a system flow"
      >
        <button
          type="button"
          className={focus === 'question' ? 'active' : ''}
          aria-pressed={focus === 'question'}
          onClick={() => setFocus('question')}
        >
          <UserRound /> Follow a human question
        </button>
        <button
          type="button"
          className={focus === 'monitor' ? 'active' : ''}
          aria-pressed={focus === 'monitor'}
          onClick={() => setFocus('monitor')}
        >
          <Bot /> Follow a hypothesis agent
        </button>
        <button
          type="button"
          className={focus === 'system' ? 'active' : ''}
          aria-pressed={focus === 'system'}
          onClick={() => setFocus('system')}
        >
          <Network /> Show the whole system
        </button>
      </div>
      <div className={`map-stage focus-${focus}`}>
        <svg
          className="map-lines"
          viewBox="0 0 1200 590"
          role="img"
          aria-label="External data flows through a semantic layer and knowledge graph to grounded answers and hypothesis monitors, whose observations feed back into governed context."
        >
          <defs>
            <marker
              id="arrow-indigo"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0l10 5-10 5z" fill="#4056b8" />
            </marker>
            <marker
              id="arrow-amber"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0l10 5-10 5z" fill="#c58a32" />
            </marker>
            <marker
              id="arrow-purple"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0l10 5-10 5z" fill="#7656b5" />
            </marker>
          </defs>
          <path
            className="flow external-flow"
            d="M170 120 C270 120 265 250 370 250"
          />
          <path
            className="flow external-flow"
            d="M170 230 C275 230 275 275 370 275"
          />
          <path
            className="flow external-flow"
            d="M170 340 C275 340 275 300 370 300"
          />
          <path
            className="flow external-flow"
            d="M170 450 C270 450 265 325 370 325"
          />
          <path
            className="flow semantic-flow"
            d="M565 290 C620 290 620 290 675 290"
          />
          <path
            className="flow brain-flow question-flow"
            d="M835 260 C890 225 915 185 970 160"
          />
          <path
            className="flow brain-flow monitor-flow"
            d="M835 320 C890 350 915 385 970 415"
          />
          <path
            className="feedback-flow"
            d="M1080 465 C1060 555 760 560 620 515 C470 467 325 505 195 500"
          />
          <circle cx="344" cy="250" r="3" className="pulse amber" />
          <circle cx="637" cy="290" r="3" className="pulse purple" />
          <circle cx="914" cy="195" r="3" className="pulse indigo" />
        </svg>
        <div className="map-boundary external-boundary">
          <span>Lives elsewhere</span>
        </div>
        <div className="map-boundary brain-boundary">
          <span>Northstar Context Brain</span>
        </div>
        <div className="source-stack">
          <span className="stage-label">Source systems</span>
          {result.sourceSystems.slice(0, 4).map((source) => (
            <div className="map-source" key={source.id}>
              <Database />
              <span>
                <strong>{source.name}</strong>
                <small>{source.type}</small>
              </span>
              <i />
            </div>
          ))}
        </div>
        <div className="semantic-core">
          <span className="stage-label">Semantic data layer</span>
          <div className="semantic-rings">
            <div className="ring ring-outer">
              <span>Provenance + versions</span>
            </div>
            <div className="ring ring-middle">
              <span>Ontology</span>
            </div>
            <div className="ring ring-inner">
              <GitBranch />
              <strong>Knowledge graph</strong>
              <small>
                {result.graph.nodes.length} nodes · {result.graph.edges.length}{' '}
                edges
              </small>
            </div>
          </div>
          <div className="semantic-tags">
            <span>Identity resolution</span>
            <span>Permission policy</span>
            <span>Hybrid retrieval</span>
          </div>
        </div>
        <div className="context-engine">
          <span className="stage-label">Context engine</span>
          <BrainCircuit />
          <strong>Resolve → rank → assess</strong>
          <small>{result.evidence.length} permitted evidence items</small>
        </div>
        <article className="map-output answer-output">
          <UserRound />
          <div>
            <span>Human asks</span>
            <strong>Grounded answer</strong>
            <small>Citations · uncertainty · next action</small>
          </div>
        </article>
        <article className="map-output agent-output">
          <Bot />
          <div>
            <span>Agents watch</span>
            <strong>Hypothesis monitors</strong>
            <small>New support · contradictions · staleness</small>
          </div>
          <b className={contested ? 'alert' : ''}>
            {contested ? 'Change found' : 'Watching'}
          </b>
        </article>
        <div className="feedback-label">
          <BellRing /> New observations become governed evidence—not automatic
          truth
        </div>
      </div>
      <div className="flow-narration" aria-live="polite">
        <span>
          {focus === 'question'
            ? 'Human loop'
            : focus === 'monitor'
              ? 'Agent loop'
              : 'Shared context'}
        </span>
        <p>{focusCopy}</p>
        <ArrowRight />
      </div>
    </section>
  );
}

function ContextGraph({ graph }: { graph: ContextResponse['graph'] }) {
  const { nodes, edges } = useMemo(() => {
    const typeCounts = new Map<string, number>();
    const positions: Record<string, { x: number; y: number }> = {
      Evidence: { x: 0, y: 0 },
      ResearchNote: { x: 245, y: 0 },
      MeetingNote: { x: 245, y: 0 },
      Document: { x: 245, y: 0 },
      MessageThread: { x: 245, y: 0 },
      Project: { x: 500, y: 80 },
      Hypothesis: { x: 745, y: 0 },
      Client: { x: 745, y: 190 },
    };
    const flowNodes: Node[] = graph.nodes.map((node) => {
      const index = typeCounts.get(node.type) ?? 0;
      typeCounts.set(node.type, index + 1);
      const base = positions[node.type] ?? { x: 500, y: 280 };
      const isSource = [
        'ResearchNote',
        'MeetingNote',
        'Document',
        'MessageThread',
      ].includes(node.type);
      return {
        id: node.id,
        position: { x: base.x, y: base.y + index * 105 },
        data: {
          label: (
            <span>
              <small>{node.type}</small>
              {node.label}
            </span>
          ),
        },
        style: {
          width: isSource ? 190 : 205,
          border:
            node.type === 'Evidence'
              ? '1px solid #a99ad1'
              : '1px solid #d8d2c7',
          borderRadius: 10,
          background: node.type === 'Project' ? '#28367f' : '#fffdf8',
          color: node.type === 'Project' ? '#fff' : '#20263a',
          boxShadow: '0 7px 18px rgba(30,35,58,.08)',
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
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.type === 'SUPPORTS' ? '#4056b8' : '#a16b2d',
      },
      style: {
        stroke: edge.type === 'SUPPORTS' ? '#4056b8' : '#a16b2d',
        strokeWidth: 1.4,
      },
      labelStyle: { fill: '#656b7c', fontSize: 8, fontWeight: 650 },
      labelBgStyle: { fill: '#f8f5ee', fillOpacity: 0.94 },
    }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [graph]);
  return (
    <section id="relationships" className="section-block graph-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Live permissioned subgraph</span>
          <h2>How this context connects</h2>
        </div>
        <span>
          {nodes.length} visible resources · {edges.length} asserted edges
        </span>
      </div>
      <div className="graph-canvas" aria-label="Focused context graph">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.45}
          maxZoom={1.5}
        >
          <Background color="#ddd7ca" gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="graph-legend">
        <span>
          <i className="evidence-dot" />
          Evidence
        </span>
        <span>
          <i className="source-dot" />
          Source content
        </span>
        <span>
          <i className="entity-dot" />
          Canonical entity
        </span>
        <strong>
          <ShieldCheck />
          Filtered before graph assembly
        </strong>
      </div>
    </section>
  );
}

function HypothesisMonitors({ result }: { result: ContextResponse }) {
  const contested = result.epistemicState.status === 'contested';
  return (
    <section className="monitor-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Proactive intelligence</span>
          <h2>Hypothesis monitors</h2>
        </div>
        <span className="prototype-badge">
          Prototype · evaluated on this answer run
        </span>
      </div>
      <div className="monitor-intro">
        <Bot />
        <p>
          Background agents can continually watch important organisational
          hypotheses, detect material changes, and propose updates for review.
          Continuous scheduling is not connected in this prototype yet.
        </p>
      </div>
      <div className="monitor-grid">
        <article className="monitor-card primary">
          <div>
            <Activity />
            <span>
              <small>Primary hypothesis</small>
              <strong>
                Identity verification is the main abandonment driver
              </strong>
            </span>
          </div>
          <p>{result.epistemicState.assessment}</p>
          <footer>
            <span
              className={`monitor-state ${contested ? 'contested' : 'supported'}`}
            >
              {contested ? 'Contested' : 'Supported'}
            </span>
            <span>
              {result.epistemicState.supportingEvidence} supporting ·{' '}
              {result.epistemicState.contradictingEvidence} challenging
            </span>
          </footer>
        </article>
        <article className="monitor-card">
          <div>
            <Eye />
            <span>
              <small>Counter-hypothesis</small>
              <strong>Eligibility guidance changes completion</strong>
            </span>
          </div>
          <p>
            {contested
              ? 'A newer research finding now challenges the single-cause explanation and warrants comparison.'
              : 'No visible counter-evidence yet. The monitor remains ready for a qualifying signal.'}
          </p>
          <footer>
            <span
              className={`monitor-state ${contested ? 'changed' : 'watching'}`}
            >
              {contested ? 'New signal' : 'Watching'}
            </span>
            <span>Recency and contradiction checks</span>
          </footer>
        </article>
        <article className="monitor-card">
          <div>
            <BellRing />
            <span>
              <small>Operational watch</small>
              <strong>Manual hand-offs compound verification delays</strong>
            </span>
          </div>
          <p>
            Watch connected research, meeting notes and operational documents
            for evidence that strengthens, weakens or ages this claim.
          </p>
          <footer>
            <span className="monitor-state watching">Watching</span>
            <span>Permission-aware alerts</span>
          </footer>
        </article>
      </div>
    </section>
  );
}

function SourceSystems({
  systems,
}: {
  systems: ContextResponse['sourceSystems'];
}) {
  return (
    <section id="sources" className="section-block">
      <div className="section-heading">
        <div>
          <span className="eyebrow">External connector lifecycle</span>
          <h2>Source systems</h2>
        </div>
        <span>
          {systems.filter((system) => system.status === 'healthy').length} of{' '}
          {systems.length} healthy
        </span>
      </div>
      <div className="source-system-grid">
        {systems.map((system) => (
          <article key={system.id} className="source-system-card">
            <div>
              <Database />
              <span>
                <strong>{system.name}</strong>
                <small>{system.type}</small>
              </span>
            </div>
            <span className={`source-status ${system.status}`}>
              <i />
              {system.status}
            </span>
            <p>
              {system.type === 'crm-accounts'
                ? 'Resolves CRM account 381 and atlas-bank to the canonical Atlas Bank resource.'
                : system.type === 'documents'
                  ? 'Maps the Atlas client folder and source keys to the same canonical client.'
                  : system.type === 'messages'
                    ? 'Maps the Atlas project channel while retaining its conversation thread.'
                    : 'Cursor-backed fixture ingestion with immutable source versions and provenance.'}
            </p>
            <time>
              {system.lastSuccessfulSyncAt
                ? `Synced ${new Date(system.lastSuccessfulSyncAt).toLocaleDateString('en-GB')}`
                : 'Awaiting first sync'}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}

function OntologyView({
  ontology,
  actorId,
  onPublished,
}: {
  ontology: ContextResponse['ontology'];
  actorId: string;
  onPublished: (ontology: ContextResponse['ontology']) => void;
}) {
  const [name, setName] = useState('COLLABORATES_WITH');
  const [from, setFrom] = useState('Person');
  const [to, setTo] = useState('Person');
  const [description, setDescription] = useState(
    'One person actively collaborates with another person.',
  );
  const [publishing, setPublishing] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState<string | null>(
    null,
  );
  const canEdit = actorId === PERSONAS[0].id;
  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishing(true);
    setPublicationMessage(null);
    try {
      const response = await fetch('/api/v1/ontology', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-actor': actorId,
        },
        body: JSON.stringify({ name, from, to, description }),
      });
      const payload = (await response.json()) as {
        ontology?: ContextResponse['ontology'];
        title?: string;
      };
      if (!response.ok || !payload.ontology)
        throw new Error(
          payload.title ?? 'The ontology version could not be published.',
        );
      onPublished(payload.ontology);
      setPublicationMessage(
        `Published ${payload.ontology.version}. The previous version is preserved.`,
      );
    } catch (requestError) {
      setPublicationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Ontology publication failed.',
      );
    } finally {
      setPublishing(false);
    }
  }
  return (
    <section id="ontology" className="section-block ontology-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Shared organisational language</span>
          <h2>Ontology</h2>
        </div>
        <span className="ontology-version">
          {ontology.version} · {ontology.status}
        </span>
      </div>
      <div className="ontology-summary">
        <div>
          <strong>{ontology.resourceTypes.length}</strong>
          <span>Resource types</span>
        </div>
        <div>
          <strong>{ontology.relationships.length}</strong>
          <span>Relationship rules</span>
        </div>
        <div>
          <KeyRound />
          <span>
            Immutable checksum<code>{ontology.checksum.slice(0, 12)}…</code>
          </span>
        </div>
      </div>
      <div className="ontology-grid">
        <div className="ontology-panel">
          <h3>Resource types</h3>
          <div className="type-list">
            {ontology.resourceTypes.map((type) => (
              <article key={type.name}>
                <i>{type.name.slice(0, 1)}</i>
                <span>
                  <strong>{type.name}</strong>
                  <small>
                    {type.kind} · {type.description}
                  </small>
                </span>
              </article>
            ))}
          </div>
        </div>
        <div className="ontology-panel">
          <h3>Allowed relationships</h3>
          <div className="relationship-list">
            {ontology.relationships.map((relationship) => (
              <article key={relationship.name}>
                <strong>{relationship.name.replaceAll('_', ' ')}</strong>
                <div>
                  <span>{relationship.from.join(' · ')}</span>
                  <ArrowRight />
                  <span>{relationship.to.join(' · ')}</span>
                </div>
                <p>{relationship.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
      <details className="govern-details">
        <summary>
          <PencilLine /> Edit the ontology{' '}
          <span>Advanced · publishes a new immutable version</span>
          <ChevronRight />
        </summary>
        <form className="ontology-editor" onSubmit={publish}>
          <div className="ontology-editor-heading">
            <PencilLine />
            <div>
              <strong>Add a relationship rule</strong>
              <span>
                Publishes a new immutable, checksummed ontology version.
              </span>
            </div>
            <span className="demo-only">Local demo only</span>
          </div>
          <div className="ontology-fields">
            <label>
              Rule name
              <Input
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9_]/g, '_'),
                  )
                }
                required
                pattern="[A-Z][A-Z0-9_]{2,63}"
              />
            </label>
            <label>
              From type
              <NativeSelect
                className="ontology-select"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              >
                {ontology.resourceTypes.map((type) => (
                  <NativeSelectOption key={type.name} value={type.name}>
                    {type.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label>
              To type
              <NativeSelect
                className="ontology-select"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              >
                {ontology.resourceTypes.map((type) => (
                  <NativeSelectOption key={type.name} value={type.name}>
                    {type.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label>
              Description
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                minLength={10}
                maxLength={240}
              />
            </label>
          </div>
          <div className="ontology-editor-footer">
            <span>
              <ShieldCheck />{' '}
              {canEdit
                ? 'Alex is the demo ontology publisher.'
                : 'Switch to Alex Chen to publish.'}{' '}
              Production writes are blocked until real authentication is added.
            </span>
            <Button type="submit" disabled={!canEdit || publishing}>
              {publishing ? 'Publishing…' : 'Publish new version'}
            </Button>
          </div>
          {publicationMessage ? (
            <p className="ontology-publication-message" role="status">
              {publicationMessage}
            </p>
          ) : null}
        </form>
      </details>
    </section>
  );
}

function AnswerView({
  result,
  answer,
  loading,
  query,
  setQuery,
  actorId,
  ask,
  mutationLoading,
  mutationMessage,
  learn,
}: {
  result: ContextResponse | null;
  answer: AnswerResponse['answer'] | null;
  loading: boolean;
  query: string;
  setQuery: (query: string) => void;
  actorId: string;
  ask: () => void;
  mutationLoading: boolean;
  mutationMessage: string | null;
  learn: () => void;
}) {
  const contested = result?.epistemicState.status === 'contested';
  return (
    <div className="view-page ask-page" id="ask">
      <div className="hero-row">
        <div>
          <span className="eyebrow indigo">
            Decision intelligence, with receipts
          </span>
          <h2>Ask the organisation</h2>
          <p>One answer assembled from the context you are allowed to see.</p>
        </div>
        <span className="mode-badge">
          <CircleDot />{' '}
          {answer?.mode === 'provider'
            ? `${answer.provider} · ${answer.model}`
            : 'Deterministic fallback'}
        </span>
      </div>
      <Card className="question-card">
        <CardContent>
          <label htmlFor="question">Question</label>
          <textarea
            id="question"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="question-footer">
            <span>
              <ShieldCheck /> Scoped to{' '}
              {PERSONAS.find((persona) => persona.id === actorId)?.name} before
              retrieval
            </span>
            <Button onClick={ask} disabled={loading} size="lg">
              {loading ? 'Assembling context…' : 'Ask brain'} <Send />
            </Button>
          </div>
        </CardContent>
      </Card>
      {result ? (
        <>
          <div className="answer-layout">
            <section className="answer-panel" aria-live="polite">
              <div className="answer-heading">
                <div className="answer-icon">
                  <BrainCircuit />
                </div>
                <div>
                  <span>Current organisational view</span>
                  <strong>
                    {answer?.mode === 'provider'
                      ? `Grounded by ${answer.provider} · ${answer.model}`
                      : 'Evidence-led, deterministic'}
                  </strong>
                </div>
                <span className={`state-badge ${result.epistemicState.status}`}>
                  {result.epistemicState.status}
                </span>
              </div>
              {answer?.mode === 'provider' ? (
                <div className="generated-claims">
                  {answer.claims.map((claim, claimIndex) => (
                    <p key={`${claim.text}-${claimIndex}`}>
                      <span>{claim.text}</span>
                      <small>
                        {claim.evidenceIds.map((evidenceId) => {
                          const evidenceIndex = result.evidence.findIndex(
                            (item) => item.id === evidenceId,
                          );
                          return evidenceIndex >= 0 ? (
                            <a
                              key={evidenceId}
                              href={`#evidence-${evidenceIndex + 1}`}
                            >
                              [{evidenceIndex + 1}]
                            </a>
                          ) : null;
                        })}
                      </small>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="answer-copy">{answer?.text ?? result.summary}</p>
              )}
              <div className="citation-row">
                {result.evidence.map((item, index) => (
                  <a key={item.id} href={`#evidence-${index + 1}`}>
                    [{index + 1}] {item.source.title}
                  </a>
                ))}
              </div>
            </section>
            <aside
              className={`recommendation-card ${contested ? 'contested' : ''}`}
            >
              <span className="recommendation-label">
                <Sparkles /> Recommended next move
              </span>
              <h3>
                {contested
                  ? 'Separate the competing hypotheses before scaling a fix.'
                  : 'Start with the document-check hand-off, then test guidance.'}
              </h3>
              <p>
                {contested
                  ? 'Run a controlled comparison of clearer eligibility guidance against document-check and hand-off improvements.'
                  : 'Instrument upload retries and status communication, then test clearer eligibility guidance before a larger verification rebuild.'}
              </p>
              <small>Inference from visible evidence · not a source fact</small>
            </aside>
          </div>
          <section className={`change-panel ${result.epistemicState.status}`}>
            <div>
              <FlaskConical />
              <span>
                <small>Automatic evidence assessment</small>
                <strong>{result.epistemicState.status}</strong>
              </span>
            </div>
            <p>
              {contested
                ? 'Newer evidence disputes a single-cause explanation. The answer has been downgraded and the next action changed.'
                : 'Visible evidence converges on verification friction; no active contradiction is visible to this persona.'}
              <span>
                {result.epistemicState.supportingEvidence} supporting ·{' '}
                {result.epistemicState.contradictingEvidence} challenging
              </span>
            </p>
            <div className="demo-action">
              <small>Interactive demo</small>
              {contested ? (
                <div className="demo-complete">
                  <Check /> Evidence change applied
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={actorId !== PERSONAS[0].id || mutationLoading}
                  onClick={learn}
                >
                  {mutationLoading
                    ? 'Adding evidence…'
                    : 'Try the compounding loop'}
                </Button>
              )}
              <small>
                {contested
                  ? 'Answer and recommendation updated'
                  : actorId === PERSONAS[0].id
                    ? 'Adds a prepared research finding'
                    : 'Switch to Alex Chen to run'}
              </small>
            </div>
            {mutationMessage ? (
              <p className="learning-message" role="status">
                {mutationMessage}
              </p>
            ) : null}
          </section>
          <section
            className="reasoning-strip"
            aria-label="How the brain answered"
          >
            <div className="reasoning-title">
              <Workflow />
              <span>
                <strong>How the brain answered</strong>
                <small>Five governed operations, not a black box</small>
              </span>
            </div>
            <ol>
              <li>
                <b>1</b>
                <span>
                  Resolve identity
                  <small>
                    {result.interpretedQuery.entities.length} entities
                  </small>
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  Apply ontology<small>{result.ontology.version}</small>
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  Traverse graph
                  <small>{result.graph.edges.length} connections</small>
                </span>
              </li>
              <li>
                <b>4</b>
                <span>
                  Enforce access<small>{result.evidence.length} visible</small>
                </span>
              </li>
              <li>
                <b>5</b>
                <span>
                  Assess tension<small>{result.epistemicState.status}</small>
                </span>
              </li>
            </ol>
          </section>
          <div className="security-summary">
            <ShieldCheck />
            <span>
              <strong>
                {result.actor.name} sees {result.evidence.length} permitted
                results.
              </strong>{' '}
              Restricted and inaccessible candidates never entered the pipeline.
            </span>
          </div>
          <details className="trace-details">
            <summary>
              <GitBranch /> Open Brain Inspector{' '}
              <span>Technical trace and resolved context</span>
              <ChevronRight />
            </summary>
            <div className="trace-content">
              <div className="resolved-entities">
                {result.interpretedQuery.entities.map((entity) => (
                  <div key={entity.id}>
                    <i>{entity.type.slice(0, 1)}</i>
                    <span>
                      <strong>{entity.name}</strong>
                      <small>
                        {entity.matchedAlias
                          ? `via “${entity.matchedAlias}” · `
                          : ''}
                        {entity.type}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <ol className="trace-list">
                {result.trace.map((stage, index) => (
                  <li key={stage.stage}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{stage.stage}</strong>
                      <p>{stage.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="trace-id">
                <span>Trace ID</span>
                <code>{result.traceId}</code>
              </div>
            </div>
          </details>
          <section id="evidence" className="section-block evidence-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Selected context</span>
                <h2>Evidence behind the answer</h2>
              </div>
              <span>
                {result.evidence.length} permitted results ·{' '}
                {result.retrieval.mode} · {result.rankingVersion}
              </span>
            </div>
            <div className="evidence-list">
              {result.evidence.map((item, index) => (
                <EvidenceCard key={item.id} item={item} index={index} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="loading-card">
          <BrainCircuit /> Building a permissioned context packet…
        </div>
      )}
    </div>
  );
}

export function BrainApp() {
  const [view, setView] = useState<View>('ask');
  const [query, setQuery] = useState(PRESET);
  const [actorId, setActorId] = useState<string>(PERSONAS[0].id);
  const [result, setResult] = useState<ContextResponse | null>(null);
  const [answer, setAnswer] = useState<AnswerResponse['answer'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const ask = useCallback(
    async (nextActorId = actorId, nextQuery = query) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/ask', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-demo-actor': nextActorId,
          },
          body: JSON.stringify({ query: nextQuery, maxEvidence: 6 }),
        });
        if (!response.ok)
          throw new Error(
            'The answer service could not complete this request.',
          );
        const payload = (await response.json()) as AnswerResponse;
        setResult(payload.context);
        setAnswer(payload.answer);
        return payload;
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Context request failed.',
        );
      } finally {
        setLoading(false);
      }
    },
    [actorId, query],
  );
  const resolveContext = useCallback(
    async (nextActorId: string, nextQuery: string) => {
      const response = await fetch('/api/v1/context', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-actor': nextActorId,
        },
        body: JSON.stringify({ query: nextQuery, maxEvidence: 6 }),
      });
      if (!response.ok)
        throw new Error('The context service could not complete this request.');
      const context = (await response.json()) as ContextResponse;
      setResult(context);
      setAnswer(null);
      return context;
    },
    [],
  );
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    queueMicrotask(() => {
      const hash = window.location.hash.slice(1);
      if (hash === 'brain' || hash === 'govern') setView(hash);
    });
    void ask();
  }, [ask]);
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'ask' || hash === 'brain' || hash === 'govern')
        setView(hash);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'resolve_organisational_context',
          title: 'Resolve organisational context',
          description:
            'Resolve a question into permission-aware evidence and a trace.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', minLength: 3, maxLength: 500 },
            },
            required: ['query'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          async execute(input: unknown) {
            if (
              !input ||
              typeof input !== 'object' ||
              typeof (input as { query?: unknown }).query !== 'string'
            )
              throw new Error('A query string is required.');
            const nextQuery = (input as { query: string }).query.trim();
            if (nextQuery.length < 3 || nextQuery.length > 500)
              throw new Error('Query must be 3–500 characters.');
            setQuery(nextQuery);
            const context = await resolveContext(actorId, nextQuery);
            return {
              traceId: context.traceId,
              actor: context.actor.name,
              summary: context.summary,
              evidenceCount: context.evidence.length,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [actorId, resolveContext]);
  function navigate(nextView: View) {
    setView(nextView);
    window.history.replaceState(null, '', `#${nextView}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function changeActor(nextActorId: string) {
    setActorId(nextActorId);
    setMutationMessage(null);
    void ask(nextActorId);
  }
  async function learnEligibilityFinding() {
    setMutationLoading(true);
    setMutationMessage(null);
    try {
      const response = await fetch('/api/v1/demo/research-mutation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-actor': actorId,
        },
        body: JSON.stringify({ mutation: 'eligibility-guidance-finding' }),
      });
      const payload = (await response.json()) as {
        mutation?: { applied: boolean; finding: string };
        title?: string;
      };
      if (!response.ok || !payload.mutation)
        throw new Error(
          payload.title ??
            'The prepared research finding could not be ingested.',
        );
      await ask(actorId, query);
      setMutationMessage(
        payload.mutation.applied
          ? `Learned: ${payload.mutation.finding}. The answer and monitors were reassessed.`
          : 'That finding was already present. The answer and monitors were reassessed without duplicates.',
      );
    } catch (requestError) {
      setMutationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Research ingestion failed.',
      );
    } finally {
      setMutationLoading(false);
    }
  }
  const healthyCount =
    result?.sourceSystems?.filter((source) => source.status === 'healthy')
      .length ?? 5;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <BrainCircuit />
          <span>
            Northstar
            <br />
            <strong>Context</strong>
          </span>
        </div>
        <nav aria-label="Product navigation">
          <p>Experience</p>
          <button
            className={view === 'ask' ? 'active' : ''}
            onClick={() => navigate('ask')}
          >
            <Sparkles />
            Ask<span>Answer</span>
          </button>
          <button
            className={view === 'brain' ? 'active' : ''}
            onClick={() => navigate('brain')}
          >
            <Network />
            Brain<span>Live map</span>
          </button>
          <button
            className={view === 'govern' ? 'active' : ''}
            onClick={() => navigate('govern')}
          >
            <ShieldCheck />
            Govern<span>System</span>
          </button>
        </nav>
        <div className="sidebar-model">
          <span>Two compounding loops</span>
          <div>
            <UserRound /> Human questions
          </div>
          <div>
            <Bot /> Hypothesis agents
          </div>
          <small>Both add governed observations to shared context.</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Northstar Labs</span>
            <h1>Organisational Context Brain</h1>
          </div>
          <div className="topbar-actions">
            <span className="health">
              <i /> {healthyCount} sources healthy
            </span>
            <NativeSelect
              aria-label="Demo persona"
              value={actorId}
              onChange={(event) => changeActor(event.target.value)}
            >
              {PERSONAS.map((persona) => (
                <NativeSelectOption key={persona.id} value={persona.id}>
                  {persona.name} · {persona.role}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </header>
        <div className="status-ribbon">
          <span>
            <i className="external-dot" /> External source systems
          </span>
          <ArrowRight />
          <span>
            <i className="semantic-dot" />{' '}
            {result?.ontology.version ?? 'northstar-ontology-v1'} ·{' '}
            {result?.ontology.status ?? 'current'}
          </span>
          <ArrowRight />
          <span>
            <i className="brain-dot" /> Context Brain
          </span>
          <strong>
            <ShieldCheck /> Permission-scoped for{' '}
            {result?.actor.name ?? 'Alex Chen'}
          </strong>
        </div>
        {error ? (
          <div className="error-panel">
            {error} Check the database setup and try again.
          </div>
        ) : null}
        {view === 'ask' ? (
          <AnswerView
            result={result}
            answer={answer}
            loading={loading}
            query={query}
            setQuery={setQuery}
            actorId={actorId}
            ask={() => void ask()}
            mutationLoading={mutationLoading}
            mutationMessage={mutationMessage}
            learn={() => void learnEligibilityFinding()}
          />
        ) : null}
        {view === 'brain' ? (
          <div className="view-page brain-page">
            <div className="hero-row">
              <div>
                <span className="eyebrow indigo">System + intelligence</span>
                <h2>The living context model</h2>
                <p>
                  See where data lives, how meaning is resolved, and how
                  questions and agents compound the brain.
                </p>
              </div>
            </div>
            {result ? (
              <>
                <SystemFlow result={result} />
                <HypothesisMonitors result={result} />
                <ContextGraph graph={result.graph ?? EMPTY_GRAPH} />
              </>
            ) : (
              <div className="loading-card">
                <BrainCircuit /> Building the live system map…
              </div>
            )}
          </div>
        ) : null}
        {view === 'govern' ? (
          <div className="view-page govern-page">
            <div className="hero-row">
              <div>
                <span className="eyebrow indigo">
                  Trust, meaning and access
                </span>
                <h2>Govern the brain</h2>
                <p>
                  Connect external systems, define shared semantics, and verify
                  the boundaries used before retrieval.
                </p>
              </div>
            </div>
            {result ? (
              <>
                <section className="govern-boundary">
                  <Database />
                  <div>
                    <span>External</span>
                    <strong>
                      Source data remains in its systems of record
                    </strong>
                  </div>
                  <ArrowRight />
                  <Layers3 />
                  <div>
                    <span>Northstar</span>
                    <strong>
                      Stores canonical identities, assertions, provenance and
                      versions
                    </strong>
                  </div>
                </section>
                <SourceSystems systems={result.sourceSystems} />
                <OntologyView
                  ontology={result.ontology}
                  actorId={actorId}
                  onPublished={(ontology) =>
                    setResult((current) =>
                      current ? { ...current, ontology } : current,
                    )
                  }
                />
                <section className="access-policy">
                  <ShieldCheck />
                  <div>
                    <span className="eyebrow">Current access lens</span>
                    <h2>{result.actor.name}</h2>
                    <p>
                      {result.accessProfile.sourceObjects} source items across{' '}
                      {result.accessProfile.clients.length} client scope and{' '}
                      {result.accessProfile.projects.length} project scope.
                      Access policy is applied before candidate retrieval.
                    </p>
                  </div>
                </section>
              </>
            ) : (
              <div className="loading-card">
                <BrainCircuit /> Loading governance controls…
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
