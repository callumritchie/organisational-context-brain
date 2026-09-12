'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  KeyRound,
  Layers3,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
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
import {
  DEMO_RANKING_V3,
  type RankingFactor,
} from '@/src/modules/ranking/demo-ranking-v3';
import styles from './context-workspace.module.css';

const PRESET =
  "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const RANKING_FACTORS = Object.keys(DEMO_RANKING_V3.weights) as RankingFactor[];

type StageId =
  | 'scope'
  | 'identity'
  | 'meaning'
  | 'graph'
  | 'retrieval'
  | 'assessment'
  | 'monitor';

interface FlowStage {
  id: StageId;
  step: number | null;
  label: string;
  layer: string;
  status: 'built' | 'planned';
  summary: string;
  why: string;
  input: string;
  output: string;
  metric: string;
  requirement: string;
  example?: string;
}

function stagesFor(result: ContextResponse): FlowStage[] {
  const entityNames = result.interpretedQuery.entities
    .map((entity) => entity.name)
    .join(', ');
  return [
    {
      id: 'scope',
      step: 1,
      label: 'Limit access',
      layer: 'Permission boundary',
      status: 'built',
      summary: `${result.actor.name} was allowed to search ${result.accessProfile.sourceObjects} source objects across ${result.accessProfile.projects.length} projects. Inaccessible objects were excluded before search began.`,
      why: 'If filtering happens later, restricted titles, snippets or scores can leak into traces and AI prompts.',
      input: `${result.actor.name} · ${result.actor.role}`,
      output: `${result.accessProfile.sourceObjects} eligible source objects`,
      metric: 'Enforced before retrieval',
      requirement:
        'All permission-sensitive reads shall execute inside an actor-scoped database transaction before candidate retrieval.',
      example: `${result.accessProfile.projects.join(' · ')} only`,
    },
    {
      id: 'identity',
      step: 2,
      label: 'Resolve identity',
      layer: 'Canonical resources',
      status: 'built',
      summary: `Source IDs and aliases in the question resolved to ${result.interpretedQuery.entities.length} stable organisational resources: ${entityNames}.`,
      why: 'The same client or project appears under different names in different systems. Reasoning fails if those records remain disconnected.',
      input: 'Question terms + source identities + aliases',
      output: entityNames,
      metric: `${result.interpretedQuery.entities.length} resources resolved`,
      requirement:
        'Every entity or content object shall resolve to one canonical Resource while retaining its source identities and provenance.',
      example: '“Atlas Bank” → canonical Client',
    },
    {
      id: 'meaning',
      step: 3,
      label: 'Apply meaning',
      layer: 'Semantic layer',
      status: 'built',
      summary: `${result.ontology.version} classified the resolved resources and allowed only valid relationship types, using ${result.ontology.resourceTypes.length} concepts and ${result.ontology.relationships.length} relationship rules.`,
      why: 'Similarity can find related words. Shared meaning tells the system what each thing is and which connections are legitimate.',
      input: 'Canonical resources + source-backed assertions',
      output: 'Typed resources + valid relationship candidates',
      metric: `${result.ontology.resourceTypes.length} concepts · ${result.ontology.relationships.length} rules`,
      requirement:
        'Semantic mappings shall use an immutable ontology version and record whether each assertion is source-backed, rule-derived or AI-inferred.',
      example: 'Evidence — SUPPORTS → Hypothesis',
    },
    {
      id: 'graph',
      step: 4,
      label: 'Follow connections',
      layer: 'Knowledge graph',
      status: 'built',
      summary: `The system traversed ${result.graph.edges.length} visible connections between evidence, people, projects and hypotheses to recover context that did not share the question’s vocabulary.`,
      why: 'Important context often sits one or two organisational relationships away from the words in a question.',
      input: 'Typed resources + visible establishing assertions',
      output: `${result.relationships.length} question-relevant relationships`,
      metric: `${result.graph.nodes.length} nodes · ${result.graph.edges.length} edges`,
      requirement:
        'A graph edge shall be visible only when at least one assertion establishing that edge is visible to the current actor.',
      example: 'Project ← BELONGS_TO — Research note',
    },
    {
      id: 'retrieval',
      step: 5,
      label: 'Find evidence',
      layer: 'Retrieval + ranking',
      status: 'built',
      summary: `${result.retrieval.mode} retrieval combined lexical, semantic and graph candidates, then ranked ${result.evidence.length} permitted items using authority, freshness, confidence and project affinity.`,
      why: 'The most similar passage is not always the most useful or trustworthy organisational evidence.',
      input: 'Lexical + vector + graph + structured candidates',
      output: `${result.evidence.length} ranked, permitted evidence items`,
      metric: result.rankingVersion,
      requirement:
        'Every ranking contribution shall be inspectable per evidence item and ranking configurations shall be versioned.',
      example: 'Fusion + authority + freshness + affinity',
    },
    {
      id: 'assessment',
      step: 6,
      label: 'Assess reliability',
      layer: 'Evidence assessment',
      status: 'built',
      summary:
        result.epistemicState.status === 'contested'
          ? `The system found ${result.epistemicState.supportingEvidence} supporting items and ${result.epistemicState.contradictingEvidence} item that challenges a single-cause explanation. It therefore marked this answer “Cautious” and kept both findings visible.`
          : `The system found ${result.epistemicState.supportingEvidence} supporting items and no visible contradiction. It therefore marked this answer “Supported”.`,
      why: 'A trustworthy organisational brain must preserve disagreement instead of flattening conflicting observations into false certainty.',
      input: 'Ranked evidence + SUPPORTS / CONTRADICTS assertions',
      output:
        result.epistemicState.status === 'contested' ? 'Cautious' : 'Supported',
      metric: `${result.epistemicState.supportingEvidence} support · ${result.epistemicState.contradictingEvidence} challenge`,
      requirement:
        'Context responses shall distinguish supported, contested and insufficient evidence states while keeping contradictory evidence attributable.',
      example: 'Both findings remain visible; neither is overwritten',
    },
    {
      id: 'monitor',
      step: null,
      label: 'Background monitor',
      layer: 'Planned agent capability',
      status: 'planned',
      summary:
        'A future background agent would monitor the durable hypothesis behind this question, run the same permissioned pipeline when source versions change, and propose a reviewed update.',
      why: 'The context should improve between human questions, but continuous agents need explicit scope, cadence, ownership and stop conditions.',
      input: 'Durable hypothesis + service identity + monitor policy',
      output: 'Reviewable change proposal or targeted notification',
      metric: 'Not running in this prototype',
      requirement:
        'Every monitor shall declare an owner, cadence, permitted scope, materiality threshold, notification policy and stop conditions.',
      example: 'Source change → reassess hypothesis → request review',
    },
  ];
}

