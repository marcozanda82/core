/**
 * Bump quando cambia kentu_smart_master_db.json / kentu_smart_master_usda_FINAL.json.
 * Al cambio versione si invalidano override locali stale e la cache HTTP del JSON USDA.
 */
export const USDA_DB_VERSION = '2.0_FINAL';
export const KENTU_MASTER_DB_VERSION = `2026-08-29-usda-${USDA_DB_VERSION}`;

export const LS_MASTER_DB_VERSION_KEY = 'kentu_master_db_version';
export const LS_CATALOG_SERVING_OVERRIDES_KEY = 'kentu_catalog_serving_overrides';
