import type {
  DiscoveryConceptRule,
  DiscoveryDocument,
} from '@/src/modules/discovery/types';

export const SUPPLIER_DISCOVERY_RULES: DiscoveryConceptRule[] = [
  {
    id: 'duplicate-compliance-requests',
    label: 'Duplicate compliance requests',
    keywords: [
      'upload again',
      'same documents',
      'repeated due diligence',
      'overlapping attachments',
      'duplicate requests',
    ],
    hypothesisFragment: 'duplicate compliance-document requests',
    prediction:
      'Removing repeated document requests should reduce supplier drop-off and approval time.',
    falsificationCondition:
      'Drop-off remains unchanged after duplicate requests are removed.',
  },
  {
    id: 'supplier-identity-mismatch',
    label: 'Supplier identity mismatch',
    keywords: [
      'legal name',
      'trading name',
      'identity mismatch',
      'manual reconciliation',
    ],
    hypothesisFragment: 'supplier identity mismatches',
    prediction:
      'A shared legal/trading-name identity should reduce manual reconciliation and repeated requests.',
    falsificationCondition:
      'Suppliers with fully resolved identities experience the same repetition and delay.',
  },
  {
    id: 'unclear-document-rules',
    label: 'Unclear document rules',
    keywords: [
      'which certificate',
      'accepted format',
      'conflicting checklist',
      'unclear requirements',
    ],
    hypothesisFragment: 'unclear document requirements',
    prediction: 'One authoritative checklist should reduce failed submissions.',
    falsificationCondition:
      'Clear, authoritative requirements do not change resubmission rates.',
  },
  {
    id: 'compliance-queue-delay',
    label: 'Compliance queue delay',
    keywords: [
      'approval delay',
      'nine days',
      'compliance queue',
      'due diligence queue',
    ],
    hypothesisFragment: 'a delayed compliance queue',
    prediction:
      'Reducing queue time should shorten onboarding even without changing the portal.',
    falsificationCondition:
      'Faster compliance review does not shorten end-to-end onboarding.',
  },
];

export const SUPPLIER_DISCOVERY_DOCUMENTS: DiscoveryDocument[] = [
  {
    resourceId: 'discovery-research-supplier-01',
    sourceUri: 'research://verdant/supplier-onboarding/interviews-01',
    sourceSystem: 'research',
    title: 'Supplier enrollment interviews',
    body: 'Four suppliers were asked to upload again after submitting insurance certificates. They could not tell which certificate or accepted format the portal required. Two operate under a trading name that differs from the legal name.',
  },
  {
    resourceId: 'discovery-meeting-supplier-01',
    sourceUri: 'meeting://verdant/supplier-ops/2026-09-02',
    sourceSystem: 'meetings',
    title: 'Supplier operations review',
    body: 'Operations described an identity mismatch between legal name and trading name. Compliance requests the same documents by email after portal submission. The median approval delay is nine days.',
  },
  {
    resourceId: 'discovery-crm-supplier-01',
    sourceUri: 'crm://verdant/supplier-loss-notes',
    sourceSystem: 'crm',
    title: 'Lost supplier follow-up notes',
    body: 'Account teams classify these suppliers as no response, but free-text notes describe repeated due diligence requests and manual reconciliation of the supplier legal name.',
  },
  {
    resourceId: 'discovery-document-supplier-01',
    sourceUri: 'documents://verdant/policies/supplier-checklist',
    sourceSystem: 'documents',
    title: 'Supplier assurance checklist comparison',
    body: 'The current policy requires one insurance certificate. A conflicting checklist inherited from the legacy process requests three overlapping attachments and uses the trading name as a separate identity.',
  },
  {
    resourceId: 'discovery-message-supplier-01',
    sourceUri: 'messages://verdant/supplier-onboarding/thread-118',
    sourceSystem: 'messages',
    title: 'Supplier onboarding channel',
    body: 'Duplicate requests reappear when the legal name differs from the trading name. The team sends the record to a manual reconciliation queue and suppliers often stop replying.',
  },
];
