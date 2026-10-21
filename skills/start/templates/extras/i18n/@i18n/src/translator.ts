export type Variables = Readonly<Record<string, string | number>>

const PLACEHOLDER = /\{\{(\w+)\}\}/g

const interpolate = (template: string, variables: Variables): string =>
  template.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables[name]
    return value === undefined ? match : String(value)
  })

export const createTranslator =
  <Key extends string>(messages: Readonly<Record<Key, string>>) =>
  (key: Key, variables?: Variables): string => {
    const template = messages[key] ?? key
    return variables ? interpolate(template, variables) : template
  }
