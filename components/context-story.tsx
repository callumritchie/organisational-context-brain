'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Database,
  FileSearch,
  GitBranch,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TestTube2,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { PERSONAS } from '@/src/modules/canonical/ids';
import type { AnswerResponse } from '@/src/modules/ai/types';
import type { ContextResponse } from '@/src/modules/context/types';
import type { DiscoveryState } from '@/src/modules/discovery/types';
import type { HypothesisSystemState } from '@/src/modules/hypotheses/types';
import type { MemoryState } from '@/src/modules/memory/types';
import type {
  ProjectMemoryState,
  ProjectMemoryView,
} from '@/src/modules/organisational-memory/types';
import type { SemanticEvolutionState } from '@/src/modules/ontology/semantic-evolution';
import type { ObservationLocator } from '@/src/modules/source-integration/types';
import {
  DEMO_RANKING_V3,
  type RankingFactor,
} from '@/src/modules/ranking/demo-ranking-v3';
import styles from './context-story.module.css';

const PRESET =
  "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const RANKING_FACTORS = Object.keys(DEMO_RANKING_V3.weights) as RankingFactor[];

interface SessionContract {
  actor: {
    id: string;
    name: string;
    role: string;
    workspaceId: string;
    authenticationMode: 'demo' | 'oidc' | 'session';
    capabilities: string[];
  };
  authentication: {
    interactive: boolean;
    loginUrl: string;
    logoutUrl: string;
  };
}

interface PropagationReceipt {
  source: {
    connector: string;
    syncRunId: string;
    eventId: string | null;
    outcome: 'version-created' | 'duplicate';
  };
  version: {
    id: string | null;
    sourceUri: string;
    updatedAt: string;
  };
  observation: { id: string; title: string; process: string };
  assertion: { id: string | null; predicate: string };
  hypothesis: {
    evaluationRunId: string | null;
    candidateId: string | null;
    candidateStatus: string | null;
  };
  answerImpact: {
    before: string | null;
    after: string | null;
    evidenceDeltas: number;
    explanation: string;
  };
}

function browserCookie(...names: string[]) {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!names.includes(name)) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

