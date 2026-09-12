'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Database,
  FileSearch,
  FlaskConical,
  GitBranch,
  KeyRound,
  Layers3,
  Network,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import styles from './context-blueprint.module.css';

const PRESET =
  "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const RANKING_FACTORS = Object.keys(DEMO_RANKING_V3.weights) as RankingFactor[];

type View = 'ask' | 'brain' | 'govern';
type Journey = 'human' | 'agent';
type CapabilityStatus = 'built' | 'simulated' | 'next';

interface JourneyStage {
  id: string;
  label: string;
  layer: string;
  status: CapabilityStatus;
  what: string;
  why: string;
  input: string;
  operation: string;
  output: string;
  signals: string[];
  requirements: string[];
}

function joinCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function humanStages(result: ContextResponse): JourneyStage[] {
  const entityNames = result.interpretedQuery.entities
    .map((entity) => entity.name)
    .join(', ');
  return [
    {
      id: 'sources',
      label: 'Source change',
      layer: 'Connectors + lifecycle',
      status: 'built',
      what: `${result.sourceSystems.length} independently versioned source systems contribute to the Atlas context without becoming the canonical model.`,
      why: 'Organisational reality is fragmented and changes independently. The brain needs a repeatable, observable way to notice those changes.',
      input: 'CRM records, documents, research notes, meetings and messages',
      operation: 'Incremental sync + immutable version capture',
      output: `${result.accessProfile.sourceObjects} actor-eligible source objects`,
      signals: [
        'Cursor-backed sync',
        'Idempotent replay',
        `${result.sourceSystems.filter((source) => source.status === 'healthy').length} healthy connectors`,
      ],
      requirements: [
        'The system shall support incremental connector sync using durable cursors.',
        'The system shall preserve immutable source-object versions and source timestamps.',
        'Replaying an unchanged source version shall not create duplicate canonical resources.',
      ],
    },
    {
      id: 'security',
      label: 'Permission scope',
      layer: 'Security control plane',
      status: 'built',
      what: `${result.actor.name}’s workspace, client, project and source-object scope is established before candidate retrieval begins.`,
      why: 'Filtering after retrieval risks leaking titles, snippets, scores or model context. Access must constrain the search space itself.',
      input: `${result.actor.name} · ${result.actor.role}`,
      operation: 'Actor-scoped database transaction + RLS',
      output: `${result.accessProfile.sourceObjects} eligible source objects`,
      signals: [
        'Fail closed',
        'Pre-retrieval enforcement',
        'No exclusion side channel',
      ],
      requirements: [
        'All permission-sensitive reads shall execute inside an actor-scoped database transaction.',
        'Protected tables shall fail closed when actor context is absent.',
        'Inaccessible candidates shall never enter retrieval, ranking, traces or model input.',
      ],
    },
    {
      id: 'identity',
      label: 'Resolve identity',
      layer: 'Canonical resource model',
      status: 'built',
      what: `Aliases and source identities resolve to ${joinCount(result.interpretedQuery.entities.length, 'canonical resource')}: ${entityNames}.`,
      why: 'Without canonical identity, Atlas, atlas-bank and CRM account 381 can be reasoned about as unrelated things.',
      input: 'Source IDs, names, aliases, paths and channel metadata',
      operation: 'Explicit mappings + alias resolution',
      output: entityNames,
      signals: result.interpretedQuery.entities
        .slice(0, 3)
        .map((entity) =>
          entity.matchedAlias
            ? `“${entity.matchedAlias}” → ${entity.name}`
            : `${entity.type}: ${entity.name}`,
        ),
      requirements: [
        'Every entity or content object shall have exactly one canonical Resource identity.',
        'Source identities and aliases shall remain attached with provenance.',
        'Ambiguous inferred mappings shall retain confidence and remain distinguishable from explicit mappings.',
      ],
    },
    {
      id: 'semantics',
      label: 'Apply meaning',
      layer: 'Semantic data layer',
      status: 'built',
      what: `${result.ontology.version} interprets the resolved resources using ${result.ontology.resourceTypes.length} types and ${result.ontology.relationships.length} permitted relationship rules.`,
      why: 'Similarity can find related words; shared semantics explain what an object is and which relationships are valid.',
      input: 'Canonical resources + source-backed assertions',
      operation: 'Versioned ontology + semantic mappings',
      output: 'Typed resources and assertion-backed relationships',
      signals: [
        'Client → Project',
        'Evidence → Hypothesis',
        'Content → Evidence',
      ],
      requirements: [
        'Ontology versions shall be immutable and checksummed.',
        'Semantic mappings shall record whether they are explicit, rule-derived or AI-inferred.',
        'Inferred relationships shall retain confidence and provenance.',
      ],
    },
    {
      id: 'graph',
      label: 'Connect context',
      layer: 'Knowledge graph',
      status: 'built',
      what: `${joinCount(result.graph.nodes.length, 'visible node')} and ${joinCount(result.graph.edges.length, 'visible edge')} connect Atlas content, evidence, projects, people and hypotheses.`,
      why: 'The useful context around a question often lives in relationships that do not share the same vocabulary.',
      input: 'Typed canonical resources + visible assertions',
      operation: 'Permission-aware relationship traversal',
      output: `${result.relationships.length} relevant relationships for this context`,
      signals: [
        `${result.epistemicState.supportingEvidence} SUPPORTS`,
        `${result.epistemicState.contradictingEvidence} CONTRADICTS`,
        'DERIVED_FROM provenance',
      ],
      requirements: [
        'Graph edges shall operate between canonical Resources.',
        'An edge shall be visible only when at least one establishing assertion is actor-visible.',
        'Graph retrieval shall expose the relationships that contributed to context selection.',
      ],
    },
    {
      id: 'retrieval',
      label: 'Retrieve + rank',
      layer: 'Knowledge representations',
      status: 'built',
      what: `${result.retrieval.mode} retrieval produced ${joinCount(result.evidence.length, 'permitted evidence item')}, ranked by the transparent ${result.rankingVersion} configuration.`,
      why: 'Useful organisational context depends on authority, freshness, affinity and connectedness—not semantic similarity alone.',
      input: 'Lexical, vector, graph and structured candidates',
      operation: 'Reciprocal-rank fusion + contextual signals',
      output: `${result.evidence.length} ranked evidence items`,
      signals: [
        'Semantic relevance',
        'Project affinity',
        'Authority + freshness',
      ],
      requirements: [
        'Retrieval shall work without a generative model.',
        'Every ranking contribution shall be inspectable per evidence item.',
        'Ranking configurations shall be versioned and evaluated against known questions.',
      ],
    },
    {
      id: 'assessment',
      label: 'Assess tension',
      layer: 'Epistemic model',
      status: 'built',
      what: `${result.epistemicState.supportingEvidence} supporting and ${result.epistemicState.contradictingEvidence} challenging observations produce a “${result.epistemicState.status}” organisational view.`,
      why: 'A trustworthy brain must represent disagreement, uncertainty and change rather than flattening everything into one confident answer.',
      input: 'Ranked evidence + SUPPORTS/CONTRADICTS assertions',
      operation: 'Evidence-state assessment',
      output: `${result.epistemicState.status} hypothesis state`,
      signals: [
        `${result.epistemicState.supportingEvidence} supporting`,
        `${result.epistemicState.contradictingEvidence} challenging`,
        result.epistemicState.status,
      ],
      requirements: [
        'Context responses shall distinguish supported, contested and insufficient states.',
        'Contradictory evidence shall remain visible and attributable.',
        'A changed evidence set shall trigger reassessment without overwriting historical provenance.',
      ],
    },
    {
      id: 'context',
      label: 'Serve context',
      layer: 'Context service + consumers',
      status: 'built',
      what: `A reusable permissioned context packet is supplied to the ${result.generatedBy === 'deterministic-extractive' ? 'answer layer' : 'consumer'}, with citations and an auditable trace.`,
      why: 'The durable product is reusable context. The generated answer is only one disposable consumer of it.',
      input: 'Selected evidence, entities, relationships and epistemic state',
      operation: 'Bounded context assembly',
      output: 'ContextResponse → grounded answer + recommendation',
      signals: [
        'Evidence IDs',
        `Trace ${result.traceId.slice(0, 8)}…`,
        'Consumer-independent API',
      ],
      requirements: [
        'The Context API shall work independently of the user interface and LLM provider.',
        'Only authorised evidence IDs shall be accepted in generated claims.',
        'Every supplied claim shall be traceable to source-backed evidence.',
      ],
    },
  ];
}

