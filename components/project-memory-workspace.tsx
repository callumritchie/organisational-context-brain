'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Database,
  FileText,
  FolderKanban,
  MessagesSquare,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type {
  ProjectMemoryState,
  ProjectMemoryView,
} from '@/src/modules/organisational-memory/types';
import styles from './project-memory-workspace.module.css';

function browserCookie(...names: string[]) {
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!names.includes(name)) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

function operationHeaders(actorId: string) {
  const csrf = browserCookie('__Host-org_brain_csrf', 'org_brain_csrf');
  return {
    'content-type': 'application/json',
    'x-demo-actor': actorId,
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
  };
}

function titleCase(value: string) {
  return value
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function locatorLabel(locator: {
  modality: string;
  page?: number;
  row?: number;
  sheet?: string;
  segmentId?: string;
  startMs?: number;
  endMs?: number;
  regionId?: string;
}) {
  if (locator.modality === 'document') return `page ${locator.page}`;
  if (locator.modality === 'table')
    return `${locator.sheet} · row ${locator.row}`;
  if (locator.modality === 'transcript') {
    return `${locator.segmentId} · ${Math.round((locator.startMs ?? 0) / 1_000)}–${Math.round((locator.endMs ?? 0) / 1_000)}s`;
  }
  return `region ${locator.regionId}`;
}

interface Props {
  actorId: string;
  state: ProjectMemoryState | null;
  onStateChange: (state: ProjectMemoryState) => void;
  onClose: () => void;
  initialMode?: 'inspect' | 'debrief';
}

export function ProjectMemoryWorkspace({
  actorId,
  state,
  onStateChange,
  onClose,
  initialMode = 'inspect',
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<
    'inspect' | 'foundation' | 'sources' | 'debrief' | 'correct'
  >(initialMode);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    null,
  );
  const [reviewNote, setReviewNote] = useState(
    'Evidence is attributable and the learning is reusable within this project.',
  );
  const [correctedStatement, setCorrectedStatement] = useState('');
  const [debrief, setDebrief] = useState({
    memoryType: 'approach-pattern',
    statement: '',
    context: '',
    outcome: '',
  });

  const candidates = useMemo(
    () =>
      state?.memories.filter((memory) => memory.status === 'candidate') ?? [],
    [state],
  );
  const selected =
    state?.memories.find((memory) => memory.id === selectedId) ??
    candidates[0] ??
    state?.memories[0] ??
    null;
  const sourceIntegration = state?.sourceIntegration;
  const selectedSourceArtifact =
    sourceIntegration?.artifacts.find(
      (artifact) => artifact.id === selectedArtifactId,
    ) ??
    sourceIntegration?.artifacts[0] ??
    null;

  async function operate(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/project-memory/operations', {
        method: 'POST',
        headers: operationHeaders(actorId),
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        projectMemory?: ProjectMemoryState;
        title?: string;
      };
      if (!response.ok || !payload.projectMemory) {
        throw new Error(
          payload.title ?? 'The project-memory operation failed.',
        );
      }
      onStateChange(payload.projectMemory);
      setMessage(label);
      setMode('inspect');
      if (body.operation === 'review' && typeof body.memoryId === 'string') {
        setSelectedId(body.memoryId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setBusy(null);
    }
  }

  function review(
    memory: ProjectMemoryView,
    decision: 'approve' | 'reject' | 'correct',
  ) {
    return operate(
      {
        operation: 'review',
        memoryId: memory.id,
        decision,
        note: reviewNote,
        ...(decision === 'correct' ? { correctedStatement } : {}),
      },
      decision === 'approve'
        ? 'Memory approved for project reuse.'
        : decision === 'reject'
          ? 'Candidate rejected; its audit trail was retained.'
          : 'Correction approved; the prior memory was superseded.',
    );
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Project memory workspace"
    >
      <section className={styles.surface}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              Project memory · working vertical slice
            </span>
            <h2>How project activity becomes reusable precedent</h2>
          </div>
          <div className={styles.legend} aria-label="Visual legend">
            <span>
              <i className={styles.externalDot} /> Host product
            </span>
            <span>
              <i className={styles.systemDot} /> Context Brain
            </span>
            <span>
              <i className={styles.outputDot} /> Product output
            </span>
          </div>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close project memory"
          >
            <X />
          </button>
        </header>

        {!state?.configured || !state.integration ? (
          <div className={styles.empty}>
            <Database />
            <strong>Project integration is not initialised</strong>
            <span>
              Run the project-memory bootstrap after applying migration 0020.
            </span>
          </div>
        ) : (
          <div className={styles.canvas}>
            <section className={`${styles.column} ${styles.external}`}>
              <header>
                <span className={styles.step}>01 · INPUTS</span>
                <strong>Existing product</strong>
                <small>Authoritative project boundary</small>
              </header>
              <div className={styles.projectCard}>
                <FolderKanban />
                <div>
                  <span className={styles.fieldLabel}>PROJECT</span>
                  <strong>{state.integration.project.name}</strong>
                  <code>project_id={state.integration.externalProjectId}</code>
                </div>
              </div>
              <div className={styles.inputGrid}>
                <div>
                  <FileText />
                  <strong>{state.integration.files}</strong>
                  <span>files</span>
                </div>
                <div>
                  <MessagesSquare />
                  <strong>{state.integration.conversations}</strong>
                  <span>conversations</span>
                </div>
                <div>
                  <Users />
                  <strong>
                    {
                      state.integration.members.filter(
                        (member) => member.status === 'active',
                      ).length
                    }
                  </strong>
                  <span>members</span>
                </div>
              </div>
              <div className={styles.members}>
                <span className={styles.fieldLabel}>MEMBERSHIP INPUT</span>
                {state.integration.members
                  .filter((member) => member.status === 'active')
                  .map((member) => (
                    <div key={member.actorId}>
                      <span>{member.name}</span>
                      <code>role={member.role}</code>
                    </div>
                  ))}
              </div>
              <footer>
                <ShieldCheck />
                <span>
                  Revision <code>{state.integration.membershipRevision}</code>{' '}
                  controls who can read, capture and review.
                </span>
              </footer>
            </section>

            <div className={styles.connector} aria-hidden="true">
              <span>permission-scoped sync</span>
              <ArrowRight />
            </div>

            <section className={`${styles.column} ${styles.engine}`}>
              <header>
                <span className={styles.step}>02 · FORMATION</span>
                <strong>Context Brain</strong>
                <small>Evidence → candidate → reviewed memory</small>
              </header>
              <div className={styles.engineStatus}>
                <div>
                  <Clock3 />
                  <span>
                    <b>{state.formation.schedule}</b>
                    <small>background schedule</small>
                  </span>
                </div>
                <code>route={state.formation.modelRoute}</code>
                <button
                  disabled={Boolean(busy) || !state.permissions.canCapture}
                  onClick={() =>
                    void operate(
                      { operation: 'run-background' },
                      'Background scan completed.',
                    )
                  }
                >
                  <Play /> Scan now
                </button>
              </div>
              <div className={styles.memoryList}>
                <div className={styles.listHeader}>
                  <span className={styles.fieldLabel}>MEMORY RECORDS</span>
                  <span className={styles.listActions}>
                    <code>{candidates.length} awaiting review</code>
                    {state.contextFoundation ? (
                      <button
                        type="button"
                        onClick={() => setMode('foundation')}
                      >
                        Context contract
                      </button>
                    ) : null}
                    {state.sourceIntegration?.configured ? (
                      <button type="button" onClick={() => setMode('sources')}>
                        Source perception
                      </button>
                    ) : null}
                  </span>
                </div>
                {state.memories.slice(0, 7).map((memory) => (
                  <button
                    key={memory.id}
                    className={
                      selected?.id === memory.id
                        ? styles.selectedMemory
                        : undefined
                    }
                    onClick={() => {
                      setSelectedId(memory.id);
                      setMode('inspect');
                    }}
                  >
                    <i data-status={memory.status} />
                    <span>
                      <strong>{memory.statement}</strong>
                      <small>
                        {titleCase(memory.type)} · {memory.evidenceCount}{' '}
                        evidence · {memory.status}
                      </small>
                    </span>
                    <ArrowRight />
                  </button>
                ))}
              </div>
              <button
                className={styles.debriefButton}
                disabled={!state.permissions.canCapture}
                onClick={() => setMode('debrief')}
              >
                <MessagesSquare /> Capture a project debrief
              </button>
            </section>

            <div className={styles.connector} aria-hidden="true">
              <span>approved precedent</span>
              <ArrowRight />
            </div>

            <section className={`${styles.column} ${styles.output}`}>
              <header>
                <span className={styles.step}>03 · OUTPUT</span>
                <strong>Kickoff pack</strong>
                <small>Only reviewed, actor-visible memory</small>
              </header>
              <div className={styles.packSummary}>
                <Sparkles />
                <div>
                  <span className={styles.fieldLabel}>GENERATED OUTPUT</span>
                  <strong>
                    {state.kickoff?.items.length ?? 0} precedents ready
                  </strong>
                </div>
                <button
                  disabled={
                    Boolean(busy) || !state.permissions.canGenerateKickoff
                  }
                  onClick={() =>
                    void operate(
                      { operation: 'generate-kickoff' },
                      'Kickoff pack regenerated from current approved memory.',
                    )
                  }
                >
                  <RotateCcw /> Regenerate
                </button>
              </div>
              <div className={styles.packItems}>
                {(state.kickoff?.items ?? []).map((item, index) => (
                  <article key={`${item.memoryId}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{item.statement}</strong>
                      <small>
                        {titleCase(item.sourceScope)} memory · relevance{' '}
                        {Math.round(item.relevance * 100)}%
                      </small>
                    </div>
                  </article>
                ))}
                {!state.kickoff?.items.length ? (
                  <p>No approved memory is available for this actor yet.</p>
                ) : null}
              </div>
              <div className={styles.disabledLayer}>
                <ShieldCheck />
                <span>
                  <strong>Client-wide memory is off</strong>
                  <small>{state.clientMemory.reason}</small>
                </span>
              </div>
            </section>

            <aside className={styles.detail}>
              {mode === 'sources' && sourceIntegration?.configured ? (
                <>
                  <header>
                    <div>
                      <span className={styles.fieldLabel}>
                        SIMULATED SOURCE PERCEPTION · NO LIVE CONNECTIONS
                      </span>
                      <strong>
                        How external material becomes permissioned context
                      </strong>
                    </div>
                    <code>external_calls=0</code>
                  </header>
                  <div
                    className={styles.sourcePipeline}
                    aria-label="External source perception pipeline"
                  >
                    <section className={styles.sourceStage}>
                      <span className={styles.fieldLabel}>
                        1 · SOURCE CONTRACT
                      </span>
                      {sourceIntegration.connections.map((connection) => (
                        <article key={connection.id}>
                          <b>{connection.transport.toUpperCase()}</b>
                          <span>
                            <strong>{connection.name}</strong>
                            <small>{titleCase(connection.strategy)}</small>
                          </span>
                          <i data-freshness={connection.freshness}>
                            {connection.freshness}
                          </i>
                        </article>
                      ))}
                    </section>
                    <div className={styles.sourceArrow} aria-hidden="true">
                      <small>cursor + permissions</small>
                      <ArrowRight />
                    </div>
                    <section className={styles.sourceStage}>
                      <span className={styles.fieldLabel}>
                        2 · CANONICAL ARTIFACT
                      </span>
                      <div className={styles.artifactGrid}>
                        {sourceIntegration.artifacts.map((artifact) => (
                          <button
                            key={artifact.id}
                            type="button"
                            data-selected={
                              selectedSourceArtifact?.id === artifact.id
                            }
                            onClick={() => setSelectedArtifactId(artifact.id)}
                          >
                            <span>{artifact.modality.toUpperCase()}</span>
                            <strong>{artifact.title}</strong>
                            <small>{artifact.observationCount} signals</small>
                          </button>
                        ))}
                      </div>
                    </section>
                    <div className={styles.sourceArrow} aria-hidden="true">
                      <small>deterministic perception</small>
                      <ArrowRight />
                    </div>
                    <section
                      className={`${styles.sourceStage} ${styles.observationStage}`}
                    >
                      <span className={styles.fieldLabel}>
                        3 · PERMISSIONED OBSERVATIONS
                      </span>
                      <strong className={styles.selectedArtifactTitle}>
                        {selectedSourceArtifact?.title}
                      </strong>
                      <div className={styles.observationList}>
                        {(selectedSourceArtifact?.observations ?? []).map(
                          (observation) => (
                            <article key={observation.id}>
                              <span>
                                <b>{titleCase(observation.type)}</b>
                                <code>{locatorLabel(observation.locator)}</code>
                              </span>
                              <p>{observation.statement}</p>
                            </article>
                          ),
                        )}
                      </div>
                    </section>
                  </div>
                  <div className={styles.sourceReceipt}>
                    {sourceIntegration.compounding?.hypothesis ? (
                      <>
                        <span className={styles.compoundingHypothesis}>
                          <small>
                            4 · SYSTEM OUTPUT · UNTRUSTED HYPOTHESIS · AWAITS
                            LEAD REVIEW
                          </small>
                          <strong>
                            {sourceIntegration.compounding.hypothesis.statement}
                          </strong>
                        </span>
                        <span>
                          <small>EVIDENCE BASIS</small>
                          <strong>
                            {
                              sourceIntegration.compounding.hypothesis
                                .evidenceCount
                            }{' '}
                            artifacts ·{' '}
                            {
                              sourceIntegration.compounding.hypothesis
                                .sourceDiversity
                            }{' '}
                            sources
                          </strong>
                        </span>
                        <span>
                          <small>BACKGROUND LOOP</small>
                          <strong>
                            {sourceIntegration.compounding.schedule} ·{' '}
                            {sourceIntegration.compounding.pendingJobs} queued
                          </strong>
                        </span>
                      </>
                    ) : (
                      <>
                        <span>
                          <small>SYNTHETIC CONTRACTS</small>
                          <strong>
                            {sourceIntegration.summary.connectionCount}
                          </strong>
                        </span>
                        <span>
                          <small>VISIBLE ARTIFACTS</small>
                          <strong>
                            {sourceIntegration.summary.artifactCount}
                          </strong>
                        </span>
                        <span>
                          <small>VISIBLE OBSERVATIONS</small>
                          <strong>
                            {sourceIntegration.summary.observationCount}
                          </strong>
                        </span>
                      </>
                    )}
                    <button type="button" onClick={() => setMode('inspect')}>
                      Back to memory
                    </button>
                  </div>
                </>
              ) : mode === 'foundation' && state.contextFoundation ? (
                <>
                  <header>
                    <div>
                      <span className={styles.fieldLabel}>
                        GOVERNED CONTEXT · USED BY THIS DIAGNOSIS
                      </span>
                      <strong>{state.contextFoundation.scenario.title}</strong>
                    </div>
                    <code>quality={state.contextFoundation.status}</code>
                  </header>
                  <div
                    className={styles.foundationFlow}
                    aria-label="Governed context dependency flow"
                  >
                    {state.contextFoundation.assets.map((asset, index) => (
                      <div
                        className={styles.foundationStep}
                        key={asset.resourceId}
                      >
                        {index > 0 ? (
                          <span className={styles.foundationArrow}>
                            <small>
                              {asset.kind === 'metric'
                                ? 'gives the term a measure'
                                : 'uses both as procedure inputs'}
                            </small>
                            <ArrowRight />
                          </span>
                        ) : null}
                        <article data-kind={asset.kind}>
                          <span className={styles.fieldLabel}>
                            {asset.kind === 'term'
                              ? 'BUSINESS TERM'
                              : asset.kind === 'metric'
                                ? 'GOVERNED METRIC'
                                : 'DIAGNOSTIC SKILL'}
                          </span>
                          <strong>{asset.name}</strong>
                          <p>{asset.definition}</p>
                          <footer>
                            <code>{asset.stableKey}</code>
                            <b data-quality={asset.quality?.status}>
                              {asset.quality
                                ? `${Math.round(asset.quality.score * 100)}% ${asset.quality.status}`
                                : 'not assessed'}
                            </b>
                          </footer>
                        </article>
                      </div>
                    ))}
                  </div>
                  <div className={styles.foundationReceipt}>
                    <span>
                      <small>OWNER</small>
                      <strong>
                        {state.contextFoundation.assets[0]?.owner ??
                          'Unassigned'}
                      </strong>
                    </span>
                    <span>
                      <small>VERSION</small>
                      <code>
                        {state.contextFoundation.assets.every(
                          (asset) => asset.version === 1,
                        )
                          ? 'v1'
                          : 'mixed'}
                      </code>
                    </span>
                    <span>
                      <small>DEPENDENCIES</small>
                      <strong>
                        {state.contextFoundation.dependencies.length} resolved
                      </strong>
                    </span>
                    <span>
                      <small>QUALITY GATE</small>
                      <strong>
                        {state.contextFoundation.summary.blockingIssueCount ===
                        0
                          ? 'No blockers'
                          : `${state.contextFoundation.summary.blockingIssueCount} blockers`}
                      </strong>
                    </span>
                    <button type="button" onClick={() => setMode('inspect')}>
                      Back to memory
                    </button>
                  </div>
                </>
              ) : mode === 'debrief' ? (
                <>
                  <header>
                    <div>
                      <span className={styles.fieldLabel}>HUMAN INPUT</span>
                      <strong>Capture a debrief learning</strong>
                    </div>
                    <button onClick={() => setMode('inspect')}>
                      <X />
                    </button>
                  </header>
                  <div className={styles.formGrid}>
                    <label>
                      Memory type
                      <select
                        value={debrief.memoryType}
                        onChange={(event) =>
                          setDebrief({
                            ...debrief,
                            memoryType: event.target.value,
                          })
                        }
                      >
                        <option value="approach-pattern">
                          Approach pattern
                        </option>
                        <option value="decision">Decision</option>
                        <option value="risk-response">Risk response</option>
                        <option value="constraint-adaptation">
                          Constraint adaptation
                        </option>
                        <option value="anti-pattern">Anti-pattern</option>
                        <option value="stakeholder-pattern">
                          Stakeholder pattern
                        </option>
                      </select>
                    </label>
                    <label>
                      What should the project remember?
                      <textarea
                        value={debrief.statement}
                        onChange={(event) =>
                          setDebrief({
                            ...debrief,
                            statement: event.target.value,
                          })
                        }
                        placeholder="Describe the reusable learning…"
                      />
                    </label>
                    <label>
                      When did it apply?
                      <input
                        value={debrief.context}
                        onChange={(event) =>
                          setDebrief({
                            ...debrief,
                            context: event.target.value,
                          })
                        }
                        placeholder="Context or constraint"
                      />
                    </label>
                    <label>
                      What outcome should recur?
                      <input
                        value={debrief.outcome}
                        onChange={(event) =>
                          setDebrief({
                            ...debrief,
                            outcome: event.target.value,
                          })
                        }
                        placeholder="Expected observable outcome"
                      />
                    </label>
                  </div>
                  <button
                    className={styles.primary}
                    disabled={
                      Boolean(busy) || debrief.statement.trim().length < 20
                    }
                    onClick={() =>
                      void operate(
                        { operation: 'capture-debrief', ...debrief },
                        'Debrief captured as a reviewable memory candidate.',
                      )
                    }
                  >
                    Create candidate <ArrowRight />
                  </button>
                </>
              ) : selected ? (
                <>
                  <header>
                    <div>
                      <span className={styles.fieldLabel}>
                        SELECTED MEMORY RECORD
                      </span>
                      <strong>{titleCase(selected.type)}</strong>
                    </div>
                    <code>status={selected.status}</code>
                  </header>
                  <blockquote>{selected.statement}</blockquote>
                  <div className={styles.recordFields}>
                    <span>
                      <small>EVIDENCE</small>
                      <strong>{selected.evidenceCount} linked items</strong>
                    </span>
                    <span>
                      <small>CONFIDENCE</small>
                      <strong>{Math.round(selected.confidence * 100)}%</strong>
                    </span>
                    <span>
                      <small>SCOPE</small>
                      <strong>{selected.scope}</strong>
                    </span>
                    <span>
                      <small>PROCESS</small>
                      <code>{selected.process}</code>
                    </span>
                  </div>
                  {selected.status === 'candidate' &&
                  state.permissions.canReview ? (
                    <div className={styles.reviewControls}>
                      <label>
                        Reviewer rationale
                        <input
                          value={reviewNote}
                          onChange={(event) =>
                            setReviewNote(event.target.value)
                          }
                        />
                      </label>
                      {mode === 'correct' ? (
                        <label>
                          Corrected memory
                          <textarea
                            value={correctedStatement}
                            onChange={(event) =>
                              setCorrectedStatement(event.target.value)
                            }
                          />
                        </label>
                      ) : null}
                      <div>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void review(selected, 'reject')}
                        >
                          <X /> Reject
                        </button>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() =>
                            mode === 'correct'
                              ? void review(selected, 'correct')
                              : setMode('correct')
                          }
                        >
                          <RotateCcw />{' '}
                          {mode === 'correct' ? 'Save correction' : 'Correct'}
                        </button>
                        <button
                          className={styles.primary}
                          disabled={Boolean(busy)}
                          onClick={() => void review(selected, 'approve')}
                        >
                          <Check /> Approve
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.recordNote}>
                      {selected.status === 'candidate'
                        ? 'Project Lead review is required.'
                        : 'This memory is already resolved and remains auditable.'}
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.recordNote}>
                  Run a scan or capture a debrief to form a reviewable memory.
                </p>
              )}
              {message ? <div className={styles.message}>{message}</div> : null}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
