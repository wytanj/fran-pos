import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const productsPage = readFileSync(new URL('../dashboard/src/pages/products.tsx', import.meta.url), 'utf8')
const importJob = readFileSync(new URL('../dashboard/src/hooks/use-skums-import-job.tsx', import.meta.url), 'utf8')
const appLayout = readFileSync(new URL('../dashboard/src/components/layout/app-layout.tsx', import.meta.url), 'utf8')

test('dashboard mounts a background SKUMS import job surface', () => {
  assert.match(appLayout, /SkumsImportProvider/)
  assert.match(appLayout, /SkumsImportProgressPanel/)
  assert.match(importJob, /createContext<SkumsImportJobContextValue/)
  assert.match(importJob, /status: 'estimating'/)
  assert.match(importJob, /status: 'importing'/)
  assert.match(importJob, /fixed bottom-4 right-4/)
  assert.match(importJob, /View Products/)
})

test('SKUMS import preflight computes total and category sizes before importing', () => {
  assert.match(importJob, /listSkumsPosCatalog\(\{ limit: pageSize, offset \}, connector\)/)
  assert.match(importJob, /catalogTotal = response\.total/)
  assert.match(importJob, /category_name/)
  assert.match(importJob, /categories: Array\.from\(categories\.values\(\)\)/)
  assert.match(importJob, /importable/)
  assert.match(importJob, /skippedExisting/)
  assert.match(importJob, /pos_catalog_updated/)
  assert.match(importJob, /pos-catalog-updated/)
})

test('products page opens a wizard and starts SKUMS import from preflight state', () => {
  assert.match(productsPage, /useSkumsImportJob/)
  assert.match(productsPage, /importWizardOpen/)
  assert.match(productsPage, /prepareImport\(\)/)
  assert.match(productsPage, /startImport\(\)/)
  assert.match(productsPage, /SkumsImportWizardContent/)
  assert.match(productsPage, /Run in background/)
  assert.match(productsPage, /Category/)
  assert.doesNotMatch(productsPage, /useImportSkumsCatalog/)
})
