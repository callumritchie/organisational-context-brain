import { z } from 'zod';

const ontologySchema = z.object({
  resourceTypes: z.record(z.string(), z.object({ kind: z.enum(['entity', 'content']), description: z.string() })),
  relationships: z.record(
    z.string(),
    z.object({ from: z.array(z.string()), to: z.array(z.string()), description: z.string() }),
  ),
});

export const ONTOLOGY = ontologySchema.parse({
  resourceTypes: {
    Organisation: { kind: 'entity', description: 'A company or other organised body.' },
    Person: { kind: 'entity', description: 'A person known to the organisation.' },
    Client: { kind: 'entity', description: 'An organisation receiving work.' },
    Project: { kind: 'entity', description: 'A bounded programme of work.' },
    Hypothesis: { kind: 'entity', description: 'A testable explanation.' },
    Evidence: { kind: 'entity', description: 'A source-grounded observation.' },
    ResearchNote: { kind: 'content', description: 'A research repository artefact.' },
    MeetingNote: { kind: 'content', description: 'A meeting record captured through the connector lifecycle.' },
  },
  relationships: {
    WORKS_ON: { from: ['Person'], to: ['Project'], description: 'A person contributes to a project.' },
    IS_FOR: { from: ['Project'], to: ['Client'], description: 'A project serves a client.' },
    BELONGS_TO: { from: ['ResearchNote', 'MeetingNote', 'Evidence'], to: ['Project'], description: 'Knowledge is scoped to a project.' },
    AUTHORED: { from: ['Person'], to: ['ResearchNote', 'MeetingNote'], description: 'A person authored content.' },
    DERIVED_FROM: { from: ['Evidence'], to: ['ResearchNote', 'MeetingNote'], description: 'Evidence is grounded in content.' },
    SUPPORTS: { from: ['Evidence'], to: ['Hypothesis'], description: 'Evidence supports a hypothesis.' },
    CONTRADICTS: { from: ['Evidence'], to: ['Hypothesis'], description: 'Evidence contradicts a hypothesis.' },
  },
});
