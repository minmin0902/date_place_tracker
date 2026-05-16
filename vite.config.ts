import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  cacheDir: path.resolve(process.env.HOME ?? '', 'Library/Caches/vite-date-place-tracker'),
  plugins: [react()],
  // noDiscovery:true + 빈 include 조합이 CJS-only transitive dep들
  // (void-elements, use-sync-external-store 등)을 prebundle에서 빠뜨려
  // "does not provide an export named 'default'" 류 에러로 무한로딩
  // 시키던 원인. vite 기본값(자동 발견)으로 돌리고 명시 include는 안전망.
  optimizeDeps: {
    include: ['void-elements', 'html-parse-stringify', 'use-sync-external-store/shim'],
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
