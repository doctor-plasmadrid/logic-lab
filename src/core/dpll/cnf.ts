export function eliminateImplications(ast: any): any {
  if (!ast) return ast;
  if (ast.type === 'PROPOSITION' || ast.type === 'PREDICATE') return ast;

  if (ast.type === 'NOT') {
     const op = ast.operand || ast.body || ast.expression;
     return { type: 'NOT', operand: eliminateImplications(op) };
  }
  if (ast.type === 'FORALL' || ast.type === 'EXISTS') {
     const op = ast.operand || ast.body || ast.expression;
     const vRaw = ast.variable || ast.name || ast.value || ast.symbol;
     return { type: ast.type, variable: vRaw, operand: eliminateImplications(op) };
  }
  
  if (ast.type === 'IMPLICATION') {
    return { type: 'OR', left: { type: 'NOT', operand: eliminateImplications(ast.left) }, right: eliminateImplications(ast.right) };
  }
  
  if (ast.type === 'BICONDITIONAL') {
    const left = eliminateImplications(ast.left);
    const right = eliminateImplications(ast.right);
    return {
      type: 'AND',
      left: { type: 'OR', left: { type: 'NOT', operand: left }, right: right },
      right: { type: 'OR', left: left, right: { type: 'NOT', operand: right } }
    };
  }

  if (ast.left && ast.right) {
    return { type: ast.type, left: eliminateImplications(ast.left), right: eliminateImplications(ast.right) };
  }

  return ast;
}

export function pushNegations(ast: any): any {
  if (!ast) return ast;
  if (ast.type === 'PROPOSITION' || ast.type === 'PREDICATE') return ast;
  
  if (ast.type === 'NOT') {
    const op = ast.operand || ast.body || ast.expression;
    if (!op) return ast;
    
    if (op.type === 'NOT') {
       const nestedOp = op.operand || op.body || op.expression;
       return pushNegations(nestedOp);
    }
    
    if (op.type === 'AND') { 
      return { type: 'OR', left: pushNegations({ type: 'NOT', operand: op.left }), right: pushNegations({ type: 'NOT', operand: op.right }) };
    }
    if (op.type === 'OR') { 
      return { type: 'AND', left: pushNegations({ type: 'NOT', operand: op.left }), right: pushNegations({ type: 'NOT', operand: op.right }) };
    }

    if (op.type === 'FORALL') {
      const vRaw = op.variable || op.name || op.value || op.symbol;
      const nestedOp = op.operand || op.body || op.expression;
      return { type: 'EXISTS', variable: vRaw, operand: pushNegations({ type: 'NOT', operand: nestedOp }) };
    }
    if (op.type === 'EXISTS') {
      const vRaw = op.variable || op.name || op.value || op.symbol;
      const nestedOp = op.operand || op.body || op.expression;
      return { type: 'FORALL', variable: vRaw, operand: pushNegations({ type: 'NOT', operand: nestedOp }) };
    }

    return { type: 'NOT', operand: pushNegations(op) };
  }

  if (ast.type === 'FORALL' || ast.type === 'EXISTS') {
    const op = ast.operand || ast.body || ast.expression;
    const vRaw = ast.variable || ast.name || ast.value || ast.symbol;
    return { type: ast.type, variable: vRaw, operand: pushNegations(op) };
  }

  if (ast.left && ast.right) {
    return { type: ast.type, left: pushNegations(ast.left), right: pushNegations(ast.right) };
  }

  return ast;
}

export function getClauses(ast: any): any[] {
  if (!ast) return [];
  if (ast.type === 'AND') {
    return [...getClauses(ast.left), ...getClauses(ast.right)];
  }
  return [ast];
}

export function getLiterals(node: any): any[] {
  if (!node) return [];
  const name = node.name || node.value || node.identifier || '';
  if (node.type === 'PROPOSITION' || node.type === 'PREDICATE') return [{ name: name, isPositive: true }];
  
  if (node.type === 'NOT') {
    const op = node.operand || node.body || node.expression;
    if (op && (op.type === 'PROPOSITION' || op.type === 'PREDICATE')) {
      return [{ name: op.name || op.value || op.identifier || '', isPositive: false }];
    }
  }
  if (node.type === 'OR') return [...getLiterals(node.left), ...getLiterals(node.right)];
  return [];
}

export function astToString(ast: any): string {
  if (!ast) return '';
  if (typeof ast === 'string') return ast;
  
  const name = ast.name || ast.value || ast.identifier || ast.symbol || '';

  if (ast.type === 'PROPOSITION') return name;
  if (ast.type === 'VARIABLE' || ast.type === 'CONSTANT' || ast.type === 'TERM') return name || ast.variable || '';
  
  if (ast.type === 'NOT') {
    const op = ast.operand || ast.body || ast.expression;
    if (op && (op.type === 'AND' || op.type === 'OR' || op.type === 'IMPLICATION' || op.type === 'BICONDITIONAL')) {
      return `¬(${astToString(op)})`;
    }
    return `¬${astToString(op)}`;
  }

  if (ast.type === 'PREDICATE' || ast.type === 'FUNCTION') {
    const args = ast.args || ast.arguments || ast.terms;
    if (args && Array.isArray(args) && args.length > 0) {
      return `${name}(${args.map((a: any) => astToString(a)).join(',')})`;
    }
    return name;
  }

  if (ast.type === 'FORALL' || ast.type === 'EXISTS') {
    const vRaw = ast.variable || ast.name || ast.value || ast.symbol;
    const vName = typeof vRaw === 'string' ? vRaw : (vRaw?.name || vRaw?.value || vRaw?.identifier || '');
    const op = ast.operand || ast.body || ast.expression;
    
    const opStr = astToString(op);
    if (opStr.startsWith('(')) {
      return `${ast.type === 'FORALL' ? '∀' : '∃'}${vName}${opStr}`;
    }
    return `${ast.type === 'FORALL' ? '∀' : '∃'}${vName} ${opStr}`;
  }

  if (ast.left && ast.right) {
    const symbols: Record<string, string> = { 'AND': '∧', 'OR': '∨', 'IMPLICATION': '⇒', 'BICONDITIONAL': '⇔' };
    const operator = symbols[ast.type];
    if (operator) return `(${astToString(ast.left)} ${operator} ${astToString(ast.right)})`;
  }

  return '';
}

export interface Literal {
  name: string;
  isPositive: boolean;
}