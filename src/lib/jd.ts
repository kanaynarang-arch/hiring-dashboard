import type { Role } from './db';

// Role context only, for framing briefs and emails. These are never a source of
// scoring criteria, weights or preferences: rubric_criteria (seeded from
// rubric.txt) is the sole scoring authority. No personal names appear here.
export const JOB_DESCRIPTIONS: Record<Role, string> = {
  pm: `Kargo (Mumbai, Series A) — Product Manager. Kargo builds software for mid-sized freight
forwarders and 3PLs: shipment tracking, documentation and carrier coordination. This is the first
dedicated PM for the core operations platform, reporting to the founder: owns the roadmap, runs
customer discovery with freight forwarders, works directly with engineering, and sets up how the
product function prioritises and decides. Looking for 2-4 years of PM experience, ideally building
something for the first time; comfort without structure; evidence of shipping, killing and learning;
curiosity about ground-level operations. In-office, Mumbai.`,
  spm: `Kargo (Mumbai, Series A) — Senior Product Manager. Kargo builds software for mid-sized freight
forwarders and 3PLs. This is the most senior PM, owning the integration and data layer (carrier
systems, port portals, ERP environments) and the hard architectural product calls, and helping shape
the PM function as the company grows. Looking for 5-8 years of PM experience owning a product area
without senior PMs above, platform or integration experience, calls made in ambiguity, early-stage
experience, and logistics or supply-chain familiarity as a genuine advantage. In-office, Mumbai.`,
};
