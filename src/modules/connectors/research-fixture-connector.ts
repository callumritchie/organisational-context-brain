import { INITIAL_RESEARCH_RECORDS } from '@/data/sources/research/initial';
import { ELIGIBILITY_RESEARCH_MUTATION } from '@/data/sources/research/eligibility-mutation';
import type { Connector, ResearchSourceRecord } from './types';

const INITIAL_CURSOR = 'research-fixture-v2';
const MUTATED_CURSOR = 'research-fixture-v3-eligibility';

export class ResearchFixtureConnector implements Connector<ResearchSourceRecord> {
  readonly sourceType = 'research-repository';

  constructor(private readonly includeEligibilityMutation = false) {}

  async listChanges(cursor?: string | null) {
    const nextCursor = this.includeEligibilityMutation ? MUTATED_CURSOR : INITIAL_CURSOR;
    if (cursor === nextCursor || (!this.includeEligibilityMutation && cursor === MUTATED_CURSOR)) {
      return { records: [], nextCursor: cursor };
    }
    return {
      records: this.includeEligibilityMutation
        ? [...INITIAL_RESEARCH_RECORDS, ELIGIBILITY_RESEARCH_MUTATION]
        : INITIAL_RESEARCH_RECORDS,
      nextCursor,
    };
  }

  async getObject(externalId: string) {
    const records = this.includeEligibilityMutation
      ? [...INITIAL_RESEARCH_RECORDS, ELIGIBILITY_RESEARCH_MUTATION]
      : INITIAL_RESEARCH_RECORDS;
    return records.find((record) => record.externalId === externalId) ?? null;
  }
}