function agentStages(result: ContextResponse): JourneyStage[] {
  const contested = result.epistemicState.status === 'contested';
  return [
    {
      id: 'register',
      label: 'Register hypothesis',
      layer: 'Hypothesis registry',
      status: 'built',
      what: '“Identity verification is the main abandonment driver” exists as a first-class, connected Hypothesis resource.',
      why: 'Agents need durable questions to monitor, not transient prompts that disappear after a run.',
      input: 'Hypothesis statement + project scope',
      operation: 'Create canonical Hypothesis resource',
      output: 'Versioned, addressable hypothesis',
      signals: ['Atlas Onboarding', 'Owner required', 'Current state retained'],
      requirements: [
        'A hypothesis shall be a canonical Resource with owner, scope and lifecycle state.',
        'Hypotheses shall connect to supporting and contradicting evidence assertions.',
        'Historical hypothesis states shall remain auditable.',
      ],
    },
    {
      id: 'policy',
      label: 'Define watch',
      layer: 'Monitoring policy',
      status: 'next',
      what: 'A future monitoring policy would define cadence, source scope, materiality threshold, owner and notification rules.',
      why: 'Continuous monitoring needs explicit boundaries; “let an agent keep looking” is not a safe or testable product requirement.',
      input: 'Hypothesis + actor/service identity + policy',
      operation: 'Schedule or event subscription',
      output: 'Bounded monitoring run specification',
      signals: ['Cadence', 'Materiality threshold', 'Notification policy'],
      requirements: [
        'Every monitor shall declare its owner, cadence, permitted scope and stop conditions.',
        'Monitoring runs shall use a dedicated permissioned service identity.',
        'Policies shall define when a change requires review or notification.',
      ],
    },
    {
      id: 'scan',
      label: 'Scan changes',
      layer: 'Permissioned retrieval',
      status: 'simulated',
      what: `The prototype reuses the live context service to scan ${result.evidence.length} permitted evidence items when the answer runs; a background scheduler is not connected.`,
      why: 'Agent monitoring must inherit the same retrieval and security guarantees as human questions.',
      input: 'Last checkpoint + changed source versions',
      operation: 'Delta-aware context resolution',
      output: 'New or materially changed evidence candidates',
      signals: [
        result.retrieval.mode,
        `${result.evidence.length} visible`,
        'Same RLS boundary',
      ],
      requirements: [
        'Monitoring retrieval shall use the same permission-aware context service as interactive questions.',
        'Runs shall checkpoint processed source versions.',
        'Unchanged evidence shall not repeatedly trigger equivalent observations.',
      ],
    },
    {
      id: 'detect',
      label: 'Detect signal',
      layer: 'Materiality assessment',
      status: 'simulated',
      what: contested
        ? 'The latest research is detected as a material contradiction to the single-cause hypothesis.'
        : 'No actor-visible contradiction currently crosses the materiality threshold.',
      why: 'Most changes are noise. A useful agent must explain why a new observation matters to the monitored hypothesis.',
      input: 'Evidence delta + current hypothesis state',
      operation: 'Relevance, contradiction and freshness assessment',
      output: contested
        ? 'Proposed contradiction observation'
        : 'No material change',
      signals: [
        `${result.epistemicState.contradictingEvidence} contradictions`,
        'Confidence retained',
        'Provenance required',
      ],
      requirements: [
        'A monitor shall distinguish new support, contradiction, staleness and no material change.',
        'Every proposed observation shall cite its exact source version and provenance span.',
        'Materiality decisions shall expose the policy and signals that produced them.',
      ],
    },
    {
      id: 'review',
      label: 'Review proposal',
      layer: 'Human governance',
      status: 'next',
      what: 'A future review queue would allow the hypothesis owner to accept, reject or amend the agent’s proposed observation.',
      why: 'Agent output should not silently become organisational truth, especially when it changes a decision-relevant hypothesis.',
      input: 'Proposed observation + provenance + policy result',
      operation: 'Human or policy-based approval',
      output: 'Accepted evidence assertion or rejected proposal',
      signals: ['Named reviewer', 'Decision reason', 'Immutable audit event'],
      requirements: [
        'Review-required proposals shall not affect canonical hypothesis state before approval.',
        'Review decisions shall record actor, timestamp and rationale.',
        'Rejected proposals shall remain auditable without entering normal retrieval.',
      ],
    },
    {
      id: 'compound',
      label: 'Compound context',
      layer: 'Durable context model',
      status: 'simulated',
      what: contested
        ? 'The prepared demo evidence has changed the shared hypothesis state and every later context response.'
        : 'The current context remains supported until a governed contradictory observation is added.',
      why: 'The system compounds by accumulating governed identities, versions, assertions, relationships and outcomes—not by retraining model weights.',
      input: 'Approved evidence assertion',
      operation: 'Update graph + signals + epistemic state',
      output: 'Improved durable context for every authorised consumer',
      signals: [
        'No duplicate assertion',
        'Previous version preserved',
        'Consumers see new state',
      ],
      requirements: [
        'Accepted observations shall update graph and epistemic state idempotently.',
        'Previous evidence, assertions and assessments shall not be overwritten.',
        'Subsequent authorised consumers shall receive the updated context consistently.',
      ],
    },
    {
      id: 'notify',
      label: 'Notify consumers',
      layer: 'Applications + workflows',
      status: 'next',
      what: 'Future monitors could notify owners or trigger workflows only when a governed, policy-relevant change occurs.',
      why: 'Proactive intelligence is valuable when it changes a decision or action—not when it produces constant background noise.',
      input: 'Material state transition + notification policy',
      operation: 'Route event to authorised consumers',
      output: 'Decision-relevant alert, workflow or refreshed context',
      signals: [
        'Meaningful change only',
        'Permission-safe payload',
        'Delivery audit',
      ],
      requirements: [
        'Notifications shall be emitted only for configured material transitions.',
        'Payloads shall contain no data outside the recipient’s current permission scope.',
        'Delivery, acknowledgement and failure shall be observable.',
      ],
    },
  ];
}

