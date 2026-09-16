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

interface Props {
  actorId: string;
  state: ProjectMemoryState | null;
  onStateChange: (state: ProjectMemoryState) => void;
  onClose: () => void;
}

export function ProjectMemoryWorkspace({
  actorId,
  state,
  onStateChange,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<
    'inspect' | 'foundation' | 'debrief' | 'correct'
  >(
    'inspect',
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
              {mode === 'foundation' && state.contextFoundation ? (
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
                      <div className={styles.foundationStep} key={asset.resourceId}>
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
