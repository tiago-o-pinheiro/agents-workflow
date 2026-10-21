import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js']
const SKIPPED_SEGMENTS = ['node_modules', 'dist', '.next']
const MAX_LINES = 20

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const parsePayload = (raw) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const toRelativePath = (projectDir, filePath) => {
  const absolute = isAbsolute(filePath) ? filePath : resolve(projectDir, filePath)
  const path = relative(projectDir, absolute)
  return path.startsWith('..') || isAbsolute(path) ? null : path
}

const isLintable = (path) =>
  EXTENSIONS.some((extension) => path.endsWith(extension)) &&
  !path.split(sep).some((segment) => SKIPPED_SEGMENTS.includes(segment))

const localBin = (projectDir, name) => {
  const bin = join(projectDir, 'node_modules', '.bin', name)
  return existsSync(bin) ? bin : null
}

const run = (projectDir, bin, args) =>
  spawnSync(bin, args, { cwd: projectDir, encoding: 'utf8' })

const isProblemLine = (line) => /^\s+\d+:\d+\s/.test(line) || /^\//.test(line)

const main = async () => {
  const payload = parsePayload(await readStdin())
  const filePath = payload?.tool_input?.file_path
  if (typeof filePath !== 'string') {
    return 0
  }

  const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
  const path = toRelativePath(projectDir, filePath)
  if (path === null || !isLintable(path) || !existsSync(join(projectDir, path))) {
    return 0
  }

  const eslint = localBin(projectDir, 'eslint')
  const prettier = localBin(projectDir, 'prettier')
  if (eslint) {
    run(projectDir, eslint, ['--fix', path])
  }
  if (prettier) {
    run(projectDir, prettier, ['--write', '--log-level', 'silent', path])
  }
  if (!eslint) {
    return 0
  }

  const result = run(projectDir, eslint, ['--no-warn-ignored', path])
  if (result.status === 0) {
    return 0
  }

  const lines = `${result.stdout}${result.stderr}`.split('\n').filter(isProblemLine).slice(0, MAX_LINES)
  process.stderr.write(`eslint errors remain in ${path}:\n${lines.join('\n')}\n`)
  return 2
}

process.exitCode = await main()