function StatusBadge({ status }: { status: CapabilityStatus }) {
  return (
    <span className={`${styles.statusBadge} ${styles[status]}`}>
      {status === 'next' ? 'Not built' : status}
    </span>
  );
}

function EvidenceDrawer({
  item,
  index,
  onClose,
}: {
  item: ContextEvidence;
  index: number;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.drawerBackdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence ${index + 1}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Evidence {index + 1}</span>
            <h2>{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close evidence">
            <X />
          </button>
        </header>
        <div className={styles.drawerBody}>
          <div className={styles.drawerState}>
            <span
              className={
                item.stance === 'SUPPORTS' ? styles.supports : styles.challenges
              }
            >
              {item.stance === 'SUPPORTS' ? 'Supports' : 'Challenges'}
            </span>
            <strong>{Math.round(item.confidence * 100)}% confidence</strong>
            <span>{item.provenance.assertionKind}</span>
          </div>
          <section>
            <h3>Source-backed observation</h3>
            <p>{item.summary}</p>
          </section>
          <section className={styles.sourceProof}>
            <FileSearch />
            <div>
              <strong>{item.source.title}</strong>
              <p>“{item.source.excerpt}”</p>
              <code>{item.source.uri}</code>
            </div>
          </section>
          <section>
            <h3>Why this evidence ranked here</h3>
            <div className={styles.rankingList}>
              {RANKING_FACTORS.map((factor) => (
                <div key={factor}>
                  <span>{factor.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                  <i>
                    <b
                      style={{
                        width: `${Math.min(100, Math.round((item.ranking[factor] / DEMO_RANKING_V3.weights[factor]) * 100))}%`,
                      }}
                    />
                  </i>
                  <strong>+{item.ranking[factor].toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>
          <footer>
            <span>Assertion</span>
            <code>{item.provenance.assertionId}</code>
            <span>Process</span>
            <code>
              {item.provenance.process}@{item.provenance.processVersion}
            </code>
          </footer>
        </div>
      </aside>
    </div>
  );
}

function StageInspector({ stage }: { stage: JourneyStage }) {
  const [copied, setCopied] = useState(false);
  async function copyRequirements() {
    await navigator.clipboard.writeText(
      stage.requirements.map((requirement) => `- ${requirement}`).join('\n'),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <aside className={styles.stageInspector}>
      <header>
        <div>
          <span>{stage.layer}</span>
          <h3>{stage.label}</h3>
        </div>
        <StatusBadge status={stage.status} />
      </header>
      <section>
        <h4>Why this layer exists</h4>
        <p>{stage.why}</p>
      </section>
      <section className={styles.contract}>
        <h4>Layer contract</h4>
        <div>
          <span>Input</span>
          <p>{stage.input}</p>
        </div>
        <ArrowRight />
        <div>
          <span>Output</span>
          <p>{stage.output}</p>
        </div>
      </section>
      <section className={styles.requirements}>
        <div>
          <h4>Requirement seeds</h4>
          <button type="button" onClick={() => void copyRequirements()}>
            <Copy />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <ul>
          {stage.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function JourneyCanvas({
  stage,
  journey,
  result,
}: {
  stage: JourneyStage;
  journey: Journey;
  result: ContextResponse;
}) {
  const layers = [
    'Sources',
    'Identity + policy',
    'Semantic graph',
    'Context consumer',
  ];
  return (
    <section className={styles.journeyCanvas}>
      <div className={styles.architectureRail}>
        {layers.map((layer, index) => (
          <div
            key={layer}
            className={
              index ===
              Math.min(
                3,
                journey === 'human'
                  ? Math.floor(
                      humanStages(result).findIndex(
                        (item) => item.id === stage.id,
                      ) / 2,
                    )
                  : Math.floor(
                      agentStages(result).findIndex(
                        (item) => item.id === stage.id,
                      ) / 2,
                    ),
              )
                ? styles.activeLayer
                : ''
            }
          >
            <span>{index + 1}</span>
            <strong>{layer}</strong>
            {index < layers.length - 1 ? <ArrowRight /> : null}
          </div>
        ))}
      </div>
      <div className={styles.stageStory}>
        <span className={styles.storyLabel}>
          What happens in the Atlas example
        </span>
        <h3>{stage.what}</h3>
        <div className={styles.transformation}>
          <article>
            <span>Input</span>
            <strong>{stage.input}</strong>
          </article>
          <div className={styles.operation}>
            <Activity />
            <span>{stage.operation}</span>
            <ArrowRight />
          </div>
          <article>
            <span>Output</span>
            <strong>{stage.output}</strong>
          </article>
        </div>
        <div className={styles.signalRow}>
          {stage.signals.map((signal) => (
            <span key={signal}>
              <Check />
              {signal}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.compoundingStrip}>
        <div>
          <GitBranch />
          <span>
            <strong>What persists</strong>
            <small>Not model weights</small>
          </span>
        </div>
        <p>
          {journey === 'human'
            ? 'Source versions, canonical identities, assertions, relationships, evidence states and traceable outcomes.'
            : 'Monitor checkpoints, reviewed observations, hypothesis history, graph changes and notification outcomes.'}
        </p>
      </div>
    </section>
  );
}

function BrainView({ result }: { result: ContextResponse }) {
  const [journey, setJourney] = useState<Journey>('human');
  const stages = useMemo(
    () => (journey === 'human' ? humanStages(result) : agentStages(result)),
    [journey, result],
  );
  const [selectedId, setSelectedId] = useState(stages[0]!.id);
  useEffect(() => {
    queueMicrotask(() => setSelectedId(stages[0]!.id));
  }, [journey, stages]);
  const selected =
    stages.find((stage) => stage.id === selectedId) ?? stages[0]!;
  return (
    <div className={styles.brainView}>
      <div className={styles.viewHeading}>
        <div>
          <span>Interactive product blueprint</span>
          <h2>The intelligence, layer by layer</h2>
          <p>
            Follow one real scenario. Select any stage to see what happened, why
            it exists and what the system must guarantee.
          </p>
        </div>
        <div
          className={styles.journeySwitch}
          role="group"
          aria-label="Choose a demo journey"
        >
          <button
            type="button"
            className={journey === 'human' ? styles.active : ''}
            onClick={() => setJourney('human')}
          >
            <UserRound />
            Human question
          </button>
          <button
            type="button"
            className={journey === 'agent' ? styles.active : ''}
            onClick={() => setJourney('agent')}
          >
            <Bot />
            Hypothesis agent
          </button>
        </div>
      </div>
      <div className={styles.blueprintGrid}>
        <nav
          className={styles.stageRail}
          aria-label={`${journey} journey stages`}
        >
          <div>
            <span>
              {journey === 'human' ? 'Question journey' : 'Monitoring journey'}
            </span>
            <strong>
              {journey === 'human'
                ? 'Atlas abandonment'
                : 'Verification hypothesis'}
            </strong>
          </div>
          {stages.map((stage, index) => (
            <button
              key={stage.id}
              type="button"
              className={selected.id === stage.id ? styles.activeStage : ''}
              onClick={() => setSelectedId(stage.id)}
            >
              <i>{index + 1}</i>
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.layer}</small>
              </span>
              <StatusBadge status={stage.status} />
              <ChevronRight />
            </button>
          ))}
        </nav>
        <JourneyCanvas stage={selected} journey={journey} result={result} />
        <StageInspector stage={selected} />
      </div>
      <div className={styles.statusLegend}>
        <span>
          <i className={styles.builtDot} />
          Built and backed by the working prototype
        </span>
        <span>
          <i className={styles.simulatedDot} />
          Simulated using a real foreground context run
        </span>
        <span>
          <i className={styles.nextDot} />
          Required next; not yet implemented
        </span>
      </div>
    </div>
  );
}

function AskView({
  result,
  answer,
  query,
  setQuery,
  loading,
  actorId,
  ask,
  mutationLoading,
  mutationMessage,
  learn,
}: {
  result: ContextResponse;
  answer: AnswerResponse['answer'] | null;
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  actorId: string;
  ask: () => void;
  mutationLoading: boolean;
  mutationMessage: string | null;
  learn: () => void;
}) {
  const [selectedEvidence, setSelectedEvidence] = useState<number | null>(null);
  const contested = result.epistemicState.status === 'contested';
  const claims = answer?.mode === 'provider' ? answer.claims.slice(0, 3) : [];
  return (
    <div className={styles.askView}>
      <div className={styles.viewHeading}>
        <div>
          <span>Decision intelligence, with receipts</span>
          <h2>Ask the organisation</h2>
          <p>
            The answer is one consumer. The permissioned context packet is the
            durable product.
          </p>
        </div>
        <span className={styles.providerBadge}>
          <CircleDot />
          {answer?.mode === 'provider'
            ? `${answer.provider} · ${answer.model}`
            : 'Evidence-led, deterministic'}
        </span>
      </div>
      <div className={styles.askGrid}>
        <section className={styles.answerWorkspace}>
          <div className={styles.questionBox}>
            <label htmlFor="blueprint-question">Question</label>
            <textarea
              id="blueprint-question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div>
              <span>
                <ShieldCheck />
                Scoped to {result.actor.name} before retrieval
              </span>
              <Button disabled={loading} onClick={ask}>
                {loading ? 'Assembling…' : 'Ask brain'}
                <Send />
              </Button>
            </div>
          </div>
          <article className={styles.answerCard}>
            <header>
              <div>
                <BrainCircuit />
                <span>
                  <small>Current organisational view</small>
                  <strong>
                    {answer?.mode === 'provider'
                      ? `Grounded by ${answer.provider} · ${answer.model}`
                      : 'Evidence-led, deterministic'}
                  </strong>
                </span>
              </div>
              <span className={contested ? styles.contested : styles.supported}>
                {result.epistemicState.status}
              </span>
            </header>
            {claims.length ? (
              <div className={styles.claims}>
                {claims.map((claim, index) => (
                  <p key={`${claim.text}-${index}`}>
                    {claim.text}
                    <span>
                      {claim.evidenceIds.map((evidenceId) => {
                        const evidenceIndex = result.evidence.findIndex(
                          (item) => item.id === evidenceId,
                        );
                        return evidenceIndex >= 0 ? (
                          <button
                            key={evidenceId}
                            type="button"
                            onClick={() => setSelectedEvidence(evidenceIndex)}
                          >
                            [{evidenceIndex + 1}]
                          </button>
                        ) : null;
                      })}
                    </span>
                  </p>
                ))}
                {answer!.claims.length > claims.length ? (
                  <small>
                    {answer!.claims.length - claims.length} additional
                    evidence-backed claims are represented in the context
                    packet.
                  </small>
                ) : null}
              </div>
            ) : (
              <p className={styles.deterministicAnswer}>
                {answer?.text ?? result.summary}
              </p>
            )}
            <footer>
              <span>
                <Sparkles />
                Recommended next move
              </span>
              <strong>
                {contested
                  ? 'Separate the competing hypotheses before scaling a fix.'
                  : 'Start with the document-check hand-off, then test guidance.'}
              </strong>
              <p>
                {contested
                  ? 'Compare clearer eligibility guidance against document-check and hand-off improvements.'
                  : 'Instrument upload retries and status communication before a larger verification rebuild.'}
              </p>
              <small>Inference from visible evidence · not a source fact</small>
            </footer>
          </article>
        </section>
        <aside className={styles.answerIntelligence}>
          <section className={styles.epistemicCard}>
            <header>
              <FlaskConical />
              <span>
                <small>Automatic evidence assessment</small>
                <strong>{result.epistemicState.status}</strong>
              </span>
              <b>
                {result.epistemicState.supportingEvidence} :{' '}
                {result.epistemicState.contradictingEvidence}
              </b>
            </header>
            <p>{result.epistemicState.assessment}</p>
            <div>
              <span>{result.epistemicState.supportingEvidence} supporting</span>
              <span>
                {result.epistemicState.contradictingEvidence} challenging
              </span>
            </div>
          </section>
          <section className={styles.evidenceStack}>
            <header>
              <div>
                <span>Evidence behind this answer</span>
                <strong>{result.evidence.length} permitted results</strong>
              </div>
              <small>
                {result.retrieval.mode} · {result.rankingVersion}
              </small>
            </header>
            {result.evidence.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedEvidence(index)}
              >
                <i
                  className={
                    item.stance === 'SUPPORTS'
                      ? styles.supportDot
                      : styles.challengeDot
                  }
                >
                  {index + 1}
                </i>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.source.title}</small>
                </span>
                <b>{item.ranking.total.toFixed(2)}</b>
                <ChevronRight />
              </button>
            ))}
          </section>
          <section className={styles.compoundAction}>
            <div>
              <GitBranch />
              <span>
                <small>Shared context changed</small>
                <strong>
                  {contested
                    ? 'Contradiction is now durable'
                    : 'Current view is supported'}
                </strong>
              </span>
            </div>
            {contested ? (
              <span className={styles.applied}>
                <Check />
                Evidence change applied
              </span>
            ) : (
              <Button
                variant="outline"
                disabled={actorId !== PERSONAS[0].id || mutationLoading}
                onClick={learn}
              >
                {mutationLoading
                  ? 'Adding evidence…'
                  : 'Try the compounding loop'}
              </Button>
            )}
            {mutationMessage ? <p>{mutationMessage}</p> : null}
          </section>
          <div className={styles.securityLine}>
            <ShieldCheck />
            <span>
              <strong>
                {result.actor.name} sees {result.evidence.length} results.
              </strong>{' '}
              Inaccessible candidates never entered the pipeline.
            </span>
          </div>
        </aside>
      </div>
      {selectedEvidence !== null ? (
        <EvidenceDrawer
          item={result.evidence[selectedEvidence]!}
          index={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      ) : null}
    </div>
  );
}

function GovernView({ result }: { result: ContextResponse }) {
  const [tab, setTab] = useState<'boundary' | 'ontology' | 'access'>(
    'boundary',
  );
  const hasContradiction = result.epistemicState.contradictingEvidence > 0;
  return (
    <div className={styles.governView}>
      <div className={styles.viewHeading}>
        <div>
          <span>Trust, meaning and ownership</span>
          <h2>Govern the brain</h2>
          <p>
            Inspect the control plane that keeps connected context attributable,
            permission-safe and changeable.
          </p>
        </div>
        <div className={styles.governTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'boundary'}
            className={tab === 'boundary' ? styles.active : ''}
            onClick={() => setTab('boundary')}
          >
            System boundary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ontology'}
            className={tab === 'ontology' ? styles.active : ''}
            onClick={() => setTab('ontology')}
          >
            Ontology
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'access'}
            className={tab === 'access' ? styles.active : ''}
            onClick={() => setTab('access')}
          >
            Access model
          </button>
        </div>
      </div>
      <div className={styles.governCanvas}>
        {tab === 'boundary' ? (
          <div className={styles.boundaryView}>
            <section>
              <header>
                <Database />
                <span>
                  <small>Lives elsewhere</small>
                  <h3>External source systems</h3>
                </span>
                <b>{result.sourceSystems.length} connected</b>
              </header>
              <div className={styles.systemGrid}>
                {result.sourceSystems.map((system) => (
                  <article key={system.id}>
                    <Database />
                    <span>
                      <strong>{system.name}</strong>
                      <small>{system.type}</small>
                    </span>
                    <b>
                      <i />
                      {system.status}
                    </b>
                  </article>
                ))}
              </div>
            </section>
            <div className={styles.boundaryArrow}>
              <ArrowRight />
              <span>Sync + map</span>
            </div>
            <section className={styles.brainBoundary}>
              <header>
                <BrainCircuit />
                <span>
                  <small>Northstar Context Brain</small>
                  <h3>Durable organisational context</h3>
                </span>
                <b>Working MVP</b>
              </header>
              <div className={styles.capabilityGrid}>
                <article>
                  <KeyRound />
                  <strong>Canonical identity</strong>
                  <p>Stable Resources and aliases independent of source IDs.</p>
                </article>
                <article>
                  <Layers3 />
                  <strong>Semantic meaning</strong>
                  <p>Versioned ontology, mappings and typed assertions.</p>
                </article>
                <article>
                  <GitBranch />
                  <strong>Connected evidence</strong>
                  <p>Permission-aware relationships and provenance.</p>
                </article>
                <article>
                  <Workflow />
                  <strong>Reusable context</strong>
                  <p>Ranked evidence packets for any authorised consumer.</p>
                </article>
              </div>
            </section>
          </div>
        ) : null}
        {tab === 'ontology' ? (
          <div className={styles.ontologyView}>
            <section>
              <header>
                <span>
                  <small>Resource vocabulary</small>
                  <h3>
                    {result.ontology.resourceTypes.length} concepts the brain
                    understands
                  </h3>
                </span>
                <b>{result.ontology.version}</b>
              </header>
              <div className={styles.typeGrid}>
                {result.ontology.resourceTypes.map((type) => (
                  <article key={type.name}>
                    <i>{type.name.slice(0, 1)}</i>
                    <span>
                      <strong>{type.name}</strong>
                      <small>{type.kind}</small>
                    </span>
                    <p>{type.description}</p>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <header>
                <span>
                  <small>Relationship grammar</small>
                  <h3>
                    {result.ontology.relationships.length} permitted connections
                  </h3>
                </span>
                <b>{result.ontology.status}</b>
              </header>
              <div className={styles.relationshipGrid}>
                {result.ontology.relationships.map((relationship) => (
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
              <footer>
                <KeyRound />
                <span>Immutable checksum</span>
                <code>{result.ontology.checksum.slice(0, 18)}…</code>
              </footer>
            </section>
          </div>
        ) : null}
        {tab === 'access' ? (
          <div className={styles.accessView}>
            <section>
              <span className={styles.sectionKicker}>
                One question · three permissioned realities
              </span>
              <h3>Access changes context before an AI sees it</h3>
              <div className={styles.personaGrid}>
                {PERSONAS.map((persona) => {
                  const active = persona.id === result.actor.id;
                  const count =
                    persona.role === 'External Contractor'
                      ? hasContradiction
                        ? 4
                        : 3
                      : hasContradiction
                        ? 6
                        : 5;
                  return (
                    <article
                      key={persona.id}
                      className={active ? styles.activePersona : ''}
                    >
                      <div>
                        <span>{persona.initials}</span>
                        <p>
                          <strong>{persona.name}</strong>
                          <small>{persona.role}</small>
                        </p>
                        {active ? <b>Current</b> : null}
                      </div>
                      <dl>
                        <div>
                          <dt>Evidence scope</dt>
                          <dd>
                            {active ? result.evidence.length : count} items
                          </dd>
                        </div>
                        <div>
                          <dt>Enforcement</dt>
                          <dd>Pre-retrieval</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className={styles.accessContract}>
              <header>
                <ShieldCheck />
                <span>
                  <small>Current access lens</small>
                  <h3>{result.actor.name}</h3>
                </span>
              </header>
              <div>
                <span>Clients</span>
                <strong>{result.accessProfile.clients.join(', ')}</strong>
              </div>
              <div>
                <span>Projects</span>
                <strong>{result.accessProfile.projects.join(', ')}</strong>
              </div>
              <div>
                <span>Source objects</span>
                <strong>{result.accessProfile.sourceObjects}</strong>
              </div>
              <footer>
                <Check />
                Database-enforced before retrieval
                <Check />
                No restricted metadata in traces
                <Check />
                Same boundary for APIs and agents
              </footer>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ContextBlueprint() {
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
            'Resolve a question into permission-aware evidence and an auditable context trace.',
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
            setQuery(nextQuery);
            const payload = await ask(actorId, nextQuery);
            if (!payload) throw new Error('Context could not be resolved.');
            return {
              traceId: payload.context.traceId,
              actor: payload.context.actor.name,
              summary: payload.context.summary,
              evidenceCount: payload.context.evidence.length,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [actorId, ask]);

  function navigate(nextView: View) {
    setView(nextView);
    window.history.replaceState(null, '', `#${nextView}`);
  }
  function changeActor(nextActorId: string) {
    setActorId(nextActorId);
    setMutationMessage(null);
    void ask(nextActorId);
  }
  async function learn() {
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
          payload.title ?? 'The research finding could not be ingested.',
        );
      await ask(actorId, query);
      setMutationMessage(
        payload.mutation.applied
          ? 'New source version mapped, linked and reassessed.'
          : 'Finding already present; context reassessed without duplicates.',
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
    result?.sourceSystems.filter((source) => source.status === 'healthy')
      .length ?? 5;
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <BrainCircuit />
          <span>
            Northstar<strong>Context</strong>
          </span>
        </div>
        <nav aria-label="Product navigation">
          <span>Experience</span>
          <button
            type="button"
            className={view === 'ask' ? styles.active : ''}
            onClick={() => navigate('ask')}
          >
            <Sparkles />
            <span>
              <strong>Ask</strong>
              <small>Decision view</small>
            </span>
          </button>
          <button
            type="button"
            className={view === 'brain' ? styles.active : ''}
            onClick={() => navigate('brain')}
          >
            <Network />
            <span>
              <strong>Brain</strong>
              <small>Product blueprint</small>
            </span>
          </button>
          <button
            type="button"
            className={view === 'govern' ? styles.active : ''}
            onClick={() => navigate('govern')}
          >
            <ShieldCheck />
            <span>
              <strong>Govern</strong>
              <small>Control plane</small>
            </span>
          </button>
        </nav>
        <div className={styles.loopSummary}>
          <span>Two compounding loops</span>
          <div>
            <UserRound />
            Human questions<b>Built</b>
          </div>
          <div>
            <Bot />
            Hypothesis agents<b>Partial</b>
          </div>
          <small>Both reuse the same governed context service.</small>
        </div>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span>Northstar Labs</span>
            <h1>Organisational Context Brain</h1>
          </div>
          <div>
            <span className={styles.health}>
              <i />
              {healthyCount} sources healthy
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
        <div className={styles.contextBar}>
          <span>
            <i className={styles.externalDot} />
            External source systems
          </span>
          <ArrowRight />
          <span>
            <i className={styles.semanticDot} />
            {result?.ontology.version ?? 'northstar-ontology-v1'} ·{' '}
            {result?.ontology.status ?? 'current'}
          </span>
          <ArrowRight />
          <span>
            <i className={styles.brainDot} />
            Context Brain
          </span>
          <strong>
            <ShieldCheck />
            Permission-scoped for {result?.actor.name ?? 'Alex Chen'}
          </strong>
        </div>
        <div className={styles.content}>
          {error ? <div className={styles.error}>{error}</div> : null}
          {!result ? (
            <div className={styles.loading}>
              <BrainCircuit />
              <span>
                <strong>Building the permissioned context packet</strong>
                <small>
                  Resolving identities, permissions, graph context and evidence…
                </small>
              </span>
            </div>
          ) : null}
          {result && view === 'ask' ? (
            <AskView
              result={result}
              answer={answer}
              query={query}
              setQuery={setQuery}
              loading={loading}
              actorId={actorId}
              ask={() => void ask()}
              mutationLoading={mutationLoading}
              mutationMessage={mutationMessage}
              learn={() => void learn()}
            />
          ) : null}
          {result && view === 'brain' ? <BrainView result={result} /> : null}
          {result && view === 'govern' ? <GovernView result={result} /> : null}
        </div>
      </main>
    </div>
  );
}
