import { CalendarClock, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Translator } from "@/lib/i18n";
import { TYPICAL_HOLD_YEARS, type LeaseFinancingAssessment } from "@/lib/lease-financing";

type Props = {
  assessment: LeaseFinancingAssessment;
  t: Translator;
};

const STATUS_META = {
  "covers-to-95": {
    Icon: ShieldCheck,
    banner: "bg-success/10 text-success",
  },
  prorated: {
    Icon: ShieldAlert,
    banner: "bg-warning/10 text-warning",
  },
  "below-cpf-floor": {
    Icon: ShieldX,
    banner: "bg-destructive/10 text-destructive",
  },
  unknown: {
    Icon: ShieldAlert,
    banner: "bg-muted/40 text-muted-foreground",
  },
} as const;

function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

/**
 * Buyer-only lease, CPF & loan reality check. Surfaces the published HDB/CPF
 * rules that listing portals omit: how this flat's remaining lease and the
 * buyer's age shrink the CPF they can use and the loan they can get, plus a
 * plain lease-decay clock. See {@link assessLeaseFinancing} for the logic.
 */
export function LeaseFinancingPanel({ assessment, t }: Props) {
  const { status } = assessment;
  const meta = STATUS_META[status];
  const { Icon } = meta;

  let headline: string;
  let detail: string | null = null;

  switch (status) {
    case "covers-to-95":
      headline = t("leaseFinancing.coversTo95");
      detail = t("leaseFinancing.coversTo95Detail", {
        ltv: toPercent(assessment.proratedLtvRatio ?? 0),
      });
      break;
    case "prorated":
      headline = t("leaseFinancing.prorated", { years: assessment.shortfallYears });
      detail = t("leaseFinancing.proratedDetail", {
        factor: toPercent(assessment.prorationFactor ?? 0),
        ltv: toPercent(assessment.proratedLtvRatio ?? 0),
      });
      break;
    case "below-cpf-floor":
      headline = t("leaseFinancing.belowFloor");
      detail = t("leaseFinancing.belowFloorDetail");
      break;
    default:
      headline = t("leaseFinancing.unknownAge");
      break;
  }

  const decayText =
    assessment.remainingLeaseAfterHold > 0
      ? t("leaseFinancing.decayAfterHold", {
          hold: TYPICAL_HOLD_YEARS,
          years: assessment.remainingLeaseAfterHold,
        })
      : t("leaseFinancing.decayAfterHoldExhausted", { hold: TYPICAL_HOLD_YEARS });

  return (
    <section
      aria-labelledby="lease-financing-title"
      data-testid="lease-financing-section"
      className="rounded-xl border border-border/40 bg-muted/20 p-3"
    >
      <div
        id="lease-financing-title"
        className="mb-2 flex items-center gap-2 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground"
      >
        <ShieldCheck data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
        {t("leaseFinancing.title")}
      </div>

      <div
        className={cn(
          "flex items-start gap-2 rounded-lg px-3 py-2",
          meta.banner,
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold leading-snug">{headline}</span>
          {detail ? (
            <span className="text-[0.65rem] font-medium leading-snug opacity-90">{detail}</span>
          ) : null}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-[0.58rem] font-medium text-muted-foreground">
            {t("leaseFinancing.remainingNow")}
          </dt>
          <dd className="font-heading text-sm font-extrabold tabular-nums">
            {t("unit.years", { value: assessment.remainingLeaseYears })}
          </dd>
        </div>
        {assessment.requiredLeaseYears !== null ? (
          <div>
            <dt className="text-[0.58rem] font-medium text-muted-foreground">
              {t("leaseFinancing.requiredTo95")}
            </dt>
            <dd className="font-heading text-sm font-extrabold tabular-nums">
              {t("unit.years", { value: assessment.requiredLeaseYears })}
            </dd>
          </div>
        ) : null}
        {assessment.loanTenureYears !== null ? (
          <div className="col-span-2">
            <dt className="text-[0.58rem] font-medium text-muted-foreground">
              {t("leaseFinancing.loanTenure")}
            </dt>
            <dd className="font-heading text-sm font-extrabold tabular-nums">
              {t("unit.years", { value: assessment.loanTenureYears })}
              {assessment.tenureLimitedBy !== null ? (
                <span className="ml-1 text-[0.58rem] font-medium text-muted-foreground">
                  {assessment.tenureLimitedBy === "lease"
                    ? t("leaseFinancing.loanTenureLeaseCapped")
                    : t("leaseFinancing.loanTenureAgeCapped")}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-2 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[0.65rem] font-medium text-muted-foreground">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{decayText}</span>
      </div>

      <p className="mt-2 text-[0.58rem] leading-snug text-muted-foreground">
        {t("leaseFinancing.disclaimer")}{" "}
        <a
          href="https://www.cpf.gov.sg/member/home-ownership"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2 hover:text-foreground"
        >
          {t("leaseFinancing.cpfLink")}
        </a>
      </p>
    </section>
  );
}
