import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join, basename } from 'path'

const DIST = join(import.meta.dir, 'dist')
const PAGES = join(import.meta.dir, 'pages')

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })

const htmlFiles = (await readdir(PAGES)).filter(f => f.endsWith('.html'))

for (const htmlFile of htmlFiles) {
  const htmlPath = join(PAGES, htmlFile)
  let html = await readFile(htmlPath, 'utf-8')

  const tsMatch = html.match(/src="\.\/([^"]+\.ts)"/)
  if (tsMatch) {
    const tsFile = tsMatch[1]!
    const tsPath = join(PAGES, tsFile)
    const result = await Bun.build({
      entrypoints: [tsPath],
      minify: true,
      target: 'browser',
    })
    if (!result.success) {
      console.error(`Build failed for ${tsFile}:`, result.logs)
      process.exit(1)
    }
    const jsCode = await result.outputs[0]!.text()
    const scriptTag = `<script type="module" src="./${tsFile}"></script>`
    const idx = html.indexOf(scriptTag)
    if (idx !== -1) {
      html = html.slice(0, idx) + `<script type="module">${jsCode}<\/script>` + html.slice(idx + scriptTag.length)
    }
  }

  const outName = htmlFile === 'index.html' ? 'index.html' : htmlFile
  await writeFile(join(DIST, outName), html)
}

console.log(`Built ${htmlFiles.length} pages to dist/`)
