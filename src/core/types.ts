export type TokenType = 'OPERATOR' | 'IDENTIFIER' | 'PAREN_OPEN' | 'PAREN_CLOSE' | 'COMMA';

export interface Token {
  type: TokenType;
  value: string;
}

export type ASTNode =
  | { type: 'PROPOSITION'; name: string }
  | { type: 'NOT'; operand: ASTNode }
  | { type: 'AND' | 'OR' | 'IMPLICATION' | 'BICONDITIONAL'; left: ASTNode; right: ASTNode }
  
  | { type: 'FORALL' | 'EXISTS'; variable: string; operand: ASTNode }
  | { type: 'PREDICATE'; name: string; args: TermNode[] };

export type TermNode =
  | { type: 'VARIABLE'; name: string }
  | { type: 'CONSTANT'; name: string }
  | { type: 'FUNCTION'; name: string; args: TermNode[] };

export function isBinaryNode(node: ASTNode): node is ASTNode & { left: ASTNode; right: ASTNode } {
  return ['AND', 'OR', 'IMPLICATION', 'BICONDITIONAL'].includes(node.type);
}