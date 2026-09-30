import styles from "./VersionBadge.module.css";

/**
 * `__APP_VERSION__` comes from `package.json` (see vite.config.ts) -- bump it
 * by hand with every shipped commit. The commit SHA and build time are in
 * the tooltip for when two deploys ever land on the same version number.
 */
export function VersionBadge() {
  const buildTime = new Date(__BUILD_TIME__).toLocaleString();

  return (
    <div className={styles.badge} title={`${__COMMIT_SHA__} · built ${buildTime}`}>
      v{__APP_VERSION__}
    </div>
  );
}