function apiHeaders(
  actorId: string,
  options: { json?: boolean; mutation?: boolean } = {},
) {
  const headers: Record<string, string> = { 'x-demo-actor': actorId };
  if (options.json) headers['content-type'] = 'application/json';
  if (options.mutation) {
    const csrf = browserCookie('__Host-org_brain_csrf', 'org_brain_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  return headers;
}

type StageId = 'scope' | 'identity' | 'meaning' | 'evidence' | 'monitor';
type ExperiencePhase = 'kickoff' | 'working' | 'debrief';
type InspectorTab = 'trace' | 'evidence' | 'graph' | 'memory' | 'meaning';

interface StoryStage {
  id: StageId;
  step: number | null;
  operation: string;
  layer: string;
  status: 'working' | 'planned';
  runtime: string[];
  summary: string;
  why: string;
  input: string;
  output: string;
  requirement: string;
  examples: string[];
}

type ProjectMemoryOperation =
  | { operation: 'generate-kickoff' }
  | { operation: 'run-background' }
  | {
      operation: 'capture-debrief';
      memoryType: string;
      statement: string;
      context: string;
      outcome: string;
    }
  | {
      operation: 'review';
      memoryId: string;
      decision: 'approve' | 'reject' | 'correct';
      note: string;
      correctedStatement?: string;
    };

function safeToken(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_|_$/g, '');
}

function displayMonitorStatus(
  status: 'active' | 'paused' | 'stopped' | undefined,
) {
  if (!status) return 'Active';
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function stagesFor(
  result: ContextResponse,
  memory: MemoryState | null,
): StoryStage[] {
  const entities = result.interpretedQuery.entities
    .map((entity) => entity.name)
    .join(', ');
  const reliability =
    result.epistemicState.status === 'contested' ? 'cautious' : 'supported';
  return [
    {
      id: 'scope',
      step: 1,
      operation: 'Constrain access',
      layer: 'Permission boundary',
      status: 'working',
      runtime: [
        `actor=${safeToken(result.actor.name)}`,
        `source_objects=${result.accessProfile.sourceObjects}`,
      ],
      summary: `${result.actor.name} was allowed to search ${result.accessProfile.sourceObjects} source objects across ${result.accessProfile.projects.length} projects. Inaccessible objects were excluded before retrieval began.`,
      why: 'Filtering later can leak restricted titles, snippets, scores or source text into traces and AI prompts.',
      input: `ActorContext { actor_id: "${result.actor.id}", role: "${result.actor.role}" }`,
      output: `EligibleScope { source_objects: ${result.accessProfile.sourceObjects}, projects: [${result.accessProfile.projects.map((project) => `"${project}"`).join(', ')}] }`,
      requirement:
        'All permission-sensitive reads shall execute inside an actor-scoped database transaction before candidate retrieval.',
      examples: [
        `clients=[${result.accessProfile.clients.join(', ')}]`,
        'enforcement=pre_retrieval',
        'restricted_metadata=absent',
      ],
    },
    {
      id: 'identity',
      step: 2,
      operation: 'Resolve resources',
      layer: 'Canonical model',
      status: 'working',
      runtime: [
        `entities=${result.interpretedQuery.entities.length}`,
        'aliases=resolved',
      ],
      summary: `Names, aliases and source-system identifiers in this question resolved to ${result.interpretedQuery.entities.length} stable organisational resources: ${entities}.`,
      why: 'The same client or project appears under different names in different systems. Context fragments if those records remain separate.',
      input: `QueryEntities { text: "Atlas Bank", source_aliases: true }`,
      output: `CanonicalResources { count: ${result.interpretedQuery.entities.length}, names: [${result.interpretedQuery.entities.map((entity) => `"${entity.name}"`).join(', ')}] }`,
      requirement:
        'Every entity or content object shall resolve to one canonical Resource while retaining its source identities and provenance.',
      examples: result.interpretedQuery.entities.map(
        (entity) =>
          `${entity.matchedAlias ?? entity.name} -> ${entity.type}/${safeToken(entity.name)}`,
      ),
    },
    {
      id: 'meaning',
      step: 3,
      operation: 'Connect meaning',
      layer: 'Ontology + knowledge graph',
      status: 'working',
      runtime: [
        `ontology=${result.ontology.version}`,
        `graph_edges=${result.graph.edges.length}`,
        `semantic_aliases=${result.ontology.aliases.length}`,
      ],
      summary: `The versioned ontology classified the resources, then the graph followed ${result.graph.edges.length} actor-visible connections between projects, evidence, people and hypotheses.`,
      why: 'Similarity finds related words. A semantic model explains what each object is, which relationships are valid, and how context connects across systems.',
      input: `Assertions { resources: ${result.graph.nodes.length}, ontology: "${result.ontology.version}" }`,
      output: `SemanticGraph { types: ${result.ontology.resourceTypes.length}, relationship_rules: ${result.ontology.relationships.length}, aliases: ${result.ontology.aliases.length}, visible_edges: ${result.graph.edges.length} }`,
      requirement:
        'Semantic mappings shall use an immutable ontology version, and a graph edge shall be visible only when an establishing assertion is actor-visible.',
      examples: [
        'Evidence --SUPPORTS--> Hypothesis',
        'ResearchNote --BELONGS_TO--> Project',
        'Evidence --CONTRADICTS--> Hypothesis',
      ],
    },
    {
      id: 'evidence',
      step: 4,
      operation: 'Rank + assess evidence',
      layer: 'Retrieval + epistemic assessment',
      status: 'working',
      runtime: [
        `evidence=${result.evidence.length}`,
        `reliability=${reliability}`,
      ],
      summary:
        result.epistemicState.status === 'contested'
          ? `${result.retrieval.mode} retrieval ranked ${result.evidence.length} permitted items. ${result.epistemicState.supportingEvidence} support the current explanation and ${result.epistemicState.contradictingEvidence} challenges a single-cause view, so reliability is “Cautious”.`
          : `${result.retrieval.mode} retrieval ranked ${result.evidence.length} permitted items. ${result.epistemicState.supportingEvidence} support the current explanation and no visible evidence challenges it, so reliability is “Supported”.`,
      why: 'The most similar passage is not always the most authoritative. The product must also preserve disagreement rather than synthesising false certainty.',
      input: `Candidates { lexical: true, semantic: ${result.retrieval.mode === 'hybrid'}, graph: true, ranking: "${result.rankingVersion}" }`,
      output: `ContextPacket { evidence: ${result.evidence.length}, supports: ${result.epistemicState.supportingEvidence}, challenges: ${result.epistemicState.contradictingEvidence}, reliability: "${reliability}" }`,
      requirement:
        'Every ranking contribution shall be inspectable, and context responses shall distinguish supported, contested and insufficient evidence states.',
      examples: [
        `ranking=${result.rankingVersion}`,
        `supports=${result.epistemicState.supportingEvidence}`,
        `challenges=${result.epistemicState.contradictingEvidence}`,
      ],
    },
    {
      id: 'monitor',
      step: null,
      operation: 'Continual memory loop',
      layer: 'Permission-scoped background monitor',
      status: memory?.configured ? 'working' : 'planned',
      runtime: memory?.configured
        ? [
            `status=${memory.policy?.status ?? 'active'}`,
            `proposals=${memory.candidates.filter((candidate) => candidate.status === 'proposed').length}`,
          ]
        : ['status=not_configured', 'execution=background'],
      summary: memory?.latestRun
        ? `A source change triggered the same permission-scoped context pipeline. It found ${memory.latestRun.deltas.length} evidence change${memory.latestRun.deltas.length === 1 ? '' : 's'} and formed ${memory.candidates.length} attributable memory proposal${memory.candidates.length === 1 ? '' : 's'} for review.`
        : 'The active monitor has checkpointed this hypothesis and will rerun the permission-scoped context pipeline when a relevant source version changes.',
      why: 'Context should improve between human questions. Durable checkpoints and reviewed memory proposals let the system learn continually without silently turning an inference into organisational truth.',
      input:
        'MonitorPolicy { hypothesis_id, service_actor_id, source_change_trigger, permitted_scope }',
      output:
        'MemoryCandidate { evidence_delta, proposed_hypothesis, confidence, provenance, review_state }',
      requirement:
        'Every monitor shall retain permission-scoped before/after checkpoints and require review before a proposed latent learning is promoted to trusted organisational memory.',
      examples: [
        'trigger=source_version_changed',
        'review=required',
        `checkpoint=${memory?.checkpoint?.id.slice(0, 8) ?? 'pending'}`,
      ],
    },
  ];
}

function responseClaims(
  answer: AnswerResponse['answer'] | null,
  result: ContextResponse,
) {
  if (answer?.mode === 'provider' && answer.claims.length) {
    return answer.claims.slice(0, 2);
  }
  return [{ text: answer?.text ?? result.summary, evidenceIds: [] }];
}

function StageDrawer({
  stage,
  semanticEvolution,
  canReviewSemantic,
  semanticReviewLoading,
  onSemanticReview,
  onClose,
}: {
  stage: StoryStage;
  semanticEvolution: SemanticEvolutionState | null;
  canReviewSemantic: boolean;
  semanticReviewLoading: string | null;
  onSemanticReview: (
    proposalId: string,
    decision: 'approve' | 'reject',
  ) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyRequirement() {
    await navigator.clipboard.writeText(stage.requirement);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <section
        className={styles.stageDrawer}
        role="dialog"
        aria-modal="true"
        aria-label={`${stage.operation} details`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className={styles.uiLabel}>
              {stage.step
                ? `Operation ${String(stage.step).padStart(2, '0')}`
                : 'Planned background path'}
            </span>
            <h2>{stage.operation}</h2>
            <p>{stage.layer}</p>
          </div>
          <b
            className={
              stage.status === 'working' ? styles.working : styles.notBuilt
            }
          >
            {stage.status === 'working' ? 'Working now' : 'Not built'}
          </b>
          <button
            type="button"
            aria-label="Close operation details"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className={styles.stageDrawerBody}>
          {stage.id === 'meaning' && semanticEvolution ? (
            <SemanticEvolutionPanel
              evolution={semanticEvolution}
              canReview={canReviewSemantic}
              reviewLoading={semanticReviewLoading}
              onReview={onSemanticReview}
            />
          ) : null}
          <section>
            <span className={styles.uiLabel}>What happened in this trace</span>
            <p className={styles.storyCopy}>{stage.summary}</p>
          </section>
          <section>
            <span className={styles.uiLabel}>Why this capability exists</span>
            <p>{stage.why}</p>
          </section>
          <div className={styles.ioGrid}>
            <article>
              <span className={styles.dataLabel}>INPUT</span>
              <code>{stage.input}</code>
            </article>
            <ArrowRight />
            <article>
              <span className={styles.dataLabel}>OUTPUT</span>
              <code>{stage.output}</code>
            </article>
          </div>
          <section className={styles.runtimeExamples}>
            <span className={styles.uiLabel}>Values from this run</span>
            <div>
              {stage.examples.map((example) => (
                <code key={example}>{example}</code>
              ))}
            </div>
          </section>
          <section className={styles.requirementSeed}>
            <header>
              <span className={styles.uiLabel}>PM-ready requirement seed</span>
              <button type="button" onClick={() => void copyRequirement()}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy requirement'}
              </button>
            </header>
            <p>{stage.requirement}</p>
          </section>
        </div>
      </section>
    </div>
  );
}

function SemanticEvolutionPanel({
  evolution,
  canReview,
  reviewLoading,
  onReview,
}: {
  evolution: SemanticEvolutionState;
  canReview: boolean;
  reviewLoading: string | null;
  onReview: (proposalId: string, decision: 'approve' | 'reject') => void;
}) {
  const proposal = evolution.proposals[0];
  if (!proposal) return null;
  return (
    <section className={styles.semanticEvolution}>
      <header>
        <div>
          <span className={styles.dataLabel}>
            SEMANTIC CHANGE · SEPARATE REVIEW INBOX
          </span>
          <strong>
            The brain noticed missing language; it did not rewrite itself.
          </strong>
        </div>
        <code>current={evolution.currentOntology.version}</code>
      </header>
      <div
        className={styles.semanticFlow}
        aria-label="Governed semantic evolution flow"
      >
        <article>
          <Sparkles />
          <span>
            <small className={styles.dataLabel}>OBSERVED</small>
            <b>Repeated concept</b>
          </span>
        </article>
        <ArrowRight />
        <article>
          <GitBranch />
          <span>
            <small className={styles.dataLabel}>UNTRUSTED</small>
            <b>Change set</b>
          </span>
        </article>
        <ArrowRight />
        <article>
          <FileSearch />
          <span>
            <small className={styles.dataLabel}>CHECKED</small>
            <b>Impact</b>
          </span>
        </article>
        <ArrowRight />
        <article>
          <ShieldCheck />
          <span>
            <small className={styles.dataLabel}>HUMAN GATE</small>
            <b>Steward</b>
          </span>
        </article>
        <ArrowRight />
        <article>
          <RefreshCw />
          <span>
            <small className={styles.dataLabel}>IF APPROVED</small>
            <b>New version</b>
          </span>
        </article>
      </div>
      <article className={styles.semanticProposal}>
        <div>
          <span className={styles.dataLabel}>
            PROPOSAL · NOT ACTIVE MEANING
          </span>
          <h3>{proposal.title}</h3>
          <p>{proposal.rationale}</p>
          <div>
            {proposal.changeSet.map((change) => (
              <code
                key={change.kind === 'add-alias' ? change.alias : change.name}
              >
                {change.kind === 'add-resource-type'
                  ? `TYPE ${change.name}`
                  : change.kind === 'add-relationship'
                    ? `${change.from.join('|')} --${change.name}→ ${change.to.join('|')}`
                    : `ALIAS “${change.alias}” → ${change.target}`}
              </code>
            ))}
          </div>
        </div>
        <aside>
          <span className={styles.dataLabel}>PRE-ACTIVATION IMPACT</span>
          <b>
            {proposal.impact.affectedResourceIds.length} resources to replay
          </b>
          <code>{proposal.impact.assertionCount} assertions checked</code>
          <code>{proposal.impact.breakingChanges} breaking changes</code>
          <code>base={proposal.baseOntologyVersion}</code>
          <strong
            className={proposal.status === 'approved' ? styles.working : ''}
          >
            {proposal.status}
          </strong>
          {proposal.status === 'proposed' ? (
            <div>
              <Button
                variant="outline"
                disabled={!canReview || reviewLoading === proposal.id}
                onClick={() => onReview(proposal.id, 'reject')}
              >
                Reject
              </Button>
              <Button
                disabled={!canReview || reviewLoading === proposal.id}
                onClick={() => onReview(proposal.id, 'approve')}
              >
                {reviewLoading === proposal.id
                  ? 'Publishing…'
                  : 'Approve + activate'}
              </Button>
            </div>
          ) : null}
          {!canReview && proposal.status === 'proposed' ? (
            <small>Project Lead stewardship required</small>
          ) : null}
        </aside>
      </article>
      {evolution.latestActivation ? (
        <div className={styles.activationReceipt}>
          <Check />
          <span>
            <small className={styles.dataLabel}>ACTIVATION RECEIPT</small>
            <b>
              {evolution.latestActivation.fromVersion} →{' '}
              {evolution.latestActivation.toVersion}
            </b>
            <code>{evolution.latestActivation.replayContract.result}</code>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function MemoryDrawer({
  memory,
  discovery,
  hypothesisSystem,
  canReview,
  canOperate,
  reviewLoading,
  discoveryReviewLoading,
  discoveryOperationLoading,
  operationLoading,
  onReview,
  onDiscoveryReview,
  onDiscoveryOperate,
  onOperate,
  onClose,
}: {
  memory: MemoryState | null;
  discovery: DiscoveryState | null;
  hypothesisSystem: HypothesisSystemState | null;
  canReview: boolean;
  canOperate: boolean;
  reviewLoading: string | null;
  discoveryReviewLoading: string | null;
  discoveryOperationLoading: string | null;
  operationLoading: string | null;
  onReview: (candidateId: string, decision: 'accept' | 'dismiss') => void;
  onDiscoveryReview: (
    candidateId: string,
    decision: 'accept' | 'dismiss',
  ) => void;
  onDiscoveryOperate: (operation: 'pause' | 'resume' | 'run-now') => void;
  onOperate: (
    operation: 'pause' | 'resume' | 'run-now' | 'mark-notifications-read',
  ) => void;
  onClose: () => void;
}) {
  const run = memory?.latestRun;
  const proposals = memory?.candidates ?? [];
  const discovered = discovery?.candidates ?? [];
  const loop = [
    { label: 'Form', detail: 'Create a testable candidate', icon: Sparkles },
    { label: 'Test', detail: 'Assemble permitted evidence', icon: TestTube2 },
    { label: 'Monitor', detail: 'React to source changes', icon: RefreshCw },
    {
      label: 'Propose',
      detail: 'Retain an attributable learning',
      icon: GitBranch,
    },
    { label: 'Review', detail: 'Promote or dismiss', icon: ShieldCheck },
  ];
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <section
        className={styles.memoryDrawer}
        role="dialog"
        aria-modal="true"
        aria-label="Continual hypothesis and memory loop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className={styles.uiLabel}>
              Working background capability
            </span>
            <h2>Continual hypothesis + memory loop</h2>
            <p>
              Evidence can change the brain even when nobody asks a question.
            </p>
          </div>
          <b className={memory?.configured ? styles.working : styles.notBuilt}>
            {memory?.configured
              ? displayMonitorStatus(memory.policy?.status)
              : 'Not configured'}
          </b>
          <button
            type="button"
            aria-label="Close memory loop"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className={styles.memoryDrawerBody}>
          <section className={styles.unifiedHypothesisIndex}>
            <header>
              <div>
                <span className={styles.dataLabel}>
                  UNIFIED HYPOTHESIS ENGINE · READ MODEL V1
                </span>
                <strong>One lifecycle vocabulary across every origin</strong>
                <p>
                  Prepared monitors and background discoveries now project into
                  the same lifecycle, evidence and review axes.
                </p>
              </div>
              <code>
                records={hypothesisSystem?.summary.total ?? 0} · review=
                {hypothesisSystem?.summary.awaitingReview ?? 0} · monitored=
                {hypothesisSystem?.summary.activelyMonitored ?? 0}
              </code>
            </header>
            <div>
              {hypothesisSystem?.records.map((record) => (
                <article key={`${record.origin}:${record.id}`}>
                  <i>{record.origin === 'monitored' ? 'MON' : 'DIS'}</i>
                  <span>
                    <small>{record.origin}</small>
                    <strong>{record.statement}</strong>
                  </span>
                  <dl>
                    <div>
                      <dt>Lifecycle</dt>
                      <dd>{record.lifecycleState}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{record.evidenceState}</dd>
                    </div>
                    <div>
                      <dt>Review</dt>
                      <dd>{record.reviewState}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
          <section className={styles.discoveryInbox}>
            <header>
              <div>
                <span className={styles.dataLabel}>
                  UNPROMPTED DISCOVERY · REVIEW INBOX
                </span>
                <strong>Patterns noticed before anyone asks a question</strong>
                <p>
                  Raw, unlabeled records can propose a testable explanation. It
                  remains outside trusted memory until a person accepts it.
                </p>
              </div>
              <aside className={styles.discoveryControls}>
                <code>
                  {discovery?.operations.scheduleEnabled
                    ? `scheduled · every ${Math.round(discovery.operations.intervalSeconds / 3600)}h`
                    : 'schedule paused'}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canOperate || discoveryOperationLoading !== null}
                  onClick={() => onDiscoveryOperate('run-now')}
                >
                  {discoveryOperationLoading === 'run-now'
                    ? 'Scanning…'
                    : 'Scan now'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canOperate || discoveryOperationLoading !== null}
                  onClick={() =>
                    onDiscoveryOperate(
                      discovery?.policy.status === 'active'
                        ? 'pause'
                        : 'resume',
                    )
                  }
                >
                  {discovery?.policy.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
              </aside>
            </header>
            <div
              className={styles.discoveryFlow}
              aria-label="Discovery data flow"
            >
              <article>
                <Database />
                <span>
                  <small className={styles.dataLabel}>INPUT</small>
                  <strong>Unlabeled source records</strong>
                </span>
                <b>{discovery?.latestRun?.documentsScanned ?? 0}</b>
              </article>
              <ArrowRight />
              <article>
                <BrainCircuit />
                <span>
                  <small className={styles.dataLabel}>SYSTEM</small>
                  <strong>Ontology-guided pattern scan</strong>
                </span>
                <b>{discovery?.policy.ontologyVersion ?? 'not loaded'}</b>
              </article>
              <ArrowRight />
              <article>
                <Sparkles />
                <span>
                  <small className={styles.dataLabel}>UNTRUSTED OUTPUT</small>
                  <strong>Hypothesis candidate</strong>
                </span>
                <b>
                  {
                    discovered.filter((item) => item.status === 'proposed')
                      .length
                  }{' '}
                  ready
                </b>
              </article>
              <ArrowRight />
              <article>
                <ShieldCheck />
                <span>
                  <small className={styles.dataLabel}>HUMAN GATE</small>
                  <strong>Accept or dismiss</strong>
                </span>
                <b>required</b>
              </article>
              <ArrowRight />
              <article>
                <RefreshCw />
                <span>
                  <small className={styles.dataLabel}>IF ACCEPTED</small>
                  <strong>Continual monitor</strong>
                </span>
                <b>compounds</b>
              </article>
            </div>
            {discovered.length ? (
              discovered.map((candidate) => (
                <article
                  className={styles.discoveryCandidate}
                  key={candidate.id}
                >
                  <div>
                    <span className={styles.dataLabel}>
                      PROPOSED HYPOTHESIS · NOT A FACT
                    </span>
                    <h3>{candidate.statement}</h3>
                    <p className={styles.storyCopy}>{candidate.rationale}</p>
                    <div className={styles.discoveryConcepts}>
                      {candidate.concepts.map((concept) => (
                        <code key={concept.id}>
                          {concept.label} · {concept.evidenceCount} records
                        </code>
                      ))}
                    </div>
                  </div>
                  <section>
                    <div>
                      <span className={styles.dataLabel}>PREDICTS</span>
                      <p>{candidate.predictions[0]}</p>
                    </div>
                    <div>
                      <span className={styles.dataLabel}>WOULD REFUTE IT</span>
                      <p>{candidate.falsificationConditions[0]}</p>
                    </div>
                    <code>
                      {candidate.sourceDiversity} sources · novelty=
                      {candidate.noveltyScore.toFixed(2)} · confidence=
                      {candidate.confidence.toFixed(2)}
                    </code>
                  </section>
                  <aside>
                    <b
                      className={
                        candidate.status === 'accepted'
                          ? styles.acceptedMemory
                          : ''
                      }
                    >
                      {candidate.status}
                    </b>
                    {candidate.status === 'proposed' ? (
                      <div>
                        <Button
                          variant="outline"
                          disabled={
                            !canReview ||
                            discoveryReviewLoading === candidate.id
                          }
                          onClick={() =>
                            onDiscoveryReview(candidate.id, 'dismiss')
                          }
                        >
                          Dismiss
                        </Button>
                        <Button
                          disabled={
                            !canReview ||
                            discoveryReviewLoading === candidate.id
                          }
                          onClick={() =>
                            onDiscoveryReview(candidate.id, 'accept')
                          }
                        >
                          {discoveryReviewLoading === candidate.id
                            ? 'Saving…'
                            : 'Accept + monitor'}
                        </Button>
                      </div>
                    ) : null}
                    {!canReview && candidate.status === 'proposed' ? (
                      <small>Project Lead review required</small>
                    ) : null}
                  </aside>
                </article>
              ))
            ) : (
              <p className={styles.emptyMonitor}>
                No cross-source pattern currently exceeds the discovery policy
                threshold.
              </p>
            )}
          </section>
          <section className={styles.monitorContract}>
            <div>
              <span className={styles.dataLabel}>MONITORED HYPOTHESIS</span>
              <strong>
                {memory?.policy?.hypothesis ?? 'No monitor configured'}
              </strong>
              <code>hypothesis_id={memory?.policy?.hypothesisId ?? '—'}</code>
            </div>
            <div>
              <span className={styles.dataLabel}>EXECUTION CONTRACT</span>
              <code>
                trigger={memory?.policy?.trigger ?? 'source-version-changed'}
              </code>
              <code>
                service_actor=
                {memory?.policy?.serviceActorId.slice(0, 8) ?? '—'}
              </code>
              <code>
                review_required={String(memory?.policy?.reviewRequired ?? true)}
              </code>
            </div>
          </section>
          <section className={styles.monitorOperations}>
            <header>
              <div>
                <span className={styles.uiLabel}>Monitor operations</span>
                <strong>One hypothesis, continuously evaluated</strong>
                <p>
                  Lifecycle is an administrative state; evidence state is what
                  the permitted sources currently support.
                </p>
              </div>
              <div>
                <Button
                  variant="outline"
                  disabled={!canOperate || operationLoading !== null}
                  onClick={() =>
                    onOperate(
                      memory?.policy?.status === 'active' ? 'pause' : 'resume',
                    )
                  }
                >
                  {memory?.policy?.status === 'active'
                    ? 'Pause monitor'
                    : 'Resume monitor'}
                </Button>
                <Button
                  disabled={
                    !canOperate ||
                    operationLoading !== null ||
                    memory?.policy?.status !== 'active'
                  }
                  onClick={() => onOperate('run-now')}
                >
                  <RefreshCw />
                  {operationLoading === 'run-now' ? 'Running…' : 'Run now'}
                </Button>
              </div>
            </header>
            <div>
              <article>
                <span className={styles.dataLabel}>HYPOTHESIS_RECORD</span>
                <strong>
                  {memory?.hypothesis?.statement ?? 'Not initialised'}
                </strong>
                <dl>
                  <div>
                    <dt>Lifecycle</dt>
                    <dd>{memory?.hypothesis?.lifecycleStatus ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Evidence state</dt>
                    <dd>{memory?.hypothesis?.epistemicStatus ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>v{memory?.hypothesis?.revision ?? 0}</dd>
                  </div>
                </dl>
              </article>
              <article>
                <span className={styles.dataLabel}>WORKER_QUEUE</span>
                <strong>{memory?.operations?.pendingJobs ?? 0} ready</strong>
                <dl>
                  <div>
                    <dt>Completed</dt>
                    <dd>{memory?.operations?.completedJobs ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Retrying</dt>
                    <dd>{memory?.operations?.retryingJobs ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Dead letter</dt>
                    <dd>{memory?.operations?.deadLetterJobs ?? 0}</dd>
                  </div>
                </dl>
              </article>
              <article>
                <span className={styles.dataLabel}>MODEL_ROUTE</span>
                <strong>
                  {memory?.modelRouting?.latestRoute ?? 'not used yet'}
                </strong>
                <dl>
                  <div>
                    <dt>Policy</dt>
                    <dd>{memory?.modelRouting?.mode ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Tokens</dt>
                    <dd>
                      {(memory?.modelRouting?.totalInputTokens ?? 0) +
                        (memory?.modelRouting?.totalOutputTokens ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>
                      £
                      {(
                        (memory?.modelRouting?.totalCostMicros ?? 0) / 1_000_000
                      ).toFixed(4)}
                    </dd>
                  </div>
                </dl>
              </article>
              <article>
                <span className={styles.dataLabel}>NOTIFICATION_OUTBOX</span>
                <strong>
                  {memory?.notifications.filter(
                    (item) => item.status !== 'read',
                  ).length ?? 0}{' '}
                  unread
                </strong>
                <p>
                  {memory?.notifications[0]?.title ??
                    'No action needs attention.'}
                </p>
                {memory?.notifications.some(
                  (item) => item.status !== 'read',
                ) ? (
                  <button
                    type="button"
                    disabled={!canOperate || operationLoading !== null}
                    onClick={() => onOperate('mark-notifications-read')}
                  >
                    Mark read
                  </button>
                ) : null}
              </article>
            </div>
            <footer>
              <code>
                schedule=
                {memory?.operations?.scheduleEnabled ? 'enabled' : 'paused'}
              </code>
              <code>
                next_due=
                {memory?.operations?.nextDueAt
                  ? new Date(memory.operations.nextDueAt).toLocaleString()
                  : '—'}
              </code>
              <span>
                {memory?.modelRouting?.latestReason ??
                  'No routing decision recorded.'}
              </span>
            </footer>
          </section>
          <section
            className={styles.learningLoop}
            aria-label="Continual learning flow"
          >
            {loop.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className={styles.loopStep}>
                  <article>
                    <Icon />
                    <span>
                      <small className={styles.uiLabel}>STEP {index + 1}</small>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </span>
                  </article>
                  {index < loop.length - 1 ? <ArrowRight /> : null}
                </div>
              );
            })}
          </section>
          <section className={styles.monitorRun}>
            <header>
              <div>
                <span className={styles.dataLabel}>LATEST MONITOR RUN</span>
                <strong>
                  {run ? run.rationale : 'Waiting for a relevant source change'}
                </strong>
              </div>
              <code>status={run?.status ?? 'checkpointed'}</code>
            </header>
            {run?.before && run.after ? (
              <div className={styles.snapshotDelta}>
                <article>
                  <span className={styles.dataLabel}>
                    BEFORE · CONTEXT_SNAPSHOT
                  </span>
                  <strong>{run.before.epistemicStatus}</strong>
                  <code>
                    supports={run.before.supportingEvidence} · challenges=
                    {run.before.contradictingEvidence}
                  </code>
                </article>
                <ArrowRight />
                <article
                  className={run.material ? styles.materialSnapshot : ''}
                >
                  <span className={styles.dataLabel}>
                    AFTER · CONTEXT_SNAPSHOT
                  </span>
                  <strong>{run.after.epistemicStatus}</strong>
                  <code>
                    supports={run.after.supportingEvidence} · challenges=
                    {run.after.contradictingEvidence}
                  </code>
                </article>
              </div>
            ) : (
              <p className={styles.emptyMonitor}>
                The checkpoint contains {memory?.checkpoint?.evidenceCount ?? 0}{' '}
                permitted evidence items. No material delta has been observed
                yet.
              </p>
            )}
            {run?.deltas.map((delta) => (
              <div className={styles.deltaFile} key={delta.id}>
                <FileSearch />
                <span>
                  <small className={styles.dataLabel}>
                    EVIDENCE DELTA · {delta.type}
                  </small>
                  <strong>{delta.title}</strong>
                  <code>{delta.sourceUri}</code>
                </span>
                <b>{delta.stance?.toLowerCase() ?? 'removed'}</b>
              </div>
            ))}
          </section>
          <section className={styles.memoryProposals}>
            <header>
              <div>
                <span className={styles.dataLabel}>
                  OUTPUT · MEMORY_CANDIDATES
                </span>
                <strong>Proposed learnings are not trusted memory yet</strong>
              </div>
              <code>count={proposals.length}</code>
            </header>
            {proposals.length ? (
              proposals.map((candidate) => (
                <article key={candidate.id}>
                  <div className={styles.proposalCopy}>
                    <span className={styles.dataLabel}>
                      PROPOSED {candidate.kind.replaceAll('-', ' ')}
                    </span>
                    <h3>{candidate.statement}</h3>
                    <p className={styles.storyCopy}>{candidate.rationale}</p>
                    <div>
                      <code>confidence={candidate.confidence.toFixed(2)}</code>
                      <code>process={candidate.process}</code>
                      <code>source={candidate.sourceUri}</code>
                    </div>
                  </div>
                  <aside>
                    <b
                      className={
                        candidate.status === 'accepted'
                          ? styles.acceptedMemory
                          : ''
                      }
                    >
                      {candidate.status}
                    </b>
                    {candidate.status === 'proposed' ? (
                      <div>
                        <Button
                          variant="outline"
                          disabled={
                            !canReview || reviewLoading === candidate.id
                          }
                          onClick={() => onReview(candidate.id, 'dismiss')}
                        >
                          Dismiss
                        </Button>
                        <Button
                          disabled={
                            !canReview || reviewLoading === candidate.id
                          }
                          onClick={() => onReview(candidate.id, 'accept')}
                        >
                          {reviewLoading === candidate.id
                            ? 'Saving…'
                            : 'Accept as memory'}
                        </Button>
                      </div>
                    ) : null}
                    {!canReview && candidate.status === 'proposed' ? (
                      <small>Project Lead review required</small>
                    ) : null}
                    {candidate.promotedResourceId ? (
                      <code>
                        resource={candidate.promotedResourceId.slice(0, 8)}
                      </code>
                    ) : null}
                  </aside>
                </article>
              ))
            ) : (
              <p className={styles.emptyMonitor}>
                No proposal exists. A relevant evidence change must pass the
                materiality check first.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function EvidenceDrawer({
  result,
  onClose,
}: {
  result: ContextResponse;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const item = result.evidence[index]!;
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <section
        className={styles.evidenceDrawer}
        role="dialog"
        aria-modal="true"
        aria-label="Evidence used for this output"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className={styles.uiLabel}>
              Supporting data for this trace
            </span>
            <h2>Evidence used for this output</h2>
          </div>
          <button type="button" aria-label="Close evidence" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className={styles.evidenceLayout}>
          <nav aria-label="Evidence files">
            {result.evidence.map((evidence, evidenceIndex) => (
              <button
                key={evidence.id}
                type="button"
                className={evidenceIndex === index ? styles.activeEvidence : ''}
                onClick={() => setIndex(evidenceIndex)}
              >
                <span className={styles.dataLabel}>
                  FILE {String(evidenceIndex + 1).padStart(2, '0')}
                </span>
                <strong>{evidence.title}</strong>
                <code>{evidence.source.uri}</code>
                <b>
                  {evidence.stance === 'SUPPORTS' ? 'supports' : 'challenges'}
                </b>
                <ChevronRight />
              </button>
            ))}
          </nav>
          <article className={styles.evidenceDetail}>
            <header>
              <span className={styles.dataLabel}>SELECTED ASSERTION</span>
              <code>confidence={item.confidence.toFixed(2)}</code>
            </header>
            <h3>{item.title}</h3>
            <p className={styles.storyCopy}>{item.summary}</p>
            <blockquote>
              <FileSearch />
              <div>
                <span className={styles.uiLabel}>Source excerpt</span>
                <strong>{item.source.title}</strong>
                <p>{item.source.excerpt}</p>
                <span className={styles.dataLabel}>SOURCE URI</span>
                <code>{item.source.uri}</code>
              </div>
            </blockquote>
            <section className={styles.ranking}>
              <span className={styles.uiLabel}>Ranking contributions</span>
              {RANKING_FACTORS.map((factor) => {
                const value = item.ranking[factor];
                return (
                  <div key={factor}>
                    <code>{factor}</code>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (value / DEMO_RANKING_V3.weights[factor]) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </i>
                    <strong>+{value.toFixed(2)}</strong>
                  </div>
                );
              })}
            </section>
            <footer>
              <span className={styles.dataLabel}>ASSERTION ID</span>
              <code>{item.provenance.assertionId}</code>
              <span className={styles.dataLabel}>PROCESS</span>
              <code>
                {item.provenance.process}@{item.provenance.processVersion}
              </code>
            </footer>
          </article>
        </div>
      </section>
    </div>
  );
}

function locatorSummary(locator: ObservationLocator) {
  if (locator.modality === 'document') return `Document · page ${locator.page}`;
  if (locator.modality === 'table')
    return `Table · ${locator.sheet} row ${locator.row}`;
  if (locator.modality === 'transcript') {
    return `Transcript · ${Math.round(locator.startMs / 1_000)}–${Math.round(locator.endMs / 1_000)}s`;
  }
  return `Image · region ${locator.regionId}`;
}

function SourceJourneyDrawer({
  result,
  projectMemory,
  onClose,
}: {
  result: ContextResponse;
  projectMemory: ProjectMemoryState;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<
    'journey' | 'hypothesis' | 'assets' | 'requirements'
  >('journey');
  const integration = projectMemory.sourceIntegration;
  const foundation = projectMemory.contextFoundation;
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [observationId, setObservationId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const artifact =
    integration?.artifacts.find((item) => item.id === artifactId) ??
    integration?.artifacts[0] ??
    null;
  const observation =
    artifact?.observations.find((item) => item.id === observationId) ??
    artifact?.observations[0] ??
    null;
  const connection = integration?.connections.find(
    (item) => item.id === artifact?.connectionId,
  );
  const observationAssertions = observation?.assertions ?? [];
  const hypothesis = integration?.compounding?.hypothesis ?? null;
  const selectedHypothesisEvidence = hypothesis?.observationEvidence.find(
    (item) => item.observationId === observation?.id,
  );
  const requirements = [
    {
      title: 'Permission-aware connector contract',
      body: 'Every connector shall return source permissions, version identity and deletion state with each changed artifact.',
      acceptance:
        'An inaccessible artifact is absent before perception, graph construction and model input.',
    },
    {
      title: 'Canonical multimodal artifact',
      body: 'Documents, tables, transcripts and images shall share a stable artifact identity while retaining modality-specific locators.',
      acceptance:
        'Every extracted observation resolves back to an immutable source version and exact locator.',
    },
    {
      title: 'Deterministic perception receipt',
      body: 'Perception shall emit attributable observations with type, statement, confidence, process version and source locator.',
      acceptance:
        'A reviewer can open the precise page, row, timecode or image region behind an observation.',
    },
    {
      title: 'Actor-visible graph assertion',
      body: 'A relationship shall enter the answer subgraph only when its establishing evidence remains visible to the current actor.',
      acceptance:
        'Restricted node labels and edge metadata never appear in traces or prompts.',
    },
    {
      title: 'Observation-level hypothesis evidence',
      body: 'Each hypothesis evidence link shall identify the specific perceived observations and assertions that contributed, rather than citing only the containing artifact.',
      acceptance:
        'A reviewer can traverse hypothesis → observation → assertion → immutable source locator without a client-side join or inference.',
    },
    {
      title: 'Untrusted hypothesis gate',
      body: 'Background synthesis may propose a hypothesis but shall not make it trusted memory without an attributable human review.',
      acceptance:
        'The proposal, evidence basis, route and decision remain separately auditable.',
    },
  ];

  async function copyRequirements() {
    await navigator.clipboard.writeText(
      requirements
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}\nRequirement: ${item.body}\nAcceptance: ${item.acceptance}`,
        )
        .join('\n\n'),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <section
        className={styles.sourceJourneyDrawer}
        role="dialog"
        aria-modal="true"
        aria-label="Source to context journey"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className={styles.dataLabel}>PROGRESSIVE DISCLOSURE</span>
            <h2>How external data became usable context</h2>
            <p>
              Real records returned for this actor—not a conceptual diagram.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close source journey"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <nav aria-label="Source journey inspector">
          {(
            [
              ['journey', 'Source journey'],
              ['hypothesis', 'Hypothesis basis'],
              ['assets', 'Governed context'],
              ['requirements', 'PM requirements'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'journey' ? (
          integration?.configured && artifact ? (
            <div className={styles.sourceJourneyBody}>
              <aside>
                <span className={styles.uiLabel}>ACTOR-VISIBLE ARTIFACTS</span>
                {integration.artifacts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-selected={item.id === artifact.id}
                    onClick={() => {
                      setArtifactId(item.id);
                      setObservationId(null);
                    }}
                  >
                    <i>{item.modality.slice(0, 3).toUpperCase()}</i>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.observationCount} observations</small>
                    </span>
                    <ChevronRight />
                  </button>
                ))}
                <section>
                  <ShieldCheck />
                  <p>
                    {result.actor.name} sees only artifacts permitted before
                    this pipeline begins.
                  </p>
                </section>
              </aside>
              <main>
                <div className={styles.sourcePathHeader}>
                  <span>
                    <small>01 · CONNECTOR</small>
                    <strong>{connection?.name ?? 'Source connector'}</strong>
                    <code>
                      {connection?.transport ?? 'simulated'} ·{' '}
                      {connection?.strategy ?? 'permission-aware'}
                    </code>
                  </span>
                  <ArrowRight />
                  <span>
                    <small>02 · CANONICAL ARTIFACT</small>
                    <strong>{artifact.title}</strong>
                    <code>
                      {artifact.modality} · version=
                      {artifact.sourceObjectVersionId.slice(0, 8)}
                    </code>
                  </span>
                </div>
                <section className={styles.observationPicker}>
                  <header>
                    <span>
                      <small>03 · PERCEIVED OBSERVATIONS</small>
                      <strong>
                        Grounded signals with exact source locators
                      </strong>
                    </span>
                    <code>process=deterministic</code>
                  </header>
                  <div>
                    {artifact.observations.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-selected={item.id === observation?.id}
                        onClick={() => setObservationId(item.id)}
                      >
                        <span>
                          <small>{item.type}</small>
                          <strong>{item.statement}</strong>
                        </span>
                        <code>{Math.round(item.confidence * 100)}%</code>
                      </button>
                    ))}
                  </div>
                  {observation ? (
                    <footer>
                      <FileSearch />
                      <span>
                        <small>SOURCE RECEIPT</small>
                        <strong>{locatorSummary(observation.locator)}</strong>
                        <code>
                          observation={observation.id.slice(0, 8)} ·{' '}
                          {observation.process}
                        </code>
                      </span>
                    </footer>
                  ) : null}
                </section>
                <div className={styles.assertionToHypothesis}>
                  <section>
                    <small>04 · ASSERTIONS FROM THIS OBSERVATION</small>
                    {observationAssertions.map((assertion) => (
                      <code key={assertion.id}>
                        {observation?.type} —{assertion.predicate}→{' '}
                        {assertion.objectName} · id={assertion.id.slice(0, 8)}
                      </code>
                    ))}
                  </section>
                  <ArrowRight />
                  <section>
                    <small>05 · SYSTEM PROPOSAL · UNTRUSTED</small>
                    <strong>
                      {hypothesis?.statement ??
                        'No background hypothesis is currently proposed.'}
                    </strong>
                    <span>
                      {hypothesis
                        ? selectedHypothesisEvidence
                          ? `Selected observation ${selectedHypothesisEvidence.role} this proposal · assertion=${selectedHypothesisEvidence.assertionId.slice(0, 8)}`
                          : 'Selected observation did not contribute to this proposal.'
                        : 'The materiality threshold has not been met.'}
                    </span>
                  </section>
                </div>
                <div className={styles.answerTrustGate}>
                  <ShieldCheck />
                  <span>
                    <small>06 · ANSWER TRUST GATE</small>
                    <strong>
                      This proposed hypothesis did not become an answer fact.
                    </strong>
                  </span>
                  <code>answer_trace={result.traceId.slice(0, 8)}</code>
                </div>
              </main>
            </div>
          ) : (
            <div className={styles.sourceJourneyEmpty}>
              No source-integration state is configured for this project.
            </div>
          )
        ) : null}

        {tab === 'hypothesis' ? (
          hypothesis && integration?.compounding ? (
            <div className={styles.hypothesisBasisView}>
              <header>
                <div>
                  <span className={styles.dataLabel}>
                    BACKGROUND HYPOTHESIS · NOT TRUSTED MEMORY
                  </span>
                  <h3>{hypothesis.statement}</h3>
                  <p>{hypothesis.rationale}</p>
                </div>
                <code>status={hypothesis.status}</code>
              </header>
              <section className={styles.hypothesisMetrics}>
                <span>
                  <small>CONFIDENCE</small>
                  <strong>{Math.round(hypothesis.confidence * 100)}%</strong>
                </span>
                <span>
                  <small>SOURCE DIVERSITY</small>
                  <strong>{hypothesis.sourceDiversity}</strong>
                </span>
                <span>
                  <small>LAST OBSERVED</small>
                  <strong>
                    {new Date(hypothesis.lastObservedAt).toLocaleDateString()}
                  </strong>
                </span>
                <span>
                  <small>NEXT EVALUATION</small>
                  <strong>
                    {integration.compounding.nextEvaluationAt
                      ? new Date(
                          integration.compounding.nextEvaluationAt,
                        ).toLocaleDateString()
                      : 'Not scheduled'}
                  </strong>
                </span>
              </section>
              <div className={styles.hypothesisBasisGrid}>
                <section>
                  <header>
                    <span>
                      <small>EVIDENCE BASIS</small>
                      <strong>
                        {hypothesis.observationEvidence.length} observation
                        links from {hypothesis.evidence.length} artifacts
                      </strong>
                    </span>
                    <code>assertion-linked</code>
                  </header>
                  {hypothesis.observationEvidence.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setArtifactId(item.artifactId);
                        setObservationId(item.observationId);
                        setTab('journey');
                      }}
                    >
                      <i>{item.role === 'supports' ? 'SUP' : 'CHA'}</i>
                      <span>
                        <strong>{item.observationStatement}</strong>
                        <small>
                          {item.artifactTitle} · {locatorSummary(item.locator)}{' '}
                          · assertion={item.assertionId.slice(0, 8)}
                        </small>
                      </span>
                      <ChevronRight />
                    </button>
                  ))}
                  <footer>
                    <ShieldCheck />
                    <span>
                      <strong>
                        {
                          hypothesis.observationEvidence.filter(
                            (item) => item.role === 'supports',
                          ).length
                        }{' '}
                        support ·{' '}
                        {
                          hypothesis.observationEvidence.filter(
                            (item) => item.role === 'challenges',
                          ).length
                        }{' '}
                        challenge links
                      </strong>
                      <small>
                        Every link preserves its artifact, exact locator and
                        actor-visible semantic assertion.
                      </small>
                    </span>
                  </footer>
                </section>
                <aside>
                  <section>
                    <small>PREDICTIONS TO TEST</small>
                    {hypothesis.predictions.map((prediction) => (
                      <p key={prediction}>{prediction}</p>
                    ))}
                  </section>
                  <section>
                    <small>WOULD REFUTE THIS</small>
                    {hypothesis.falsificationConditions.map((condition) => (
                      <p key={condition}>{condition}</p>
                    ))}
                  </section>
                  <code>hypothesis={hypothesis.id}</code>
                </aside>
              </div>
            </div>
          ) : (
            <div className={styles.sourceJourneyEmpty}>
              No background hypothesis is currently proposed.
            </div>
          )
        ) : null}

        {tab === 'assets' ? (
          foundation ? (
            <div className={styles.contextAssetView}>
              <header>
                <div>
                  <span className={styles.dataLabel}>
                    GOVERNED CONTEXT FOUNDATION
                  </span>
                  <h3>{foundation.scenario.title}</h3>
                  <p>{foundation.scenario.purpose}</p>
                </div>
                <code>quality={foundation.status}</code>
              </header>
              <section>
                {foundation.assets.map((asset, index) => (
                  <article key={asset.resourceId}>
                    <i>{String(index + 1).padStart(2, '0')}</i>
                    <span>
                      <small>
                        {asset.kind} · {asset.authority}
                      </small>
                      <strong>{asset.name}</strong>
                      <p>{asset.definition}</p>
                    </span>
                    <code>
                      v{asset.version} · {asset.quality?.status ?? 'unassessed'}
                    </code>
                  </article>
                ))}
              </section>
              <footer>
                <span>
                  <small>ASSETS</small>
                  <strong>{foundation.summary.assetCount}</strong>
                </span>
                <span>
                  <small>DEPENDENCIES</small>
                  <strong>{foundation.dependencies.length}</strong>
                </span>
                <span>
                  <small>READY</small>
                  <strong>{foundation.summary.readyCount}</strong>
                </span>
                <span>
                  <small>BLOCKERS</small>
                  <strong>{foundation.summary.blockingIssueCount}</strong>
                </span>
              </footer>
            </div>
          ) : (
            <div className={styles.sourceJourneyEmpty}>
              No governed context foundation is configured for this project.
            </div>
          )
        ) : null}

        {tab === 'requirements' ? (
          <div className={styles.requirementsView}>
            <header>
              <div>
                <span className={styles.dataLabel}>
                  PM-READY REQUIREMENT SEEDS
                </span>
                <h3>Implementation contracts implied by this journey</h3>
                <p>
                  These are starting points for refinement, not automatically
                  approved requirements.
                </p>
              </div>
              <button type="button" onClick={() => void copyRequirements()}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy all'}
              </button>
            </header>
            <section>
              {requirements.map((item, index) => (
                <article key={item.title}>
                  <i>{String(index + 1).padStart(2, '0')}</i>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <span>
                      <b>Acceptance</b>
                      {item.acceptance}
                    </span>
                  </div>
                </article>
              ))}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ChangePropagationDrawer({
  receipt,
  finding,
  onClose,
}: {
  receipt: PropagationReceipt;
  finding: string;
  onClose: () => void;
}) {
  const stages = [
    {
      number: '01',
      label: 'SOURCE VERSION',
      title:
        receipt.source.outcome === 'version-created'
          ? 'Immutable version created'
          : 'Existing version recognised',
      detail: receipt.version.sourceUri,
      identity: receipt.version.id,
      icon: Database,
    },
    {
      number: '02',
      label: 'PERCEPTION',
      title: finding,
      detail: receipt.observation.process,
      identity: receipt.observation.id,
      icon: FileSearch,
    },
    {
      number: '03',
      label: 'ASSERTION',
      title: `${receipt.assertion.predicate} the monitored explanation`,
      detail: 'Actor-visible, provenance-linked evidence assertion',
      identity: receipt.assertion.id,
      icon: GitBranch,
    },
    {
      number: '04',
      label: 'HYPOTHESIS EVALUATION',
      title: receipt.hypothesis.candidateId
        ? 'Reviewable counter-hypothesis formed'
        : 'Monitor evaluated the change',
      detail: `candidate=${receipt.hypothesis.candidateStatus ?? 'none'}`,
      identity: receipt.hypothesis.evaluationRunId,
      icon: BrainCircuit,
    },
  ];
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <section
        className={styles.changePropagationDrawer}
        role="dialog"
        aria-modal="true"
        aria-label="Source change propagation receipt"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className={styles.dataLabel}>CHANGE PROPAGATION RECEIPT</span>
            <h2>What changed—and what it affected</h2>
            <p>
              Persisted identities from source ingestion through answer impact.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close source change receipt"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <main>
          <div className={styles.changePropagationSequence}>
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <article key={stage.number}>
                  <i>
                    <Icon />
                  </i>
                  <span>
                    <small>
                      {stage.number} · {stage.label}
                    </small>
                    <strong>{stage.title}</strong>
                    <p>{stage.detail}</p>
                    <code>
                      id={stage.identity?.slice(0, 12) ?? 'not-created'}
                    </code>
                  </span>
                  {index < stages.length - 1 ? <ArrowRight /> : null}
                </article>
              );
            })}
          </div>
          <section className={styles.answerImpactReceipt}>
            <header>
              <Sparkles />
              <span>
                <small>05 · ANSWER IMPACT</small>
                <strong>
                  {receipt.answerImpact.before ?? 'unknown'} →{' '}
                  {receipt.answerImpact.after ?? 'unchanged'}
                </strong>
              </span>
              <code>{receipt.answerImpact.evidenceDeltas} evidence delta</code>
            </header>
            <p>{receipt.answerImpact.explanation}</p>
            <footer>
              <span>
                This receipt explains propagation; it does not automatically
                approve the proposed memory.
              </span>
              <code>sync_run={receipt.source.syncRunId.slice(0, 12)}</code>
            </footer>
          </section>
        </main>
      </section>
    </div>
  );
}

function OutputCard({
  result,
  answer,
  onEvidence,
}: {
  result: ContextResponse;
  answer: AnswerResponse['answer'] | null;
  onEvidence: () => void;
}) {
  const cautious = result.epistemicState.status === 'contested';
  const claims = responseClaims(answer, result);
  return (
    <section
      className={styles.outputCard}
      data-reliability={cautious ? 'contested' : 'supported'}
    >
      <header>
        <div>
          <span className={styles.dataLabel}>ANSWER CONFIDENCE</span>
          <h2>
            <span className={styles.visuallyHidden}>
              The organisational answer
            </span>
            <span aria-hidden="true">
              {cautious
                ? 'One source challenges this answer'
                : 'Supported by the evidence you can see'}
            </span>
          </h2>
          <small className={styles.reliabilitySummary}>
            {result.epistemicState.supportingEvidence} support ·{' '}
            {result.epistemicState.contradictingEvidence} challenge
          </small>
        </div>
        <span className={styles.provider}>
          <CircleDot />
          {answer?.mode === 'provider'
            ? `provider=${answer.provider}`
            : 'mode=deterministic'}
        </span>
      </header>
      <article className={styles.answerBlock}>
        <span className={styles.uiLabel}>Answer</span>
        {claims.map((claim, claimIndex) => (
          <p key={`${claim.text}-${claimIndex}`} className={styles.storyCopy}>
            {claim.text}
            {claim.evidenceIds.map((evidenceId) => {
              const evidenceIndex = result.evidence.findIndex(
                (evidence) => evidence.id === evidenceId,
              );
              return evidenceIndex >= 0 ? (
                <button key={evidenceId} type="button" onClick={onEvidence}>
                  [evidence:{String(evidenceIndex + 1).padStart(2, '0')}]
                </button>
              ) : null;
            })}
          </p>
        ))}
      </article>
      <article className={styles.inferenceField}>
        <header>
          <Sparkles />
          <div>
            <span className={styles.dataLabel}>
              NEXT MOVE · SYSTEM INFERENCE
            </span>
            <strong>Suggested from the visible evidence</strong>
          </div>
        </header>
        <p className={styles.storyCopy}>
          {cautious
            ? 'Separate the competing explanations before scaling a fix.'
            : 'Start with the document-check hand-off, then test clearer guidance.'}
        </p>
        <small>
          System inference from visible evidence · not a source fact
        </small>
      </article>
      <footer>
        <button type="button" onClick={onEvidence}>
          <FileSearch />
          <span>
            <small className={styles.uiLabel}>Progressive disclosure</small>
            <strong>Open {result.evidence.length} evidence files</strong>
          </span>
          <ChevronRight />
        </button>
        <code>trace_id={result.traceId.slice(0, 8)}</code>
      </footer>
    </section>
  );
}

function TraceCard({
  result,
  memory,
  projectMemory,
  onInputs,
  onStage,
  onEvidence,
  onProjectMemory,
}: {
  result: ContextResponse;
  memory: MemoryState | null;
  projectMemory: ProjectMemoryState | null;
  onInputs: () => void;
  onStage: (stage: StageId) => void;
  onEvidence: () => void;
  onProjectMemory: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>('trace');
  const stages = useMemo(() => stagesFor(result, memory), [result, memory]);
  const operations = stages.filter((stage) => stage.step !== null);
  const sourceIntegration = projectMemory?.sourceIntegration;
  const compoundingHypothesis = sourceIntegration?.compounding?.hypothesis;
  const graphPreview = useMemo(() => {
    const graphNodes = result.graph.nodes;
    const graphEdges = result.graph.edges;
    const anchor =
      graphNodes.find((node) =>
        node.type.toLowerCase().includes('hypothesis'),
      ) ?? graphNodes[0];
    if (!anchor) return { nodes: [], edges: [] };
    const selectedIds = new Set<string>([anchor.id]);
    for (let pass = 0; pass < 4 && selectedIds.size < 12; pass += 1) {
      for (const edge of graphEdges) {
        if (selectedIds.size >= 12) break;
        if (selectedIds.has(edge.source)) selectedIds.add(edge.target);
        if (selectedIds.size >= 12) break;
        if (selectedIds.has(edge.target)) selectedIds.add(edge.source);
      }
    }
    for (const node of graphNodes) {
      if (selectedIds.size >= 12) break;
      if (
        ['client', 'project', 'person'].some((type) =>
          node.type.toLowerCase().includes(type),
        )
      ) {
        selectedIds.add(node.id);
      }
    }
    const selected = graphNodes.filter((node) => selectedIds.has(node.id));
    const columnFor = (type: string) => {
      const normalized = type.toLowerCase();
      if (
        ['note', 'document', 'transcript', 'table', 'image'].some((value) =>
          normalized.includes(value),
        )
      )
        return 0;
      if (normalized.includes('evidence')) return 1;
      if (normalized.includes('hypothesis')) return 2;
      return 3;
    };
    const columns = [0, 1, 2, 3].map((column) =>
      selected.filter((node) => columnFor(node.type) === column),
    );
    const xByColumn = [62, 235, 425, 618];
    const positioned = columns.flatMap((nodes, column) =>
      nodes.map((node, index) => ({
        ...node,
        column,
        x: xByColumn[column]!,
        y:
          nodes.length === 1
            ? 145
            : 42 + index * (206 / Math.max(1, nodes.length - 1)),
      })),
    );
    const positions = new Map(positioned.map((node) => [node.id, node]));
    return {
      nodes: positioned,
      edges: graphEdges
        .filter(
          (edge) => positions.has(edge.source) && positions.has(edge.target),
        )
        .map((edge) => ({
          ...edge,
          sourceNode: positions.get(edge.source)!,
          targetNode: positions.get(edge.target)!,
        })),
    };
  }, [result.graph.edges, result.graph.nodes]);
  const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'trace', label: 'Trace' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'graph', label: 'Graph' },
    { id: 'memory', label: 'Memory' },
    { id: 'meaning', label: 'Meaning' },
  ];
  return (
    <section className={styles.traceCard}>
      <header>
        <div>
          <span className={styles.dataLabel}>TRACE · ANSWER_RESPONSE</span>
          <h2>How this output was produced</h2>
        </div>
        <nav className={styles.inspectorTabs} aria-label="Working inspector">
          {inspectorTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'trace' ? (
        <div className={styles.traceBody}>
          <button
            className={styles.inputReceipt}
            type="button"
            onClick={onInputs}
          >
            <Database />
            <span>
              <small>INPUT · LIVES OUTSIDE THE BRAIN</small>
              <strong>
                {result.sourceSystems.length} connected systems ·{' '}
                {result.accessProfile.sourceObjects} source objects
              </strong>
            </span>
            {sourceIntegration ? (
              <code>
                {sourceIntegration.summary.artifactCount} artifacts perceived
              </code>
            ) : null}
            <ChevronRight />
          </button>
          <section className={styles.productionSequence}>
            {operations.map((stage, index) => {
              const detail =
                stage.id === 'scope'
                  ? `${result.actor.name} can search ${result.accessProfile.sourceObjects} source objects.`
                  : stage.id === 'identity'
                    ? `${result.interpretedQuery.entities.length} canonical resources resolved from names and aliases.`
                    : stage.id === 'meaning'
                      ? `${result.graph.edges.length} permitted relationships connected under ${result.ontology.version}.`
                      : `${result.evidence.length} items retained; ${result.epistemicState.status} evidence state.`;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onStage(stage.id)}
                >
                  <i>{String(stage.step).padStart(2, '0')}</i>
                  <span>
                    <strong>{stage.operation}</strong>
                    <small>{detail}</small>
                  </span>
                  <code>{stage.runtime[0]}</code>
                  <ChevronRight />
                  {index < operations.length - 1 ? (
                    <b aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </section>
          <footer className={styles.traceReceipts}>
            <span>
              <ShieldCheck />
              <small>Applied throughout</small>
              <strong>Permissions · provenance · versioned meaning</strong>
            </span>
            <button type="button" onClick={() => onStage('monitor')}>
              <Bot />
              <span>
                <small>Continues after this answer</small>
                <strong>Hypothesis monitor and memory loop</strong>
              </span>
              <b>{displayMonitorStatus(memory?.policy?.status)}</b>
              <ChevronRight />
            </button>
          </footer>
        </div>
      ) : null}
      {tab === 'evidence' ? (
        <div className={styles.inspectorPanel}>
          <header className={styles.panelSummary}>
            <span>
              <small className={styles.uiLabel}>PERMISSIONED EVIDENCE</small>
              <strong>
                {result.evidence.length} sources used in this answer
              </strong>
            </span>
            <code>
              {result.epistemicState.supportingEvidence} support ·{' '}
              {result.epistemicState.contradictingEvidence} challenge
            </code>
          </header>
          <div className={styles.inspectorList}>
            {result.evidence.map((item, index) => (
              <button key={item.id} type="button" onClick={onEvidence}>
                <i>{String(index + 1).padStart(2, '0')}</i>
                <span>
                  <small>{item.source.type}</small>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </span>
                <code data-stance={item.stance.toLowerCase()}>
                  {item.stance.toLowerCase()}
                </code>
              </button>
            ))}
          </div>
          <button
            className={styles.panelAction}
            type="button"
            onClick={onEvidence}
          >
            Read evidence, provenance and ranking <ChevronRight />
          </button>
        </div>
      ) : null}
      {tab === 'graph' ? (
        <div className={styles.inspectorPanel}>
          <header className={styles.panelSummary}>
            <span>
              <small className={styles.uiLabel}>PERMISSIONED SUBGRAPH</small>
              <strong>
                {result.graph.nodes.length} nodes · {result.graph.edges.length}{' '}
                connections
              </strong>
            </span>
            <code>restricted=0</code>
          </header>
          <svg
            className={styles.graphCanvas}
            viewBox="0 0 680 290"
            role="img"
            aria-labelledby="working-graph-title working-graph-description"
          >
            <title id="working-graph-title">
              Permissioned context subgraph
            </title>
            <desc id="working-graph-description">
              Visible source, evidence, hypothesis, project and client nodes
              connected by the relationships returned for this actor.
            </desc>
            <defs>
              <marker
                id="working-graph-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
            </defs>
            <g className={styles.graphEdges}>
              {graphPreview.edges.map((edge) => (
                <line
                  key={edge.id}
                  x1={edge.sourceNode.x}
                  y1={edge.sourceNode.y}
                  x2={edge.targetNode.x}
                  y2={edge.targetNode.y}
                  markerEnd="url(#working-graph-arrow)"
                >
                  <title>{edge.type}</title>
                </line>
              ))}
            </g>
            <g className={styles.graphNodes}>
              {graphPreview.nodes.map((node) => (
                <g
                  key={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  data-column={node.column}
                >
                  <circle r="11" />
                  <text y="25" textAnchor="middle">
                    {node.label.length > 25
                      ? `${node.label.slice(0, 23)}…`
                      : node.label}
                  </text>
                  <title>
                    {node.type}: {node.label}
                  </title>
                </g>
              ))}
            </g>
            <g className={styles.graphColumnLabels}>
              <text x="62" y="282" textAnchor="middle">
                Sources
              </text>
              <text x="235" y="282" textAnchor="middle">
                Evidence
              </text>
              <text x="425" y="282" textAnchor="middle">
                Hypotheses
              </text>
              <text x="618" y="282" textAnchor="middle">
                Context
              </text>
            </g>
          </svg>
          <div className={styles.graphRelations}>
            {result.graph.edges.slice(0, 6).map((edge) => (
              <code key={edge.id}>{edge.type}</code>
            ))}
          </div>
          <p className={styles.panelNote}>
            Nodes and edges enter this view only after the actor boundary has
            been applied.
          </p>
        </div>
      ) : null}
      {tab === 'memory' ? (
        <div className={styles.inspectorPanel}>
          <header className={styles.panelSummary}>
            <span>
              <small className={styles.uiLabel}>CONTINUAL LEARNING</small>
              <strong>
                {memory?.hypothesis?.lifecycleStatus ?? 'active'} ·{' '}
                {memory?.hypothesis?.epistemicStatus ?? 'supported'}
              </strong>
            </span>
            <code>route={memory?.modelRouting?.latestRoute ?? 'no-model'}</code>
          </header>
          <div className={styles.memoryFlow}>
            {[
              ['01', 'Form', 'Create a testable candidate'],
              ['02', 'Test', 'Assemble permitted evidence'],
              ['03', 'Monitor', 'Re-run when sources change'],
              ['04', 'Propose', 'Keep the learning untrusted'],
              ['05', 'Review', 'Retain an attributable memory'],
            ].map(([step, label, detail]) => (
              <article key={step}>
                <i>{step}</i>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </article>
            ))}
          </div>
          {compoundingHypothesis ? (
            <section className={styles.systemProposal}>
              <small className={styles.dataLabel}>
                SYSTEM OUTPUT · UNTRUSTED · AWAITS LEAD REVIEW
              </small>
              <strong>{compoundingHypothesis.statement}</strong>
              <code>
                {compoundingHypothesis.evidenceCount} artifacts ·{' '}
                {compoundingHypothesis.sourceDiversity} sources
              </code>
            </section>
          ) : null}
          <div className={styles.panelActions}>
            <button type="button" onClick={() => onStage('monitor')}>
              Open monitor operations <ChevronRight />
            </button>
            <button type="button" onClick={onProjectMemory}>
              Open project memory <ChevronRight />
            </button>
          </div>
        </div>
      ) : null}
      {tab === 'meaning' ? (
        <div className={styles.inspectorPanel}>
          <header className={styles.panelSummary}>
            <span>
              <small className={styles.uiLabel}>VERSIONED SHARED MEANING</small>
              <strong>{result.ontology.version}</strong>
            </span>
            <code>{result.ontology.status}</code>
          </header>
          <div className={styles.meaningChain}>
            <article>
              <small>Business terms</small>
              <strong>
                {result.ontology.resourceTypes.length} governed types
              </strong>
            </article>
            <ArrowRight />
            <article>
              <small>Knowledge graph</small>
              <strong>
                {result.ontology.relationships.length} relationship rules
              </strong>
            </article>
            <ArrowRight />
            <article>
              <small>Resolved language</small>
              <strong>
                {result.ontology.aliases.length} aliases in this trace
              </strong>
            </article>
          </div>
          <div className={styles.inspectorList}>
            {result.ontology.resourceTypes.slice(0, 5).map((type) => (
              <button
                key={type.name}
                type="button"
                onClick={() => onStage('meaning')}
              >
                <i>
                  <Sparkles />
                </i>
                <span>
                  <small>{type.kind}</small>
                  <strong>{type.name}</strong>
                  <p>{type.description}</p>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
          <button
            className={styles.panelAction}
            type="button"
            onClick={() => onStage('meaning')}
          >
            Inspect ontology and semantic proposals <ChevronRight />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function readableToken(value: string) {
  return value
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function KickoffPhase({
  state,
  busy,
  message,
  onGenerate,
}: {
  state: ProjectMemoryState | null;
  busy: string | null;
  message: string | null;
  onGenerate: () => void;
}) {
  const items = state?.kickoff?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem =
    items.find((item) => item.memoryId === selectedId) ?? items[0] ?? null;
  const selectedMemory = selectedItem
    ? (state?.memories.find(
        (memoryItem) => memoryItem.id === selectedItem.memoryId,
      ) ?? null)
    : null;
  const [inspectorTab, setInspectorTab] = useState<'scopes' | 'policy' | 'why'>(
    'scopes',
  );

  if (!state) {
    return (
      <div className={styles.phaseLoading}>
        <Sparkles />
        <span>
          <strong>Preparing the project kickoff</strong>
          <small>Resolving approved memory and its scope boundary…</small>
        </span>
      </div>
    );
  }

  return (
    <section
      className={styles.lifecycleWorkspace}
      data-phase="kickoff"
      aria-label="Kickoff workspace"
    >
      <section className={styles.phasePrimary}>
        <header className={styles.phaseHeading}>
          <div>
            <span className={styles.dataLabel}>
              SYSTEM OUTPUT · KICKOFF_PACK
            </span>
            <h2>Useful precedent before the project starts</h2>
            <p>
              Selected from approved memory using this project’s current
              context. Nothing here was inferred from a question.
            </p>
          </div>
          <span className={styles.phaseMetric}>
            <strong>{items.length}</strong>
            <small>memories surfaced</small>
          </span>
        </header>
        {items.length ? (
          <div className={styles.precedentList}>
            {items.map((item, index) => {
              const memoryItem = state.memories.find(
                (memory) => memory.id === item.memoryId,
              );
              return (
                <button
                  key={item.memoryId}
                  type="button"
                  data-selected={selectedItem?.memoryId === item.memoryId}
                  onClick={() => setSelectedId(item.memoryId)}
                >
                  <i>{String(index + 1).padStart(2, '0')}</i>
                  <span>
                    <small className={styles.uiLabel}>
                      MEMORY RECORD · {readableToken(item.memoryType)}
                    </small>
                    <strong>{item.statement}</strong>
                    <em>
                      scope={item.sourceScope} · relevance=
                      {Math.round(item.relevance * 100)}%
                    </em>
                  </span>
                  <code>{memoryItem?.outcomeStatus ?? 'untested'}</code>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.phaseEmpty}>
            <FileSearch />
            <strong>No kickoff pack exists for this project yet.</strong>
            <p>
              Generate one from the active memories this actor is permitted to
              use.
            </p>
          </div>
        )}
        <footer className={styles.phaseFooter}>
          <span>
            <small className={styles.uiLabel}>GENERATED</small>
            <code>
              {state.kickoff
                ? new Date(state.kickoff.generatedAt).toLocaleString()
                : 'not generated'}
            </code>
          </span>
          <button
            type="button"
            disabled={Boolean(busy) || !state.permissions.canGenerateKickoff}
            onClick={onGenerate}
          >
            <RefreshCw />
            {busy === 'generate-kickoff' ? 'Refreshing…' : 'Refresh kickoff'}
          </button>
        </footer>
      </section>

      <aside className={styles.phaseInspector}>
        <nav
          className={styles.phaseInspectorTabs}
          aria-label="Kickoff inspector"
        >
          {(
            [
              ['scopes', 'Scopes'],
              ['policy', 'Policy'],
              ['why', 'Why these'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={inspectorTab === id}
              onClick={() => setInspectorTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {selectedItem && inspectorTab === 'scopes' ? (
          <>
            <header className={styles.inspectorSectionHeading}>
              <strong>Five governance boundaries, not a ladder.</strong>
              <p>
                This memory was learned and remains visible at the declared
                scope. Reuse never silently widens the original.
              </p>
            </header>
            <div className={styles.memoryAxes}>
              <span>
                <small>LIFECYCLE</small>
                <strong>{selectedMemory?.status ?? 'active'}</strong>
              </span>
              <span>
                <small>REVIEW</small>
                <strong>{selectedMemory?.reviewStatus ?? 'approved'}</strong>
              </span>
              <span>
                <small>OUTCOME</small>
                <strong>{selectedMemory?.outcomeStatus ?? 'untested'}</strong>
              </span>
            </div>
            <dl className={styles.selectionReceipt}>
              <div>
                <dt>Source scope</dt>
                <dd>{selectedItem.sourceScope}</dd>
              </div>
              <div>
                <dt>Evidence retained</dt>
                <dd>{selectedMemory?.evidenceCount ?? 0} linked items</dd>
              </div>
              <div>
                <dt>Formation process</dt>
                <dd>{selectedMemory?.process ?? 'governed-memory'}</dd>
              </div>
            </dl>
          </>
        ) : selectedItem && inspectorTab === 'why' ? (
          <>
            <header className={styles.inspectorSectionHeading}>
              <strong>Why this precedent was selected</strong>
              <p>
                The kickoff pack ranks approved memory against the current
                project brief and actor boundary.
              </p>
            </header>
            <blockquote>{selectedItem.rationale}</blockquote>
            <dl className={styles.selectionReceipt}>
              <div>
                <dt>Relevance</dt>
                <dd>{Math.round(selectedItem.relevance * 100)}%</dd>
              </div>
              <div>
                <dt>Outcome state</dt>
                <dd>{selectedMemory?.outcomeStatus ?? 'untested'}</dd>
              </div>
              <div>
                <dt>Evidence retained</dt>
                <dd>{selectedMemory?.evidenceCount ?? 0} linked items</dd>
              </div>
            </dl>
          </>
        ) : inspectorTab === 'policy' ? (
          <>
            <header className={styles.inspectorSectionHeading}>
              <strong>What the boundary withheld</strong>
              <p>
                Policy refusals remain visible as decisions rather than being
                silently omitted from the experience.
              </p>
            </header>
            <section className={styles.boundaryReceipt}>
              <ShieldCheck />
              <span>
                <small className={styles.uiLabel}>
                  CLIENT LAYER · DISABLED
                </small>
                <strong>Client-wide memory is not consulted</strong>
                <p>{state.clientMemory.reason}</p>
              </span>
            </section>
          </>
        ) : (
          <div className={styles.inspectorPlaceholder}>
            <GitBranch />
            <p>
              The selection rationale, scope and independent memory states will
              appear here.
            </p>
          </div>
        )}
        {message ? <p className={styles.phaseMessage}>{message}</p> : null}
      </aside>

      <footer className={styles.lifecycleRail}>
        <span data-active="true">Approved precedent</span>
        <ArrowRight />
        <span data-active="true">Kickoff selection</span>
        <ArrowRight />
        <span>Project activity</span>
        <ArrowRight />
        <span>Debrief review</span>
        <ArrowRight />
        <span>Future kickoff</span>
      </footer>
    </section>
  );
}

type DebriefFilter = 'candidate' | 'approved' | 'retained';

function DebriefPhase({
  state,
  busy,
  message,
  onCapture,
  onReview,
}: {
  state: ProjectMemoryState | null;
  busy: string | null;
  message: string | null;
  onCapture: (input: {
    memoryType: string;
    statement: string;
    context: string;
    outcome: string;
  }) => void;
  onReview: (
    memory: ProjectMemoryView,
    decision: 'approve' | 'reject' | 'correct',
    note: string,
    correctedStatement?: string,
  ) => void;
}) {
  const [filter, setFilter] = useState<DebriefFilter>('candidate');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'gate' | 'review' | 'lineage'>(
    'gate',
  );
  const [reviewNote, setReviewNote] = useState(
    'Evidence is attributable and the learning is reusable in this project.',
  );
  const [correctedStatement, setCorrectedStatement] = useState('');
  const [debrief, setDebrief] = useState({
    memoryType: 'approach-pattern',
    statement: '',
    context: '',
    outcome: '',
  });

  const records = useMemo(() => {
    if (!state) return [];
    if (filter === 'candidate')
      return state.memories.filter((memory) => memory.status === 'candidate');
    if (filter === 'approved')
      return state.memories.filter(
        (memory) =>
          memory.reviewStatus === 'approved' && memory.status === 'active',
      );
    return state.memories.filter(
      (memory) =>
        memory.status === 'rejected' || memory.status === 'superseded',
    );
  }, [filter, state]);
  const selected =
    records.find((memory) => memory.id === selectedId) ?? records[0] ?? null;
  const counts = {
    candidate:
      state?.memories.filter((memory) => memory.status === 'candidate')
        .length ?? 0,
    approved:
      state?.memories.filter(
        (memory) =>
          memory.status === 'active' && memory.reviewStatus === 'approved',
      ).length ?? 0,
    retained:
      state?.memories.filter(
        (memory) =>
          memory.status === 'rejected' || memory.status === 'superseded',
      ).length ?? 0,
  };

  if (!state) {
    return (
      <div className={styles.phaseLoading}>
        <GitBranch />
        <span>
          <strong>Preparing the project debrief</strong>
          <small>Resolving candidates, reviews and retained outcomes…</small>
        </span>
      </div>
    );
  }

  return (
    <section
      className={styles.lifecycleWorkspace}
      data-phase="debrief"
      aria-label="Debrief workspace"
    >
      <section className={styles.phasePrimary}>
        <header className={styles.phaseHeading}>
          <div>
            <span className={styles.dataLabel}>
              REVIEW GATE · PROJECT MEMORY
            </span>
            <h2>Decide what this project should teach the next one</h2>
            <p>
              Candidates cannot influence future work until a permitted person
              approves, corrects or rejects them.
            </p>
          </div>
          <button
            className={styles.captureLaunch}
            type="button"
            disabled={!state.permissions.canCapture}
            onClick={() => setCaptureOpen((current) => !current)}
          >
            <UserRound /> {captureOpen ? 'Close capture' : 'Add human debrief'}
          </button>
        </header>

        <nav className={styles.debriefFilters} aria-label="Memory review state">
          {(
            [
              ['candidate', 'Needs review'],
              ['approved', 'Approved'],
              ['retained', 'Retained history'],
            ] as Array<[DebriefFilter, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setSelectedId(null);
                setCorrectOpen(false);
              }}
            >
              {label} <span>{counts[id]}</span>
            </button>
          ))}
        </nav>

        {captureOpen ? (
          <div className={styles.debriefCapture}>
            <label>
              <span>Memory type</span>
              <select
                value={debrief.memoryType}
                onChange={(event) =>
                  setDebrief({ ...debrief, memoryType: event.target.value })
                }
              >
                <option value="approach-pattern">Approach pattern</option>
                <option value="decision">Decision</option>
                <option value="risk-response">Risk response</option>
                <option value="constraint-adaptation">
                  Constraint adaptation
                </option>
                <option value="anti-pattern">Anti-pattern</option>
                <option value="stakeholder-pattern">Stakeholder pattern</option>
              </select>
            </label>
            <label className={styles.captureStatement}>
              <span>What should this project remember?</span>
              <textarea
                value={debrief.statement}
                onChange={(event) =>
                  setDebrief({ ...debrief, statement: event.target.value })
                }
                placeholder="Describe a reusable learning…"
              />
            </label>
            <label>
              <span>When did it apply?</span>
              <input
                value={debrief.context}
                onChange={(event) =>
                  setDebrief({ ...debrief, context: event.target.value })
                }
                placeholder="Context or constraint"
              />
            </label>
            <label>
              <span>Observable outcome</span>
              <input
                value={debrief.outcome}
                onChange={(event) =>
                  setDebrief({ ...debrief, outcome: event.target.value })
                }
                placeholder="What happened?"
              />
            </label>
            <button
              type="button"
              disabled={Boolean(busy) || debrief.statement.trim().length < 20}
              onClick={() => onCapture(debrief)}
            >
              {busy === 'capture-debrief'
                ? 'Creating candidate…'
                : 'Create reviewable candidate'}
              <ArrowRight />
            </button>
          </div>
        ) : records.length ? (
          <div className={styles.reviewList}>
            {records.map((memory, index) => (
              <button
                key={memory.id}
                type="button"
                data-selected={selected?.id === memory.id}
                onClick={() => {
                  setSelectedId(memory.id);
                  setCorrectOpen(false);
                  setCorrectedStatement(memory.statement);
                  setDetailTab('review');
                }}
              >
                <i>{String(index + 1).padStart(2, '0')}</i>
                <span>
                  <small className={styles.uiLabel}>
                    {readableToken(memory.type)} · SYSTEM/HUMAN SIGNAL
                  </small>
                  <strong>{memory.statement}</strong>
                  <em>
                    {memory.evidenceCount} evidence · confidence{' '}
                    {Math.round(memory.confidence * 100)}%
                  </em>
                </span>
                <code>{memory.status}</code>
                <ChevronRight />
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.phaseEmpty}>
            <Check />
            <strong>No records in this state.</strong>
            <p>The audit trail remains available when records move state.</p>
          </div>
        )}
        <footer className={styles.phaseFooter}>
          <span>
            <small className={styles.uiLabel}>LATEST CAPTURE DECISION</small>
            <code>{state.capture.latestRationale ?? 'No capture run yet'}</code>
          </span>
          <span>
            {state.capture.backgroundRuns} background passes ·{' '}
            {state.capture.debriefs} human debriefs
          </span>
        </footer>
      </section>

      <aside className={styles.phaseInspector}>
        <nav
          className={styles.phaseInspectorTabs}
          aria-label="Debrief inspector"
        >
          {(
            [
              ['gate', 'Capture gate'],
              ['review', 'Review'],
              ['lineage', 'Lineage'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={detailTab === id}
              onClick={() => setDetailTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {detailTab === 'gate' ? (
          <>
            <header className={styles.inspectorSectionHeading}>
              <strong>Most activity must not become memory.</strong>
              <p>
                Capture is deliberately conservative. A signal must be material,
                attributable and strong enough to enter human review.
              </p>
            </header>
            <div className={styles.captureGateList}>
              <span>
                <i data-state="pass" />
                <strong>Material signal</strong>
                <code>{counts.candidate} passed</code>
              </span>
              <span>
                <i data-state="pass" />
                <strong>Evidence attached</strong>
                <code>required</code>
              </span>
              <span>
                <i data-state="hold" />
                <strong>Human approval</strong>
                <code>{counts.candidate} awaiting</code>
              </span>
            </div>
            <section className={styles.reviewReceipt}>
              <small className={styles.uiLabel}>LATEST POLICY DECISION</small>
              <strong>
                {state.capture.latestRationale ?? 'No capture run yet'}
              </strong>
            </section>
          </>
        ) : detailTab === 'lineage' && selected ? (
          <>
            <header className={styles.inspectorSectionHeading}>
              <strong>One retained record, three independent states.</strong>
              <p>
                Review does not erase provenance, collapse outcome state or
                promote the record beyond its project scope.
              </p>
            </header>
            <div className={styles.memoryAxes}>
              <span>
                <small>LIFECYCLE</small>
                <strong>{selected.status}</strong>
              </span>
              <span>
                <small>REVIEW</small>
                <strong>{selected.reviewStatus}</strong>
              </span>
              <span>
                <small>OUTCOME</small>
                <strong>{selected.outcomeStatus}</strong>
              </span>
            </div>
            <dl className={styles.selectionReceipt}>
              <div>
                <dt>Scope</dt>
                <dd>{selected.scope}</dd>
              </div>
              <div>
                <dt>Formation process</dt>
                <dd>{selected.process}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{selected.evidenceCount} linked items</dd>
              </div>
            </dl>
          </>
        ) : selected ? (
          <>
            <header className={styles.inspectorSectionHeading}>
              <small className={styles.uiLabel}>SELECTED MEMORY RECORD</small>
              <strong>{readableToken(selected.type)}</strong>
            </header>
            <blockquote>{selected.statement}</blockquote>
            <div className={styles.memoryAxes}>
              <span>
                <small>LIFECYCLE</small>
                <strong>{selected.status}</strong>
              </span>
              <span>
                <small>REVIEW</small>
                <strong>{selected.reviewStatus}</strong>
              </span>
              <span>
                <small>OUTCOME</small>
                <strong>{selected.outcomeStatus}</strong>
              </span>
            </div>
            <dl className={styles.selectionReceipt}>
              <div>
                <dt>Scope</dt>
                <dd>{selected.scope}</dd>
              </div>
              <div>
                <dt>Formation process</dt>
                <dd>{selected.process}</dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{Math.round(selected.qualityScore * 100)}%</dd>
              </div>
            </dl>
            {selected.status === 'candidate' && state.permissions.canReview ? (
              <div className={styles.reviewDecision}>
                <label>
                  <span>Reviewer rationale</span>
                  <input
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                </label>
                {correctOpen ? (
                  <label>
                    <span>Corrected memory statement</span>
                    <textarea
                      value={correctedStatement || selected.statement}
                      onChange={(event) =>
                        setCorrectedStatement(event.target.value)
                      }
                    />
                  </label>
                ) : null}
                <div>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => onReview(selected, 'approve', reviewNote)}
                  >
                    <Check /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => onReview(selected, 'reject', reviewNote)}
                  >
                    <X /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (!correctOpen) {
                        setCorrectOpen(true);
                        setCorrectedStatement(selected.statement);
                        return;
                      }
                      onReview(
                        selected,
                        'correct',
                        reviewNote,
                        correctedStatement,
                      );
                    }}
                  >
                    <RefreshCw /> {correctOpen ? 'Save correction' : 'Correct'}
                  </button>
                </div>
              </div>
            ) : selected.review ? (
              <section className={styles.reviewReceipt}>
                <small className={styles.uiLabel}>ATTRIBUTABLE REVIEW</small>
                <strong>
                  {readableToken(selected.review.decision)} by{' '}
                  {selected.review.reviewer}
                </strong>
                <p>{selected.review.note}</p>
              </section>
            ) : null}
          </>
        ) : (
          <div className={styles.inspectorPlaceholder}>
            <GitBranch />
            <p>
              Select a record to inspect its three independent states and
              attributable decision.
            </p>
          </div>
        )}
        <section className={styles.boundaryReceipt}>
          <ShieldCheck />
          <span>
            <small className={styles.uiLabel}>SCOPE BOUNDARY</small>
            <strong>Review does not promote this memory</strong>
            <p>{state.clientMemory.reason}</p>
          </span>
        </section>
        {message ? <p className={styles.phaseMessage}>{message}</p> : null}
      </aside>

      <footer className={styles.lifecycleRail}>
        <span data-active="true">Project activity</span>
        <ArrowRight />
        <span data-active="true">Candidate formed</span>
        <ArrowRight />
        <span data-active="true">Human review</span>
        <ArrowRight />
        <span>Durable project memory</span>
        <ArrowRight />
        <span>Future kickoff</span>
      </footer>
    </section>
  );
}

export function ContextStory() {
  const router = useRouter();
  const [query, setQuery] = useState(PRESET);
  const [actorId, setActorId] = useState<string>(PERSONAS[0].id);
  const [result, setResult] = useState<ContextResponse | null>(null);
  const [answer, setAnswer] = useState<AnswerResponse['answer'] | null>(null);
  const [memory, setMemory] = useState<MemoryState | null>(null);
  const [projectMemory, setProjectMemory] = useState<ProjectMemoryState | null>(
    null,
  );
  const [experiencePhase, setExperiencePhase] =
    useState<ExperiencePhase>('working');
  const [projectOperationLoading, setProjectOperationLoading] = useState<
    string | null
  >(null);
  const [projectOperationMessage, setProjectOperationMessage] = useState<
    string | null
  >(null);
  const [discovery, setDiscovery] = useState<DiscoveryState | null>(null);
  const [hypothesisSystem, setHypothesisSystem] =
    useState<HypothesisSystemState | null>(null);
  const [semanticEvolution, setSemanticEvolution] =
    useState<SemanticEvolutionState | null>(null);
  const [stageId, setStageId] = useState<StageId | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [sourceJourneyOpen, setSourceJourneyOpen] = useState(false);
  const [changeReceipt, setChangeReceipt] = useState<{
    finding: string;
    propagation: PropagationReceipt;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [, setMutationMessage] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const [discoveryReviewLoading, setDiscoveryReviewLoading] = useState<
    string | null
  >(null);
  const [discoveryOperationLoading, setDiscoveryOperationLoading] = useState<
    string | null
  >(null);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [semanticReviewLoading, setSemanticReviewLoading] = useState<
    string | null
  >(null);
  const [session, setSession] = useState<SessionContract | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const loadHypothesisSystem = useCallback(async (nextActorId: string) => {
    const response = await fetch('/api/v1/hypotheses', {
      headers: apiHeaders(nextActorId),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      hypotheses: HypothesisSystemState;
      memory: MemoryState;
      discovery: DiscoveryState | null;
    };
    setHypothesisSystem(payload.hypotheses);
    setMemory(payload.memory);
    setDiscovery(payload.discovery);
  }, []);

  const loadProjectMemory = useCallback(async (nextActorId: string) => {
    const response = await fetch('/api/v1/project-memory', {
      headers: apiHeaders(nextActorId),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      projectMemory: ProjectMemoryState;
    };
    setProjectMemory(payload.projectMemory);
  }, []);

  const loadSemanticEvolution = useCallback(async (nextActorId: string) => {
    const response = await fetch('/api/v1/ontology/proposals', {
      headers: apiHeaders(nextActorId),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      evolution: SemanticEvolutionState;
    };
    setSemanticEvolution(payload.evolution);
  }, []);

  const ask = useCallback(
    async (nextActorId = actorId, nextQuery = query) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/ask', {
          method: 'POST',
          headers: apiHeaders(nextActorId, { json: true }),
          body: JSON.stringify({ query: nextQuery, maxEvidence: 6 }),
        });
        if (response.status === 401) {
          setAuthRequired(true);
          throw new Error('Your session has expired. Sign in again.');
        }
        if (!response.ok)
          throw new Error(
            'The answer service could not complete this request.',
          );
        const payload = (await response.json()) as AnswerResponse;
        setResult(payload.context);
        setAnswer(payload.answer);
        void loadHypothesisSystem(nextActorId);
        void loadProjectMemory(nextActorId);
        void loadSemanticEvolution(nextActorId);
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
    [
      actorId,
      loadHypothesisSystem,
      loadProjectMemory,
      loadSemanticEvolution,
      query,
    ],
  );

  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void (async () => {
      const response = await fetch('/api/v1/session', {
        headers: apiHeaders(PERSONAS[0].id),
        cache: 'no-store',
      });
      if (response.status === 401) {
        setAuthRequired(true);
        setLoading(false);
        return;
      }
      if (!response.ok) {
        setError('The current identity could not be resolved.');
        setLoading(false);
        return;
      }
      const resolved = (await response.json()) as SessionContract;
      setSession(resolved);
      const nextActorId = resolved.actor.id;
      if (resolved.actor.authenticationMode === 'session') {
        setActorId(nextActorId);
      }
      await ask(nextActorId);
    })();
  }, [ask]);

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

  function changeActor(nextActorId: string) {
    setActorId(nextActorId);
    setMemory(null);
    setProjectMemory(null);
    setDiscovery(null);
    setHypothesisSystem(null);
    setSemanticEvolution(null);
    setChangeReceipt(null);
    setMutationMessage(null);
    void ask(nextActorId);
  }

  async function learn() {
    setMutationLoading(true);
    setMutationMessage(null);
    try {
      const response = await fetch('/api/v1/demo/research-mutation', {
        method: 'POST',
        headers: apiHeaders(actorId, { json: true, mutation: true }),
        body: JSON.stringify({ mutation: 'eligibility-guidance-finding' }),
      });
      const payload = (await response.json()) as {
        mutation?: {
          applied: boolean;
          finding: string;
          memory: MemoryState;
          propagation: PropagationReceipt;
        };
        title?: string;
      };
      if (!response.ok || !payload.mutation)
        throw new Error(
          payload.title ?? 'The research finding could not be ingested.',
        );
      await ask(actorId, query);
      setMemory(payload.mutation.memory);
      setChangeReceipt({
        finding: payload.mutation.finding,
        propagation: payload.mutation.propagation,
      });
      setMutationMessage(
        payload.mutation.applied
          ? 'The source changed the checkpoint and formed a reviewable memory proposal.'
          : 'That source version already exists; no duplicate was created.',
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

  async function reviewSemanticProposal(
    proposalId: string,
    decision: 'approve' | 'reject',
  ) {
    setSemanticReviewLoading(proposalId);
    setMutationMessage(null);
    try {
      const response = await fetch(
        `/api/v1/ontology/proposals/${proposalId}/review`,
        {
          method: 'POST',
          headers: apiHeaders(actorId, { json: true, mutation: true }),
          body: JSON.stringify({ decision }),
        },
      );
      const payload = (await response.json()) as {
        evolution?: SemanticEvolutionState;
        title?: string;
      };
      if (!response.ok || !payload.evolution) {
        throw new Error(
          payload.title ?? 'The semantic proposal could not be reviewed.',
        );
      }
      setSemanticEvolution(payload.evolution);
      if (decision === 'approve') await ask(actorId, query);
      setMutationMessage(
        decision === 'approve'
          ? 'The additive semantic change is active in a new immutable ontology version.'
          : 'The semantic proposal was rejected; its evidence and audit trail were retained.',
      );
    } catch (requestError) {
      setMutationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Semantic review failed.',
      );
    } finally {
      setSemanticReviewLoading(null);
    }
  }

  async function reviewCandidate(
    candidateId: string,
    decision: 'accept' | 'dismiss',
  ) {
    setReviewLoading(candidateId);
    try {
      const response = await fetch(
        `/api/v1/hypotheses/candidates/monitored/${candidateId}/review`,
        {
          method: 'POST',
          headers: apiHeaders(actorId, { json: true, mutation: true }),
          body: JSON.stringify({ decision }),
        },
      );
      const payload = (await response.json()) as {
        hypotheses?: HypothesisSystemState;
        memory?: MemoryState;
        discovery?: DiscoveryState | null;
        title?: string;
      };
      if (!response.ok || !payload.hypotheses || !payload.memory) {
        throw new Error(
          payload.title ?? 'The memory proposal could not be reviewed.',
        );
      }
      setHypothesisSystem(payload.hypotheses);
      setMemory(payload.memory);
      setDiscovery(payload.discovery ?? null);
      setMutationMessage(
        decision === 'accept'
          ? 'The proposal is now a canonical, provenance-linked Hypothesis Resource.'
          : 'The proposal was dismissed; its evidence and audit trail were retained.',
      );
    } catch (requestError) {
      setMutationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Memory review failed.',
      );
    } finally {
      setReviewLoading(null);
    }
  }

  async function reviewDiscoveredHypothesis(
    candidateId: string,
    decision: 'accept' | 'dismiss',
  ) {
    setDiscoveryReviewLoading(candidateId);
    setMutationMessage(null);
    try {
      const response = await fetch(
        `/api/v1/hypotheses/candidates/discovered/${candidateId}/review`,
        {
          method: 'POST',
          headers: apiHeaders(actorId, { json: true, mutation: true }),
          body: JSON.stringify({ decision }),
        },
      );
      const payload = (await response.json()) as {
        hypotheses?: HypothesisSystemState;
        memory?: MemoryState;
        discovery?: DiscoveryState;
        title?: string;
      };
      if (
        !response.ok ||
        !payload.hypotheses ||
        !payload.memory ||
        !payload.discovery
      ) {
        throw new Error(
          payload.title ?? 'The discovered hypothesis could not be reviewed.',
        );
      }
      setHypothesisSystem(payload.hypotheses);
      setMemory(payload.memory);
      setDiscovery(payload.discovery);
      setMutationMessage(
        decision === 'accept'
          ? 'The discovery is now a governed Hypothesis Resource with its own continual monitor.'
          : 'The discovery was dismissed; its evidence and audit trail were retained.',
      );
    } catch (requestError) {
      setMutationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Discovery review failed.',
      );
    } finally {
      setDiscoveryReviewLoading(null);
    }
  }

  async function operateMonitor(
    operation: 'pause' | 'resume' | 'run-now' | 'mark-notifications-read',
  ) {
    setOperationLoading(operation);
    setMutationMessage(null);
    try {
      const response = await fetch('/api/v1/memory/operations', {
        method: 'POST',
        headers: apiHeaders(actorId, { json: true, mutation: true }),
        body: JSON.stringify({ operation }),
      });
      const payload = (await response.json()) as {
        memory?: MemoryState;
        title?: string;
      };
      if (!response.ok || !payload.memory) {
        throw new Error(payload.title ?? 'The monitor operation failed.');
      }
      setMemory(payload.memory);
      void loadHypothesisSystem(actorId);
      setMutationMessage(
        operation === 'run-now'
          ? 'The queued manual evaluation completed.'
          : operation === 'mark-notifications-read'
            ? 'Monitor notifications marked as read.'
            : `The monitor is now ${operation === 'pause' ? 'paused' : 'active'}.`,
      );
    } catch (requestError) {
      setMutationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'The monitor operation failed.',
      );
    } finally {
      setOperationLoading(null);
    }
  }

  async function operateDiscovery(operation: 'pause' | 'resume' | 'run-now') {
    setDiscoveryOperationLoading(operation);
    setMutationMessage(null);
    try {
      const response = await fetch('/api/v1/discovery/operations', {
        method: 'POST',
        headers: apiHeaders(actorId, { json: true, mutation: true }),
        body: JSON.stringify({ operation }),
      });
      const payload = (await response.json()) as {
        discovery?: DiscoveryState;
        title?: string;
      };
      if (!response.ok || !payload.discovery) {
        throw new Error(payload.title ?? 'The discovery operation failed.');
      }
      setDiscovery(payload.discovery);
      void loadHypothesisSystem(actorId);
      setMutationMessage(
        operation === 'run-now'
          ? 'The background discovery sweep completed without requiring a question.'
          : `Continual discovery is now ${operation === 'pause' ? 'paused' : 'active'}.`,
      );
    } catch (requestError) {
      setMutationMessage(
        requestError instanceof Error
          ? requestError.message
          : 'The discovery operation failed.',
      );
    } finally {
      setDiscoveryOperationLoading(null);
    }
  }

  async function signOut() {
    if (!session) return;
    const response = await fetch(session.authentication.logoutUrl, {
      method: 'POST',
      headers: apiHeaders(actorId, { mutation: true }),
    });
    if (response.ok) {
      router.push(`${session.authentication.loginUrl}?returnTo=%2F%23ask`);
      return;
    }
    setMutationMessage('Sign-out could not be completed.');
  }

  async function operateProjectMemory(
    input: ProjectMemoryOperation,
    successMessage: string,
  ) {
    setProjectOperationLoading(input.operation);
    setProjectOperationMessage(null);
    try {
      const response = await fetch('/api/v1/project-memory/operations', {
        method: 'POST',
        headers: apiHeaders(actorId, { json: true, mutation: true }),
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as {
        projectMemory?: ProjectMemoryState;
        title?: string;
      };
      if (!response.ok || !payload.projectMemory) {
        throw new Error(
          payload.title ?? 'The project-memory operation could not complete.',
        );
      }
      setProjectMemory(payload.projectMemory);
      setProjectOperationMessage(successMessage);
    } catch (operationError) {
      setProjectOperationMessage(
        operationError instanceof Error
          ? operationError.message
          : 'The project-memory operation failed.',
      );
    } finally {
      setProjectOperationLoading(null);
    }
  }

  const stages = result ? stagesFor(result, memory) : [];
  const selectedStage = stages.find((stage) => stage.id === stageId) ?? null;
  function openProjectPhase(phase: ExperiencePhase) {
    setExperiencePhase(phase);
    setProjectOperationMessage(null);
  }
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <i>N</i>
          <strong>Northstar Context</strong>
          <b aria-hidden="true" />
        </div>
        <nav className={styles.phaseNav} aria-label="Engagement phase">
          <button
            type="button"
            aria-current={experiencePhase === 'kickoff' ? 'page' : undefined}
            onClick={() => openProjectPhase('kickoff')}
          >
            <code>01</code> Kickoff
          </button>
          <button
            type="button"
            aria-current={experiencePhase === 'working' ? 'page' : undefined}
            onClick={() => openProjectPhase('working')}
          >
            <code>02</code> Working
          </button>
          <button
            type="button"
            aria-current={experiencePhase === 'debrief' ? 'page' : undefined}
            onClick={() => openProjectPhase('debrief')}
          >
            <code>03</code> Debrief
            {projectMemory ? (
              <span>
                {
                  projectMemory.memories.filter(
                    (memoryItem) => memoryItem.status === 'candidate',
                  ).length
                }
              </span>
            ) : null}
          </button>
        </nav>
      </header>
      <section className={styles.projectToolbar}>
        <span className={styles.projectBadge}>
          <Database />
          {projectMemory?.integration?.project.name ?? 'Atlas Onboarding'}
          <code>
            {experiencePhase === 'kickoff'
              ? 'new'
              : experiencePhase === 'debrief'
                ? 'closed'
                : 'in progress'}
          </code>
        </span>
        <div className={styles.topMeta}>
          {experiencePhase === 'working' && !authRequired ? (
            <button
              className={styles.simulateChange}
              type="button"
              disabled={mutationLoading}
              onClick={() => void learn()}
            >
              <RefreshCw />
              {mutationLoading ? 'Updating source…' : 'Simulate source change'}
            </button>
          ) : null}
          {!authRequired ? (
            <button
              className={styles.monitorLaunch}
              onClick={() => setStageId('monitor')}
            >
              <Bot /> Monitor
            </button>
          ) : null}
          {session?.actor.authenticationMode === 'session' ? (
            <div className={styles.signedInIdentity}>
              <span>
                <small className={styles.uiLabel}>Signed in</small>
                <strong>{session.actor.name}</strong>
              </span>
              <Button variant="outline" onClick={() => void signOut()}>
                Sign out <LogOut />
              </Button>
            </div>
          ) : (
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
          )}
        </div>
      </section>
      {experiencePhase === 'working' ? (
        <>
          <section className={styles.questionBar}>
            <Search aria-hidden="true" />
            <input
              aria-label="Question"
              disabled={authRequired}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void ask();
              }}
            />
            <Button
              disabled={loading || authRequired}
              onClick={() => void ask()}
            >
              {loading ? 'Tracing…' : 'Run question'}
              <Send />
            </Button>
          </section>
          <section
            className={styles.answerPipeline}
            aria-label="Answer operations"
          >
            <strong>THIS ANSWER</strong>
            {result
              ? [
                  [
                    '01',
                    'Scope',
                    `${result.accessProfile.sourceObjects} objects`,
                  ],
                  [
                    '02',
                    'Resolve',
                    `${result.interpretedQuery.entities.length} resources`,
                  ],
                  [
                    '03',
                    'Connect',
                    `${result.graph.edges.length} relationships`,
                  ],
                  ['04', 'Rank', `${result.evidence.length} items kept`],
                ].map(([step, label, value]) => (
                  <span key={step}>
                    <code>{step}</code>
                    {label}
                    <em>{value}</em>
                  </span>
                ))
              : null}
          </section>
        </>
      ) : (
        <section className={styles.phaseContextBar}>
          <code>memory-isolation-v1</code>
          <p>
            {experiencePhase === 'kickoff'
              ? 'Scope lattice, promotion matrix and row-level isolation enforced. Prior memory is matched without widening its boundary.'
              : 'Scope lattice, promotion matrix and row-level isolation enforced. Nothing shown here is memory until review completes.'}
          </p>
          <code>
            {experiencePhase === 'kickoff'
              ? `${projectMemory?.kickoff?.items.length ?? 0} readable · ${projectMemory?.memories.length ?? 0} evaluated`
              : `${projectMemory?.memories.filter((item) => item.status === 'candidate').length ?? 0} candidates · ${projectMemory?.memories.filter((item) => item.status === 'candidate').length ?? 0} awaiting review`}
          </code>
        </section>
      )}
      <div className={styles.workspace}>
        {authRequired ? (
          <div className={styles.authGate}>
            <ShieldCheck />
            <span>
              <small className={styles.uiLabel}>
                Production identity boundary
              </small>
              <strong>Sign in to enter the Context Brain</strong>
              <p>
                Your identity provider proves who you are. Workspace access and
                review capabilities are then resolved by this system.
              </p>
            </span>
            <a href="/api/v1/auth/login?returnTo=%2F%23ask">
              Sign in securely <LogIn />
            </a>
          </div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : !result ? (
          <div className={styles.loading}>
            <BrainCircuit />
            <span>
              <strong>Tracing the question</strong>
              <small>
                Permissions → resources → meaning → evidence → output
              </small>
            </span>
          </div>
        ) : experiencePhase === 'kickoff' ? (
          <KickoffPhase
            state={projectMemory}
            busy={projectOperationLoading}
            message={projectOperationMessage}
            onGenerate={() =>
              void operateProjectMemory(
                { operation: 'generate-kickoff' },
                'Kickoff refreshed from the current approved memory boundary.',
              )
            }
          />
        ) : experiencePhase === 'debrief' ? (
          <DebriefPhase
            state={projectMemory}
            busy={projectOperationLoading}
            message={projectOperationMessage}
            onCapture={(input) =>
              void operateProjectMemory(
                { operation: 'capture-debrief', ...input },
                'Debrief retained as a reviewable project-memory candidate.',
              )
            }
            onReview={(memoryItem, decision, note, correctedStatement) =>
              void operateProjectMemory(
                {
                  operation: 'review',
                  memoryId: memoryItem.id,
                  decision,
                  note,
                  ...(decision === 'correct' ? { correctedStatement } : {}),
                },
                decision === 'approve'
                  ? 'Memory approved for future project use.'
                  : decision === 'reject'
                    ? 'Candidate rejected and retained in the audit history.'
                    : 'Correction approved; the prior record was superseded.',
              )
            }
          />
        ) : (
          <>
            <OutputCard
              result={result}
              answer={answer}
              onEvidence={() => setEvidenceOpen(true)}
            />
            <TraceCard
              result={result}
              memory={memory}
              projectMemory={projectMemory}
              onInputs={() => setSourceJourneyOpen(true)}
              onStage={setStageId}
              onEvidence={() => setEvidenceOpen(true)}
              onProjectMemory={() => openProjectPhase('kickoff')}
            />
          </>
        )}
      </div>
      {selectedStage && selectedStage.id !== 'monitor' ? (
        <StageDrawer
          stage={selectedStage}
          semanticEvolution={semanticEvolution}
          canReviewSemantic={
            session?.actor.authenticationMode === 'session'
              ? session.actor.capabilities.includes('ontology.review')
              : actorId === PERSONAS[0].id
          }
          semanticReviewLoading={semanticReviewLoading}
          onSemanticReview={(proposalId, decision) =>
            void reviewSemanticProposal(proposalId, decision)
          }
          onClose={() => setStageId(null)}
        />
      ) : null}
      {stageId === 'monitor' ? (
        <MemoryDrawer
          memory={memory}
          discovery={discovery}
          hypothesisSystem={hypothesisSystem}
          canReview={
            session?.actor.authenticationMode === 'session'
              ? session.actor.capabilities.includes('hypothesis.review')
              : actorId === PERSONAS[0].id
          }
          canOperate={
            session?.actor.authenticationMode === 'session'
              ? session.actor.capabilities.includes('monitor.operate')
              : actorId === PERSONAS[0].id
          }
          reviewLoading={reviewLoading}
          discoveryReviewLoading={discoveryReviewLoading}
          discoveryOperationLoading={discoveryOperationLoading}
          operationLoading={operationLoading}
          onReview={(candidateId, decision) =>
            void reviewCandidate(candidateId, decision)
          }
          onDiscoveryReview={(candidateId, decision) =>
            void reviewDiscoveredHypothesis(candidateId, decision)
          }
          onDiscoveryOperate={(operation) => void operateDiscovery(operation)}
          onOperate={(operation) => void operateMonitor(operation)}
          onClose={() => setStageId(null)}
        />
      ) : null}
      {result && evidenceOpen ? (
        <EvidenceDrawer
          result={result}
          onClose={() => setEvidenceOpen(false)}
        />
      ) : null}
      {result && projectMemory && sourceJourneyOpen ? (
        <SourceJourneyDrawer
          result={result}
          projectMemory={projectMemory}
          onClose={() => setSourceJourneyOpen(false)}
        />
      ) : null}
      {changeReceipt ? (
        <ChangePropagationDrawer
          receipt={changeReceipt.propagation}
          finding={changeReceipt.finding}
          onClose={() => setChangeReceipt(null)}
        />
      ) : null}
    </main>
  );
}