function shortAnswer(
  answer: AnswerResponse['answer'] | null,
  result: ContextResponse,
) {
  if (answer?.mode === 'provider' && answer.claims.length) {
    return answer.claims.slice(0, 2);
  }
  return [{ text: answer?.text ?? result.summary, evidenceIds: [] }];
}

function StageInspector({ stage }: { stage: FlowStage }) {
  const [copied, setCopied] = useState(false);
  async function copyRequirement() {
    await navigator.clipboard.writeText(stage.requirement);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <aside className={styles.inspector} aria-label="Selected processing step">
      <header>
        <div>
          <span>{stage.layer}</span>
          <h3>{stage.label}</h3>
        </div>
        <b className={stage.status === 'built' ? styles.built : styles.planned}>
          {stage.status === 'built' ? 'Working now' : 'Not built'}
        </b>
      </header>
      <section className={styles.stageSummary}>
        <span>What happened for this question</span>
        <p>{stage.summary}</p>
      </section>
      <div className={styles.contract}>
        <div>
          <span>Input</span>
          <strong>{stage.input}</strong>
        </div>
        <ArrowRight />
        <div>
          <span>Output</span>
          <strong>{stage.output}</strong>
        </div>
      </div>
      {stage.example ? (
        <div className={styles.stageExample}>
          <CircleDot />
          <span>{stage.example}</span>
        </div>
      ) : null}
      <section className={styles.rationale}>
        <span>Why the product needs this</span>
        <p>{stage.why}</p>
      </section>
      <section className={styles.requirement}>
        <header>
          <span>Requirement seed</span>
          <button type="button" onClick={() => void copyRequirement()}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </header>
        <p>{stage.requirement}</p>
      </section>
    </aside>
  );
}

