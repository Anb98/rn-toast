/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, file), 'utf8'))

describe('package metadata', () => {
  const pkg = readJson('package.json')

  it('has no runtime dependencies and exact peers', () => {
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.peerDependencies).toEqual({
      react: '>=18.0.0',
      'react-native': '>=0.72.0'
    })
  })

  it('has the expected metadata shape', () => {
    expect(pkg.name).toBe('@anb98/rn-toast')
    expect(pkg.sideEffects).toBe(false)
    expect(pkg.main).toBe('./lib/commonjs/index.js')
    expect(pkg.module).toBe('./lib/module/index.js')
    expect(pkg.types).toBe('./lib/typescript/src/index.d.ts')
    expect(pkg['react-native']).toBe('src/index.ts')
    expect(pkg.source).toBe('src/index.ts')
    expect(pkg.exports).toEqual({
      '.': {
        types: './lib/typescript/src/index.d.ts',
        import: './lib/module/index.js',
        require: './lib/commonjs/index.js'
      }
    })
    expect(pkg.files).toEqual(
      expect.arrayContaining(['lib', 'src', '!src/**/__tests__/**', 'LICENSE', 'README.md'])
    )
  })

  it('exposes the build, test and typecheck scripts', () => {
    expect(pkg.scripts).toMatchObject({
      build: 'bob build',
      prepare: 'bob build',
      test: 'jest',
      typecheck: 'tsc --noEmit'
    })
  })
})

describe('tsconfig', () => {
  const { compilerOptions, include } = readJson('tsconfig.json') as {
    compilerOptions: Record<string, unknown>
    include: string[]
  }

  it('enables every strict flag', () => {
    for (const flag of [
      'strict',
      'noUncheckedIndexedAccess',
      'exactOptionalPropertyTypes',
      'noUnusedLocals',
      'noUnusedParameters',
      'noFallthroughCasesInSwitch',
      'isolatedModules'
    ]) {
      expect(compilerOptions[flag]).toBe(true)
    }
  })

  it('includes src and excludes examples', () => {
    expect(include).toEqual(['src'])
    expect(include).not.toContain('examples')
  })
})

describe('rejected tooling', () => {
  it('ships no CI, prettier or eslint config', () => {
    const entries = readdirSync(root)
    expect(entries).toContain('package.json')
    expect(existsSync(join(root, '.github', 'workflows'))).toBe(false)
    expect(entries.filter((name) => /^\.prettierrc/.test(name))).toEqual([])
    expect(entries.filter((name) => /^\.eslintrc/.test(name))).toEqual([])
    expect(entries.filter((name) => /^eslint\.config\./.test(name))).toEqual([])
  })
})

describe('babel config', () => {
  it('uses the react-native babel preset', () => {
    expect(readFileSync(join(root, 'babel.config.js'), 'utf8')).toContain(
      'module:@react-native/babel-preset'
    )
  })
})

describe('mit license', () => {
  it('names the author', () => {
    const license = readFileSync(join(root, 'LICENSE'), 'utf8')
    expect(license).toContain('MIT License')
    expect(license).toContain('2026 Abdiel Martinez')
  })
})
