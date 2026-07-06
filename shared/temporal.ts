/**
 * Install a global Temporal implementation in runtimes that do not provide one
 * natively yet. Repo source intentionally uses the standard global Temporal API
 * across browser, Worker, tests, and Node scripts.
 */
import "temporal-polyfill/global";

export {};
