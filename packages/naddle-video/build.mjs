import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const source = join(root, 'src', 'renderer', 'index.html')
const target = join(root, 'out', 'renderer', 'index.html')

mkdirSync(dirname(target), { recursive: true })
cpSync(source, target)
