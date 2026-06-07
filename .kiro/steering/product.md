---
inclusion: always
---

# Product Purpose

## Vision
This project is an HDB resale buyer-side due-diligence tool. It helps prospective buyers decide whether an asking price is fair by comparing it with historical resale transactions, lease constraints, affordability constraints, and local context.

The product is not a price prediction product and must not present generated forecasts as facts. It should help buyers build confidence, prepare negotiations, and make shortlist decisions from transparent, deterministic evidence.

## Target User
The primary user is a Singapore HDB resale buyer who wants to evaluate a specific flat, block, town, or shortlist before offering or negotiating. They care about comparable resale transactions, remaining lease risk, monthly affordability, nearby amenities, and whether a seller's asking price is defensible.

Secondary users include agents, family members, or advisors helping a buyer interpret the same evidence. Their workflows should still be buyer-first.

## Product Boundaries
- Do not turn the product into a seller listing portal.
- Do not optimize the core experience for showing seller inventory, lead capture, promoted listings, or marketplace browsing.
- Listing portal links may exist as a convenience, but they are not the source of truth and must not drive ranking, UX priority, or data architecture.
- Prefer "is this asking price fair?" workflows over "show me all units for sale" workflows.
- Prefer comparable transactions, price bands, lease and financing signals, local context, shortlist comparison, and negotiation preparation over seller-side conversion.

## Evidence Principles
1. **Deterministic facts over predictions**: Show historical transactions, public dataset facts, derived comparisons, and transparent calculations. Do not invent scores or forecasts that cannot be traced back to deterministic inputs.
2. **Map-first context**: Location grounds the experience. Use the map to make nearby blocks, MRT access, school radius, amenities, town context, and comparable transactions spatially understandable.
3. **Price fairness first**: Asking-price checks, comparable ranges, PSF or PSM comparisons, town or flat-type percentiles, and recent transaction windows are core buyer confidence features.
4. **Lease and affordability matter**: Remaining lease, lease decay, CPF or financing constraints, budget fit, and monthly affordability should be first-class due-diligence inputs.
5. **High information density**: Buyers need compact, professional, scan-friendly data. Avoid decorative dashboards that hide the evidence.
6. **Privacy and trust**: Browser-local state is the default and offline baseline. Shortlist cloud sync is opt-in through an anonymous sync code with no account, email, password, or PII.

## Data And Language
- Use official public datasets and locally persisted derived artifacts where possible.
- Label estimates and deterministic calculations clearly.
- Avoid language that implies financial advice, valuation certification, or guaranteed future performance.
- Keep explanations concrete: "recent 4-room transactions in this block" is better than opaque "AI insight" or "market score" language.
