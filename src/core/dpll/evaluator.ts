import { ASTNode } from '../types';

export function getVariables(ast: ASTNode): string[] {
  const vars = new Set<string>();
  
  function traverse(node: ASTNode) {
    if (node.type === 'PROPOSITION') {
      vars.add(node.name);
    } else if (node.type === 'NOT') {
      traverse(node.operand);
    } else if ('left' in node && 'right' in node) {
      traverse(node.left);
      traverse(node.right);
    }
  }
  
  traverse(ast);
  return Array.from(vars);
}

export function evaluateAST(ast: ASTNode, assignment: Record<string, boolean>): boolean {
  switch (ast.type) {
    case 'PROPOSITION':
      return assignment[ast.name];
    case 'NOT':
      return !evaluateAST(ast.operand, assignment);
    case 'AND':
      return evaluateAST(ast.left, assignment) && evaluateAST(ast.right, assignment);
    case 'OR':
      return evaluateAST(ast.left, assignment) || evaluateAST(ast.right, assignment);
    case 'IMPLICATION':
      return !evaluateAST(ast.left, assignment) || evaluateAST(ast.right, assignment);
    case 'BICONDITIONAL':
      return evaluateAST(ast.left, assignment) === evaluateAST(ast.right, assignment);
    default:
      throw new Error("Nodo AST desconocido");
  }
}

export function areLogicallyEquivalent(ast1: ASTNode, ast2: ASTNode): boolean {
  const vars1 = getVariables(ast1);
  const vars2 = getVariables(ast2);
  
  const allVars = Array.from(new Set([...vars1, ...vars2]));
  const numVars = allVars.length;
  const numAssignments = 1 << numVars;

  for (let i = 0; i < numAssignments; i++) {
    const assignment: Record<string, boolean> = {};
    
    for (let j = 0; j < numVars; j++) {
      assignment[allVars[j]] = (i & (1 << j)) !== 0;
    }

    const result1 = evaluateAST(ast1, assignment);
    const result2 = evaluateAST(ast2, assignment);

    if (result1 !== result2) {
      return false;
    }
  }

  return true;
}


export function isStrictCNF(ast: ASTNode): boolean {
  if (ast.type === 'IMPLICATION' || ast.type === 'BICONDITIONAL') return false;

  if (ast.type === 'AND') {
    return isStrictCNF(ast.left) && isStrictCNF(ast.right);
  }

  function isClause(node: ASTNode): boolean {
    if (node.type === 'PROPOSITION') return true;
    if (node.type === 'NOT') return node.operand.type === 'PROPOSITION';
    if (node.type === 'OR') return isClause(node.left) && isClause(node.right);
    return false;
  }

  return isClause(ast);
}