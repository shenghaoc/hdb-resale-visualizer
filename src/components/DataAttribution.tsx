import { DocsLink } from "@/features/docs/DocsLink";
import { ONEMAP_HOME_URL, SINGAPORE_OPEN_DATA_LICENCE_URL } from "@/shared/lib/constants";
import { useI18n } from "@/shared/lib/i18n";

/**
 * The credit that stays on screen whenever the map does: the OneMap credit its terms ask for, and the notice the
 * Singapore Open Data Licence v1.0 requires of an application that uses its datasets ("a conspicuous notice
 * acknowledging the source of the datasets" and "a link to the most recent version of this Licence"). The full,
 * dataset-by-dataset acknowledgement is the guide page this links to (`/docs/data-sources`).
 */
export function DataAttribution() {
  const { t } = useI18n();

  return (
    <div className="map-attribution-link" data-testid="map-attribution">
      <a href={ONEMAP_HOME_URL} rel="noopener noreferrer" target="_blank">
        © OneMap contributors
      </a>
      <span aria-hidden="true"> · </span>
      <span>
        {t("attribution.dataFrom")}{" "}
        <a href={SINGAPORE_OPEN_DATA_LICENCE_URL} rel="noopener noreferrer" target="_blank">
          {t("attribution.licence")}
        </a>
      </span>
      <span aria-hidden="true"> · </span>
      <DocsLink slug="data-sources" className="font-normal text-inherit">
        {t("attribution.sources")}
      </DocsLink>
    </div>
  );
}
