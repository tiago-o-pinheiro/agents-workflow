const HOOK_NAME = /^use[A-Z]/
const MAX_VALUES = 4

const unwrap = (node) =>
  node && (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression')
    ? unwrap(node.expression)
    : node

const getCalleeName = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name
  }
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name
  }
  return ''
}

const isHookCall = (node) =>
  node?.type === 'CallExpression' && HOOK_NAME.test(getCalleeName(node.callee))

const isHookOnlyExpression = (node) => {
  if (isHookCall(node)) {
    return true
  }
  if (node?.type === 'LogicalExpression') {
    return isHookOnlyExpression(node.left) || isHookOnlyExpression(node.right)
  }
  if (node?.type === 'ConditionalExpression') {
    return isHookOnlyExpression(node.consequent) || isHookOnlyExpression(node.alternate)
  }
  return false
}

const getHookName = (node) => {
  if (node.type === 'FunctionDeclaration') {
    return node.id?.name ?? ''
  }
  const parent = node.parent
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name
  }
  return ''
}

const collectReturns = (statement) => {
  if (!statement) {
    return []
  }
  if (statement.type === 'ReturnStatement') {
    return [statement]
  }
  if (statement.type === 'BlockStatement') {
    return statement.body.flatMap(collectReturns)
  }
  if (statement.type === 'IfStatement') {
    return [...collectReturns(statement.consequent), ...collectReturns(statement.alternate)]
  }
  return []
}

const countReturnedValues = (argument) => {
  const value = unwrap(argument)
  if (value?.type === 'ObjectExpression') {
    return value.properties.some((property) => property.type === 'SpreadElement')
      ? 0
      : value.properties.length
  }
  if (value?.type === 'ArrayExpression') {
    return value.elements.some((element) => element === null || element.type === 'SpreadElement')
      ? 0
      : value.elements.length
  }
  return 0
}

const collectPatternNames = (pattern) => {
  if (pattern.type === 'Identifier') {
    return [pattern.name]
  }
  if (pattern.type === 'ArrayPattern') {
    return pattern.elements.flatMap((element) => (element ? collectPatternNames(element) : []))
  }
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.flatMap((property) =>
      collectPatternNames(property.type === 'RestElement' ? property.argument : property.value),
    )
  }
  if (pattern.type === 'AssignmentPattern') {
    return collectPatternNames(pattern.left)
  }
  return []
}

const isOnlyDeclaredIdentifiers = (argument, declaredNames) => {
  const value = unwrap(argument)
  if (value?.type === 'Identifier') {
    return declaredNames.has(value.name)
  }
  if (value?.type === 'ObjectExpression') {
    return value.properties.every(
      (property) =>
        property.type === 'Property' &&
        property.value.type === 'Identifier' &&
        declaredNames.has(property.value.name),
    )
  }
  if (value?.type === 'ArrayExpression') {
    return value.elements.every(
      (element) => element?.type === 'Identifier' && declaredNames.has(element.name),
    )
  }
  return false
}

const isHookDeclaration = (statement) =>
  statement.type === 'VariableDeclaration' &&
  statement.kind === 'const' &&
  statement.declarations.every((declarator) => isHookCall(declarator.init))

const isWrapperBlock = (body) => {
  const statements = body.body
  const lastStatement = statements.at(-1)
  if (lastStatement?.type !== 'ReturnStatement' || !lastStatement.argument) {
    return false
  }
  const declarations = statements.slice(0, -1)
  if (!declarations.every(isHookDeclaration)) {
    return false
  }
  if (declarations.length === 0) {
    return isHookOnlyExpression(lastStatement.argument)
  }
  const declaredNames = new Set(
    declarations.flatMap((statement) =>
      statement.declarations.flatMap((declarator) => collectPatternNames(declarator.id)),
    ),
  )
  return isOnlyDeclaredIdentifiers(lastStatement.argument, declaredNames)
}

export const hookShape = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      tooManyValues: 'Hook returns {{count}} values; max is 4. Split it.',
      wrapperHook: 'Hook only re-exports other hooks. Call them directly where used.',
    },
  },
  create: (context) => {
    const checkFunction = (node) => {
      if (!HOOK_NAME.test(getHookName(node))) {
        return
      }
      if (node.body.type !== 'BlockStatement') {
        if (isHookOnlyExpression(node.body)) {
          context.report({ node: node.body, messageId: 'wrapperHook' })
          return
        }
        const count = countReturnedValues(node.body)
        if (count > MAX_VALUES) {
          context.report({ node: node.body, messageId: 'tooManyValues', data: { count } })
        }
        return
      }
      if (isWrapperBlock(node.body)) {
        context.report({ node, messageId: 'wrapperHook' })
        return
      }
      for (const returned of collectReturns(node.body)) {
        const count = countReturnedValues(returned.argument)
        if (count > MAX_VALUES) {
          context.report({ node: returned, messageId: 'tooManyValues', data: { count } })
        }
      }
    }
    return {
      ArrowFunctionExpression: checkFunction,
      FunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
    }
  },
}