function EvidenceDrawer({
  result,
  initialIndex,
  onClose,
}: {
  result: ContextResponse;
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = result.evidence[index]!;
  return (
    <div className={styles.drawerBackdrop} onMouseDown={onClose}>
      <section
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Evidence used for this answer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Progressive detail · this question only</span>
            <h2>Evidence used for this answer</h2>
          </div>
          <button type="button" aria-label="Close evidence" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className={styles.drawerGrid}>
          <nav aria-label="Evidence items">
            {result.evidence.map((evidence, evidenceIndex) => (
              <button
                key={evidence.id}
                type="button"
                className={evidenceIndex === index ? styles.activeEvidence : ''}
                onClick={() => setIndex(evidenceIndex)}
              >
                <i>{evidenceIndex + 1}</i>
                <span>
                  <strong>{evidence.title}</strong>
                  <small>{evidence.source.title}</small>
                </span>
                <b>
                  {evidence.stance === 'SUPPORTS' ? 'Supports' : 'Challenges'}
                </b>
                <ChevronRight />
              </button>
            ))}
          </nav>
          <article className={styles.evidenceDetail}>
            <header>
              <span
                className={
                  item.stance === 'SUPPORTS'
                    ? styles.supports
                    : styles.challenges
                }
              >
                {item.stance === 'SUPPORTS'
                  ? 'Supports the view'
                  : 'Challenges the view'}
              </span>
              <strong>{Math.round(item.confidence * 100)}% confidence</strong>
            </header>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <blockquote>
              <FileSearch />
              <div>
                <strong>{item.source.title}</strong>
                <p>{item.source.excerpt}</p>
                <code>{item.source.uri}</code>
              </div>
            </blockquote>
            <section className={styles.ranking}>
              <span>Why this ranked here</span>
              {RANKING_FACTORS.map((factor) => {
                const value = item.ranking[factor];
                return (
                  <div key={factor}>
                    <small>{factor.replace(/([a-z])([A-Z])/g, '$1 $2')}</small>
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
              <span>Assertion</span>
              <code>{item.provenance.assertionId}</code>
              <span>Process</span>
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

function ResponsePanel({
  result,
  answer,
  onEvidence,
}: {
  result: ContextResponse;
  answer: AnswerResponse['answer'] | null;
  onEvidence: () => void;
}) {
  const contested = result.epistemicState.status === 'contested';
  const claims = shortAnswer(answer, result);
  return (
    <section className={styles.responsePanel}>
      <header className={styles.responseHeader}>
        <div>
          <i>1</i>
          <span>
            <small>Response to the question above</small>
            <strong>The organisational answer</strong>
          </span>
        </div>
        <span className={styles.answerMode}>
          <CircleDot />
          {answer?.mode === 'provider'
            ? `Grounded by ${answer.provider}`
            : 'Evidence-led, deterministic'}
        </span>
      </header>
      <div className={styles.responseBody}>
        <article className={styles.answerText}>
          <span>Answer</span>
          {claims.map((claim, claimIndex) => (
            <p key={`${claim.text}-${claimIndex}`}>
              {claim.text}
              {claim.evidenceIds.map((evidenceId) => {
                const evidenceIndex = result.evidence.findIndex(
                  (evidence) => evidence.id === evidenceId,
                );
                return evidenceIndex >= 0 ? (
                  <button
                    key={evidenceId}
                    type="button"
                    onClick={onEvidence}
                    aria-label={`Open evidence ${evidenceIndex + 1}`}
                  >
                    [{evidenceIndex + 1}]
                  </button>
                ) : null;
              })}
            </p>
          ))}
        </article>
        <article className={styles.reliability}>
          <span>How reliable is this answer?</span>
          <strong>{contested ? 'Cautious' : 'Supported'}</strong>
          <p>
            {contested
              ? 'Visible evidence disagrees about whether there is one main cause.'
              : 'The visible evidence supports the current explanation.'}
          </p>
          <div>
            <b>{result.epistemicState.supportingEvidence} support</b>
            <b>{result.epistemicState.contradictingEvidence} challenge</b>
          </div>
          <button type="button" onClick={onEvidence}>
            Inspect {result.evidence.length} evidence items
            <ChevronRight />
          </button>
        </article>
        <article className={styles.recommendation}>
          <header>
            <Sparkles />
            <span>
              <small>Part of this response</small>
              <strong>Suggested next action</strong>
            </span>
          </header>
          <p>
            {contested
              ? 'Separate the competing explanations before scaling a fix.'
              : 'Start with the document-check hand-off, then test clearer guidance.'}
          </p>
          <small>
            System inference from the visible evidence—not a source fact.
          </small>
        </article>
      </div>
    </section>
  );
}

function ProcessPanel({
  result,
  selected,
  setSelected,
  mutationLoading,
  mutationMessage,
  learn,
}: {
  result: ContextResponse;
  selected: StageId;
  setSelected: (stage: StageId) => void;
  mutationLoading: boolean;
  mutationMessage: string | null;
  learn: () => void;
}) {
  const stages = useMemo(() => stagesFor(result), [result]);
  const runStages = stages.filter((stage) => stage.step !== null);
  const selectedStage =
    stages.find((stage) => stage.id === selected) ?? stages[5]!;
  const contested = result.epistemicState.status === 'contested';
  return (
    <section className={styles.processPanel}>
      <header className={styles.processHeader}>
        <div>
          <i>2</i>
          <span>
            <small>Explanation of the response above</small>
            <strong>How the system produced this exact answer</strong>
          </span>
        </div>
        <p>
          Every node below ran for this question. Select one to inspect its
          rationale and technical contract.
        </p>
      </header>
      <div className={styles.processBody}>
        <div className={styles.systemStory}>
          <div className={styles.sourceRoute}>
            <div>
              <span>Outside the brain</span>
              <strong>{result.sourceSystems.length} source systems</strong>
            </div>
            <div className={styles.sourceChips}>
              {result.sourceSystems.map((source) => (
                <span key={source.id} title={source.name}>
                  <Database />
                  {source.type.replace('-repository', '')}
                </span>
              ))}
            </div>
            <ArrowRight />
            <div className={styles.boundaryLabel}>
              <BrainCircuit />
              <span>
                <small>Inside our system</small>
                <strong>Context Brain</strong>
              </span>
            </div>
          </div>
          <div className={styles.brainBoundary}>
            <div className={styles.flowTrack}>
              {runStages.map((stage, index) => (
                <div className={styles.flowItem} key={stage.id}>
                  <button
                    type="button"
                    className={selected === stage.id ? styles.activeStage : ''}
                    onClick={() => setSelected(stage.id)}
                  >
                    <i>{stage.step}</i>
                    <span>
                      <strong>{stage.label}</strong>
                      <small>{stage.metric}</small>
                    </span>
                  </button>
                  {index < runStages.length - 1 ? <ArrowRight /> : null}
                </div>
              ))}
            </div>
            <div className={styles.controlRail}>
              <ShieldCheck />
              <span>
                <small>Controls applied across the whole run</small>
                <strong>Permission-safe · attributable · versioned</strong>
              </span>
              <button type="button" onClick={() => setSelected('scope')}>
                <KeyRound /> Access
              </button>
              <button type="button" onClick={() => setSelected('meaning')}>
                <Layers3 /> Shared meaning
              </button>
              <button type="button" onClick={() => setSelected('retrieval')}>
                <Search /> Provenance
              </button>
            </div>
          </div>
          <div className={styles.compoundingLoop}>
            <div className={styles.loopTitle}>
              <GitBranch />
              <span>
                <small>How this compounds beyond one answer</small>
                <strong>
                  The hypothesis and evidence history persist after this run
                </strong>
              </span>
            </div>
            <div className={styles.loopFlow}>
              <span>
                <UserRound /> Human asks
              </span>
              <ArrowRight />
              <span>
                <BrainCircuit /> Context updates
              </span>
              <ArrowRight />
              <button type="button" onClick={() => setSelected('monitor')}>
                <Bot /> Background monitor
                <b>planned</b>
              </button>
              <ArrowRight />
              <span>
                <RefreshCw /> Same pipeline reruns
              </span>
            </div>
            <div className={styles.changeDemo}>
              {contested ? (
                <p>
                  <Check />
                  <span>
                    <strong>This demo change has happened:</strong> new research
                    challenged the single-cause view, so this same question was
                    reassessed as “Cautious”.
                  </span>
                </p>
              ) : (
                <p>
                  <Sparkles />
                  <span>
                    Add one synthetic research finding, then rerun this same
                    question to see the answer and evidence state change.
                  </span>
                </p>
              )}
              {!contested ? (
                <Button
                  variant="outline"
                  disabled={mutationLoading}
                  onClick={learn}
                >
                  {mutationLoading ? 'Adding research…' : 'Run the change demo'}
                </Button>
              ) : null}
              {mutationMessage ? <small>{mutationMessage}</small> : null}
            </div>
          </div>
        </div>
        <StageInspector stage={selectedStage} />
      </div>
    </section>
  );
}

export function ContextWorkspace() {
  const [query, setQuery] = useState(PRESET);
  const [actorId, setActorId] = useState<string>(PERSONAS[0].id);
  const [result, setResult] = useState<ContextResponse | null>(null);
  const [answer, setAnswer] = useState<AnswerResponse['answer'] | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageId>('assessment');
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
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
      setSelectedStage('assessment');
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
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <BrainCircuit />
          <span>
            <small>Northstar Labs</small>
            <strong>Organisational Context Brain</strong>
          </span>
        </div>
        <div className={styles.runContext}>
          <span>
            <i /> {healthyCount} sources healthy
          </span>
          {result ? (
            <span>
              Trace {result.traceId.slice(0, 8)} · {result.ontology.version}
            </span>
          ) : null}
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
          <span>This entire screen traces one question</span>
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
          {loading ? 'Building context…' : 'Ask again'}
          <Send />
        </Button>
      </section>
      <div className={styles.workspace}>
        {error ? <div className={styles.error}>{error}</div> : null}
        {!result ? (
          <div className={styles.loading}>
            <BrainCircuit />
            <span>
              <strong>Tracing the question through the Context Brain</strong>
              <small>
                Applying permissions, shared meaning, graph connections and
                evidence assessment…
              </small>
            </span>
          </div>
        ) : (
          <>
            <ResponsePanel
              result={result}
              answer={answer}
              onEvidence={() => setEvidenceIndex(0)}
            />
            <ProcessPanel
              result={result}
              selected={selectedStage}
              setSelected={setSelectedStage}
              mutationLoading={mutationLoading}
              mutationMessage={mutationMessage}
              learn={() => void learn()}
            />
          </>
        )}
      </div>
      {result && evidenceIndex !== null ? (
        <EvidenceDrawer
          result={result}
          initialIndex={evidenceIndex}
          onClose={() => setEvidenceIndex(null)}
        />
      ) : null}
    </main>
  );
}
