'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
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
  RefreshCw,
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
import type { MemoryState } from '@/src/modules/memory/types';
import {
  DEMO_RANKING_V3,
  type RankingFactor,
} from '@/src/modules/ranking/demo-ranking-v3';
import styles from './context-story.module.css';

const PRESET =
  "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const RANKING_FACTORS = Object.keys(DEMO_RANKING_V3.weights) as RankingFactor[];

type StageId = 'scope' | 'identity' | 'meaning' | 'evidence' | 'monitor';

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
      ],
      summary: `The versioned ontology classified the resources, then the graph followed ${result.graph.edges.length} actor-visible connections between projects, evidence, people and hypotheses.`,
      why: 'Similarity finds related words. A semantic model explains what each object is, which relationships are valid, and how context connects across systems.',
      input: `Assertions { resources: ${result.graph.nodes.length}, ontology: "${result.ontology.version}" }`,
      output: `SemanticGraph { types: ${result.ontology.resourceTypes.length}, relationship_rules: ${result.ontology.relationships.length}, visible_edges: ${result.graph.edges.length} }`,
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
  onClose,
}: {
  stage: StoryStage;
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

function MemoryDrawer({
  memory,
  discovery,
  canReview,
  reviewLoading,
  discoveryReviewLoading,
  operationLoading,
  onReview,
  onDiscoveryReview,
  onOperate,
  onClose,
}: {
  memory: MemoryState | null;
  discovery: DiscoveryState | null;
  canReview: boolean;
  reviewLoading: string | null;
  discoveryReviewLoading: string | null;
  operationLoading: string | null;
  onReview: (candidateId: string, decision: 'accept' | 'dismiss') => void;
  onDiscoveryReview: (
    candidateId: string,
    decision: 'accept' | 'dismiss',
  ) => void;
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
              <code>
                {discovery?.latestRun
                  ? `${discovery.latestRun.documentsScanned} inputs · ${discovery.latestRun.sourceSystemsScanned} systems · ${discovery.latestRun.selectedRoute}`
                  : 'discovery not initialised'}
              </code>
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
                  disabled={!canReview || operationLoading !== null}
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
                    !canReview ||
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
                    disabled={!canReview || operationLoading !== null}
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
    <section className={styles.outputCard}>
      <header>
        <div>
          <span className={styles.dataLabel}>OUTPUT · ANSWER_RESPONSE</span>
          <h2>The organisational answer</h2>
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
      <article className={styles.outputField}>
        <header>
          <span className={styles.dataLabel}>OUTPUT FIELD · RELIABILITY</span>
          <code>state=&quot;{cautious ? 'cautious' : 'supported'}&quot;</code>
        </header>
        <strong>
          {cautious
            ? 'Use this answer cautiously'
            : 'Supported by current evidence'}
        </strong>
        <p>
          {cautious
            ? `${result.epistemicState.supportingEvidence} items support the explanation; ${result.epistemicState.contradictingEvidence} challenges a single-cause view.`
            : `${result.epistemicState.supportingEvidence} visible items support the explanation and none challenges it.`}
        </p>
      </article>
      <article className={styles.inferenceField}>
        <header>
          <Sparkles />
          <div>
            <span className={styles.dataLabel}>
              OUTPUT FIELD · SUGGESTED_ACTION
            </span>
            <strong>Included in this response</strong>
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
  onStage,
  mutationLoading,
  mutationMessage,
  learn,
}: {
  result: ContextResponse;
  memory: MemoryState | null;
  onStage: (stage: StageId) => void;
  mutationLoading: boolean;
  mutationMessage: string | null;
  learn: () => void;
}) {
  const stages = useMemo(() => stagesFor(result, memory), [result, memory]);
  const operations = stages.filter((stage) => stage.step !== null);
  const cautious = result.epistemicState.status === 'contested';
  return (
    <section className={styles.traceCard}>
      <header>
        <div>
          <span className={styles.dataLabel}>TRACE · ANSWER_RESPONSE</span>
          <h2>How this output was produced</h2>
        </div>
        <p>
          Select an operation for its rationale, input, output and requirement.
        </p>
      </header>
      <div className={styles.traceBody}>
        <section className={styles.inputSet}>
          <div>
            <span className={styles.dataLabel}>INPUT SET · SOURCE_OBJECTS</span>
            <strong>Lives outside the Context Brain</strong>
          </div>
          <div className={styles.inputFiles}>
            {result.sourceSystems.slice(0, 4).map((source) => (
              <code key={source.id} title={source.name}>
                <Database />
                {source.type}
              </code>
            ))}
            <code>+{Math.max(0, result.sourceSystems.length - 4)} more</code>
          </div>
        </section>
        <ArrowDown className={styles.downArrow} />
        <section className={styles.brainBox}>
          <header>
            <BrainCircuit />
            <div>
              <span className={styles.uiLabel}>System boundary</span>
              <strong>Context Brain</strong>
            </div>
            <code>operations=4</code>
          </header>
          <div className={styles.operations}>
            {operations.map((stage, index) => (
              <div key={stage.id} className={styles.operationRow}>
                <button type="button" onClick={() => onStage(stage.id)}>
                  <i>{String(stage.step).padStart(2, '0')}</i>
                  <span>
                    <small className={styles.uiLabel}>Operation</small>
                    <strong>{stage.operation}</strong>
                  </span>
                  <div>
                    {stage.runtime.map((value) => (
                      <code key={value}>{value}</code>
                    ))}
                  </div>
                  <ChevronRight />
                </button>
                {index < operations.length - 1 ? <ArrowDown /> : null}
              </div>
            ))}
          </div>
          <footer>
            <ShieldCheck />
            <span>
              <small className={styles.uiLabel}>Cross-cutting controls</small>
              <strong>Permissions · provenance · versioned meaning</strong>
            </span>
          </footer>
        </section>
        <div className={styles.outputLink}>
          <ArrowLeft />
          <span>
            <small className={styles.uiLabel}>Produces</small>
            <strong>OUTPUT shown on the left</strong>
          </span>
        </div>
        <section className={styles.persistedState}>
          <header>
            <GitBranch />
            <div>
              <span className={styles.dataLabel}>PERSISTED AFTER THIS RUN</span>
              <strong>Context compounds instead of disappearing</strong>
            </div>
          </header>
          <div>
            <code>hypothesis=identity_verification_driver</code>
            <code>
              checkpoint_evidence=
              {memory?.checkpoint?.evidenceCount ?? result.evidence.length}
            </code>
            <code>memory_proposals={memory?.candidates.length ?? 0}</code>
          </div>
          <button type="button" onClick={() => onStage('monitor')}>
            <Bot />
            <span>
              <small className={styles.uiLabel}>
                Working background capability
              </small>
              <strong>Open continual hypothesis + memory loop</strong>
            </span>
            <b className={memory?.configured ? styles.liveState : ''}>
              {memory?.configured
                ? displayMonitorStatus(memory.policy?.status)
                : 'Setup required'}
            </b>
            <ChevronRight />
          </button>
          {cautious ? (
            <p>
              <RefreshCw />
              <span>
                <code>research/eligibility-followup-009</code> changed this
                output to <code>reliability=cautious</code>.
              </span>
            </p>
          ) : (
            <div className={styles.changeDemo}>
              <span>
                Add one synthetic research file and rerun this exact trace.
              </span>
              <Button
                variant="outline"
                disabled={mutationLoading}
                onClick={learn}
              >
                {mutationLoading ? 'Adding file…' : 'Run change demo'}
              </Button>
            </div>
          )}
          {mutationMessage ? <small>{mutationMessage}</small> : null}
        </section>
      </div>
    </section>
  );
}

export function ContextStory() {
  const [query, setQuery] = useState(PRESET);
  const [actorId, setActorId] = useState<string>(PERSONAS[0].id);
  const [result, setResult] = useState<ContextResponse | null>(null);
  const [answer, setAnswer] = useState<AnswerResponse['answer'] | null>(null);
  const [memory, setMemory] = useState<MemoryState | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryState | null>(null);
  const [stageId, setStageId] = useState<StageId | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const [discoveryReviewLoading, setDiscoveryReviewLoading] = useState<
    string | null
  >(null);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  const loadMemory = useCallback(async (nextActorId: string) => {
    const response = await fetch('/api/v1/memory', {
      headers: { 'x-demo-actor': nextActorId },
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { memory: MemoryState };
    setMemory(payload.memory);
  }, []);

  const loadDiscovery = useCallback(async (nextActorId: string) => {
    const response = await fetch('/api/v1/discovery', {
      headers: { 'x-demo-actor': nextActorId },
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      discovery: DiscoveryState | null;
    };
    setDiscovery(payload.discovery);
  }, []);

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
        void loadMemory(nextActorId);
        void loadDiscovery(nextActorId);
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
    [actorId, loadDiscovery, loadMemory, query],
  );

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
    setDiscovery(null);
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
        mutation?: { applied: boolean; finding: string; memory: MemoryState };
        title?: string;
      };
      if (!response.ok || !payload.mutation)
        throw new Error(
          payload.title ?? 'The research finding could not be ingested.',
        );
      await ask(actorId, query);
      setMemory(payload.mutation.memory);
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

  async function reviewCandidate(
    candidateId: string,
    decision: 'accept' | 'dismiss',
  ) {
    setReviewLoading(candidateId);
    try {
      const response = await fetch(
        `/api/v1/memory/candidates/${candidateId}/review`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-demo-actor': actorId,
          },
          body: JSON.stringify({ decision }),
        },
      );
      const payload = (await response.json()) as {
        memory?: MemoryState;
        title?: string;
      };
      if (!response.ok || !payload.memory) {
        throw new Error(
          payload.title ?? 'The memory proposal could not be reviewed.',
        );
      }
      setMemory(payload.memory);
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
        `/api/v1/discovery/candidates/${candidateId}/review`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-demo-actor': actorId,
          },
          body: JSON.stringify({ decision }),
        },
      );
      const payload = (await response.json()) as {
        discovery?: DiscoveryState;
        title?: string;
      };
      if (!response.ok || !payload.discovery) {
        throw new Error(
          payload.title ?? 'The discovered hypothesis could not be reviewed.',
        );
      }
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
        headers: {
          'content-type': 'application/json',
          'x-demo-actor': actorId,
        },
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

  const stages = result ? stagesFor(result, memory) : [];
  const selectedStage = stages.find((stage) => stage.id === stageId) ?? null;
  const healthyCount =
    result?.sourceSystems.filter((source) => source.status === 'healthy')
      .length ?? 5;
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <BrainCircuit />
          <span>
            <small className={styles.uiLabel}>Northstar Labs</small>
            <strong>Organisational Context Brain</strong>
          </span>
        </div>
        <div className={styles.topMeta}>
          <code>sources_healthy={healthyCount}</code>
          {result ? <code>trace={result.traceId.slice(0, 8)}</code> : null}
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
      <section className={styles.questionBar}>
        <div>
          <span className={styles.dataLabel}>INPUT · QUESTION</span>
          <UserRound />
        </div>
        <input
          aria-label="Question"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void ask();
          }}
        />
        <Button disabled={loading} onClick={() => void ask()}>
          {loading ? 'Tracing…' : 'Run question'}
          <Send />
        </Button>
      </section>
      <div className={styles.workspace}>
        {error ? <div className={styles.error}>{error}</div> : null}
        {!result ? (
          <div className={styles.loading}>
            <BrainCircuit />
            <span>
              <strong>Tracing the question</strong>
              <small>
                Permissions → resources → meaning → evidence → output
              </small>
            </span>
          </div>
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
              onStage={setStageId}
              mutationLoading={mutationLoading}
              mutationMessage={mutationMessage}
              learn={() => void learn()}
            />
          </>
        )}
      </div>
      {selectedStage && selectedStage.id !== 'monitor' ? (
        <StageDrawer stage={selectedStage} onClose={() => setStageId(null)} />
      ) : null}
      {stageId === 'monitor' ? (
        <MemoryDrawer
          memory={memory}
          discovery={discovery}
          canReview={actorId === PERSONAS[0].id}
          reviewLoading={reviewLoading}
          discoveryReviewLoading={discoveryReviewLoading}
          operationLoading={operationLoading}
          onReview={(candidateId, decision) =>
            void reviewCandidate(candidateId, decision)
          }
          onDiscoveryReview={(candidateId, decision) =>
            void reviewDiscoveredHypothesis(candidateId, decision)
          }
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
    </main>
  );
}
