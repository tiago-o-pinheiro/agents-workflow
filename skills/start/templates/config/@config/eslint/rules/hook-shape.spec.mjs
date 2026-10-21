import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, it } from 'vitest'

import { hookShape } from './hook-shape.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
})

ruleTester.run('hook-shape', hookShape, {
  valid: [
    {
      name: 'Given a hook returning four values, should accept it',
      code: 'const useCounter = () => { const [a] = useState(0); return { a, b: 1, c: 2, d: 3 } }',
    },
    {
      name: 'Given a hook returning a tuple of two values, should accept it',
      code: 'const useToggle = () => { const [isOn, setIsOn] = useState(false); const toggle = () => setIsOn(!isOn); return [isOn, toggle] as const }',
    },
    {
      name: 'Given a context consumer that throws outside the provider, should not treat it as a wrapper',
      code: 'const useAuth = () => { const auth = useContext(AuthContext); if (!auth) { throw new Error("x") } return auth }',
    },
    {
      name: 'Given a hook returning an object with a spread, should skip the count',
      code: 'const useBig = () => { const state = useState(0); return { ...state, a: 1, b: 2, c: 3, d: 4, e: 5 } }',
    },
    {
      name: 'Given a hook that derives a value from another hook, should accept it',
      code: 'const useTitle = () => { const route = useRoute(); return route.title.toUpperCase() }',
    },
    {
      name: 'Given a function that is not a hook, should ignore it',
      code: 'const buildState = () => ({ a: 1, b: 2, c: 3, d: 4, e: 5 })',
    },
  ],
  invalid: [
    {
      name: 'Given a hook returning five object properties, should report too many values',
      code: 'const useBig = () => { const a = 1; return { a, b: 2, c: 3, d: 4, e: 5 } }',
      errors: [{ messageId: 'tooManyValues', data: { count: 5 } }],
    },
    {
      name: 'Given a hook returning an array of five elements, should report too many values',
      code: 'const useBig = () => { const a = 1; return [a, 2, 3, 4, 5] as const }',
      errors: [{ messageId: 'tooManyValues', data: { count: 5 } }],
    },
    {
      name: 'Given an expression-bodied hook returning a five-property object, should report too many values',
      code: 'const useBig = () => ({ a: 1, b: 2, c: 3, d: 4, e: 5 })',
      errors: [{ messageId: 'tooManyValues', data: { count: 5 } }],
    },
    {
      name: 'Given a function-expression hook returning too many values, should report them',
      code: 'const useBig = function () { return { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 } }',
      errors: [{ messageId: 'tooManyValues', data: { count: 6 } }],
    },
    {
      name: 'Given an expression-bodied hook that calls another hook, should report a wrapper',
      code: 'const useSession = () => useAuth()',
      errors: [{ messageId: 'wrapperHook' }],
    },
    {
      name: 'Given an expression-bodied hook that falls back to another hook, should report a wrapper',
      code: 'const useSession = () => useAuth() ?? useGuest()',
      errors: [{ messageId: 'wrapperHook' }],
    },
    {
      name: 'Given an expression-bodied hook with a conditional hook call, should report a wrapper',
      code: 'const useSession = (isGuest) => (isGuest ? useGuest() : useAuth())',
      errors: [{ messageId: 'wrapperHook' }],
    },
    {
      name: 'Given a block hook that only re-exports hook results, should report a wrapper',
      code: 'const useUserPage = () => { const user = useUser(); const [tab, setTab] = useState(0); return { user, tab, setTab } }',
      errors: [{ messageId: 'wrapperHook' }],
    },
    {
      name: 'Given a block hook that returns a hook call directly, should report a wrapper',
      code: 'const useSession = () => { return useAuth() }',
      errors: [{ messageId: 'wrapperHook' }],
    },
  ],
})
