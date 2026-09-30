import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function commitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './package.json'), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    // The version shown in the app is `package.json`'s version, not the git
    // SHA -- it reads like a normal app version (0.0.1, 0.0.2, ...) and is
    // bumped by hand with every shipped commit (see CLAUDE.md). The commit
    // SHA and build time still ride along for the badge's tooltip, since
    // they pin down the exact build if two deploys ever share a version.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
