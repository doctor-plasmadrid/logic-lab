import { eliminateImplications, pushNegations } from '../dpll/cnf';

function getVarName(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.name || v.value || '';
}

export function isQuantifierFree(node: any): boolean {
  if (!node) return true;
  if (node.type === 'PROPOSITION' || node.type === 'PREDICATE') return true;
  if (node.type === 'NOT') {
    const op = node.operand || node.body || node.expression;
    return isQuantifierFree(op);
  }
  if (node.left && node.right) return isQuantifierFree(node.left) && isQuantifierFree(node.right);
  return false; 
}

export function isStrictSkolemForm(node: any): boolean {
  if (!node) return false;
  if (node.type === 'FORALL') {
    const op = node.operand || node.body || node.expression;
    return isStrictSkolemForm(op);
  }
  if (node.type === 'EXISTS') return false;
  return isQuantifierFree(node);
}

function getUsedNames(node: any, used: Set<string>) {
  if (!node) return;
  if (node.name || node.value) used.add(node.name || node.value);
  if (node.variable) {
    const vName = getVarName(node.variable);
    if (vName) used.add(vName);
  }
  if (node.left) getUsedNames(node.left, used);
  if (node.right) getUsedNames(node.right, used);
  
  const op = node.operand || node.body || node.expression;
  if (op) getUsedNames(op, used);
  
  const args = node.args || node.arguments || node.terms;
  if (args) args.forEach((arg: any) => getUsedNames(arg, used));
}

const fallbackLower = "abcdefghijklmnopqrstuvwxyz".split("");
const fallbackUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function getFreeName(preferred: string[], used: Set<string>): string {
  for (const c of preferred) {
    if (!used.has(c)) { used.add(c); return c; }
  }
  for (const c of fallbackLower) {
    if (!used.has(c)) { used.add(c); return c; }
  }
  for (const c of fallbackUpper) {
    if (!used.has(c)) { used.add(c); return c; }
  }
  return "w"; 
}

export function toSkolem(ast: any): any {
  let current = pushNegations(eliminateImplications(ast));
  const quantifiers: { type: 'FORALL' | 'EXISTS', variable: string, originalVarNode: any }[] = [];
  
  const usedNames = new Set<string>();
  getUsedNames(current, usedNames);

  function extractQuantifiers(node: any): any {
    if (!node) return node;
    if (node.type === 'FORALL' || node.type === 'EXISTS') {
      const vName = getVarName(node.variable);
      const op = node.operand || node.body || node.expression;
      quantifiers.push({ type: node.type, variable: vName, originalVarNode: node.variable || vName });
      return extractQuantifiers(op);
    }
    if (node.left && node.right) {
      return { ...node, left: extractQuantifiers(node.left), right: extractQuantifiers(node.right) };
    }
    if (node.type === 'NOT') {
      const op = node.operand || node.body || node.expression;
      return { ...node, operand: extractQuantifiers(op) };
    }
    return node;
  }

  let matrix = extractQuantifiers(current);

  const foralls: string[] = [];
  const forallNodes: any[] = [];
  const substitutions: Record<string, any> = {};

  const preferredConsts = ['a','b','c','d','e'];
  const preferredFuncs = ['f','g','h','i','j','k','l','m','í','ì'];

  for (const q of quantifiers) {
    if (q.type === 'FORALL') {
      foralls.push(q.variable);
      forallNodes.push(q.originalVarNode);
    } else if (q.type === 'EXISTS') {
      if (foralls.length === 0) {
        const cName = getFreeName(preferredConsts, usedNames);
        substitutions[q.variable] = { type: 'CONSTANT', name: cName };
      } else {
        const fName = getFreeName(preferredFuncs, usedNames);
        substitutions[q.variable] = { 
          type: 'FUNCTION', 
          name: fName,
          args: foralls.map(v => ({ type: 'VARIABLE', name: v })) 
        };
      }
    }
  }

  function applySub(node: any): any {
    if (!node) return node;
    
    if (node.type === 'VARIABLE') {
       const vName = getVarName(node);
       if (substitutions[vName]) return substitutions[vName];
       return node;
    }
    
    if (node.type === 'PREDICATE' || node.type === 'FUNCTION') {
      const args = node.args || node.arguments || node.terms;
      if (args) return { ...node, args: args.map(applySub) };
      return node;
    }
    
    if (node.left && node.right) return { ...node, left: applySub(node.left), right: applySub(node.right) };
    
    if (node.type === 'NOT' || node.type === 'FORALL' || node.type === 'EXISTS') {
       const op = node.operand || node.body || node.expression;
       return { ...node, operand: applySub(op) };
    }
    
    return node;
  }

  matrix = applySub(matrix);

  let result = matrix;
  for (let i = foralls.length - 1; i >= 0; i--) {
    result = { type: 'FORALL', variable: forallNodes[i], operand: result };
  }

  return result;
}

export function toCNF(node: any): any {
  if (!node) return node;
  if (node.type === 'PROPOSITION' || node.type === 'PREDICATE' || node.type === 'NOT') return node;
  
  if (node.type === 'AND') {
      return { type: 'AND', left: toCNF(node.left), right: toCNF(node.right) };
  }
  
  if (node.type === 'OR') {
      let left = toCNF(node.left);
      let right = toCNF(node.right);
      
      if (left.type === 'AND') {
          return toCNF({ type: 'AND', left: { type: 'OR', left: left.left, right }, right: { type: 'OR', left: left.right, right } });
      }
      if (right.type === 'AND') {
          return toCNF({ type: 'AND', left: { type: 'OR', left, right: right.left }, right: { type: 'OR', left, right: right.right } });
      }
      return { type: 'OR', left, right };
  }
  return node;
}