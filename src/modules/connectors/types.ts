export type SourceVisibility = 'everyone' | 'internal';

export interface ResearchSourceRecord {
  externalId: string;
  uri: string;
  title: string;
  body: string;
  author: 'Alex Chen' | 'Jamie Patel';
  createdAt: string;
  updatedAt: string;
  visibility: SourceVisibility;
  authority: number;
  projectRef: 'atlas-onboarding';
  clientRef: 'atlas-bank';
  evidence?: {
    title: string;
    summary: string;
    confidence: number;
    stance: 'SUPPORTS' | 'CONTRADICTS';
  };
}

export interface MeetingSourceRecord extends Omit<ResearchSourceRecord, 'uri'> {
  uri: `meeting://${string}`;
  attendees: Array<'Alex Chen' | 'Jamie Patel'>;
}

export interface DocumentSourceRecord extends Omit<ResearchSourceRecord, 'uri'> {
  uri: `documents://${string}`;
  folder: {
    externalId: string;
    path: string;
    alias: string;
  };
}

export interface CrmAccountRecord {
  externalId: 'account-381';
  uri: `crm://${string}`;
  name: 'Atlas Bank';
  accountNumber: '381';
  updatedAt: string;
  createdAt: string;
  visibility: SourceVisibility;
  projectRef: 'atlas-onboarding';
  sourceKeys: Array<{ type: 'account-id' | 'account-slug'; value: string }>;
}

export type KnowledgeSourceRecord = ResearchSourceRecord | MeetingSourceRecord | DocumentSourceRecord;

export interface ChangePage<T> {
  records: T[];
  nextCursor: string;
}

export interface Connector<T> {
  readonly sourceType: string;
  listChanges(cursor?: string | null): Promise<ChangePage<T>>;
  getObject(externalId: string): Promise<T | null>;
}
