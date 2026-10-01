import type { Role } from './db';

// Role context only — for brief/email framing. Never a source of scoring
// criteria, weights, or preferences. rubric_criteria (seeded from
// rubric.txt) is the sole scoring authority; see src/lib/ai/scoring.ts.
export const JOB_DESCRIPTIONS: Record<Role, string> = {
  pm: `Kargo · Mumbai · Series A — Product Manager
Reports to: Arjun Mehta, Founder

Kargo builds software for mid-sized freight forwarders and 3PLs — shipment tracking,
documentation, and carrier coordination. Series A, 40 people, scaling to 70 by December.

This is the first dedicated PM at Kargo for the core operations platform. They will own the
product roadmap, run customer discovery with freight forwarders, work directly with engineering
on what gets built and why, and establish the team's prioritization and decision rhythms.

Looking for: 2-4 years of PM experience, ideally building something for the first time rather
than maintaining what exists; comfort operating without structure; evidence of shipping and
killing things and learning from both; genuine curiosity about ground-level operations.`,

  spm: `Kargo · Mumbai · Series A — Senior Product Manager
Reports to: Arjun Mehta, Founder

Kargo builds software for mid-sized freight forwarders and 3PLs — shipment tracking,
documentation, and carrier coordination. Series A, 40 people, scaling to 70 by December.

This is the most senior PM at Kargo, owning the integration and data layer: carrier systems,
port portals, ERP environments, and the harder architectural product calls with consequences
felt years out. They will also help shape what the PM function looks like as the company grows.

Looking for: 5-8 years of PM experience with clear evidence of owning a product area without a
layer of senior PMs above them; experience with platform or integration-heavy products; proven
ability to make calls in ambiguous situations and live with the consequences; early-stage company
experience or equivalent; logistics/supply-chain familiarity is a genuine advantage.`,
};
