import { Token, TokenType, ASTNode, TermNode } from './types';

type SymbolDictionary = Record<string, 'FUNCTION' | 'PREDICATE' | 'CONSTANT' | 'VARIABLE'>;

export class LogicParser {
  private tokens: Token[];
  private current: number = 0;
  private dictionary: SymbolDictionary;

  constructor(tokens: Token[], logicMode: 'PROPOSICIONAL' | 'LPO', dictionary: SymbolDictionary = {}) {
    this.tokens = tokens;
    this.dictionary = dictionary;
  }

  private peek(): Token | null {
    return this.tokens[this.current] || null;
  }

  private consume(): Token {
    const token = this.tokens[this.current++];
    if (!token) throw new Error("Se alcanzó el final de la fórmula inesperadamente.");
    return token;
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.type === type && (value === undefined || token.value === value)) {
      this.consume();
      return true;
    }
    return false;
  }

  public parse(): ASTNode {
    return this.parseBiconditional();
  }

  private parseBiconditional(): ASTNode {
    let left = this.parseImplication();
    while (this.match('OPERATOR', '⇔')) {
      left = { type: 'BICONDITIONAL', left, right: this.parseImplication() };
    }
    return left;
  }

  private parseImplication(): ASTNode {
    let left = this.parseOr();
    if (this.match('OPERATOR', '⇒')) {
      left = { type: 'IMPLICATION', left, right: this.parseImplication() };
    }
    return left;
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.match('OPERATOR', '∨')) {
      left = { type: 'OR', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parsePrimary();
    while (this.match('OPERATOR', '∧')) {
      left = { type: 'AND', left, right: this.parsePrimary() };
    }
    return left;
  }

  private parsePrimary(): ASTNode {
    const token = this.peek();
    if (!token) throw new Error("Se esperaba una expresión.");

    if (this.match('PAREN_OPEN')) {
      const expr = this.parse();
      if (!this.match('PAREN_CLOSE')) throw new Error("Falta cerrar paréntesis ')'.");
      return expr;
    }

    if (this.match('OPERATOR', '¬')) {
      return { type: 'NOT', operand: this.parsePrimary() };
    }

    if (token.value === '∀' || token.value === '∃') {
      const quantifier = this.consume();
      const varToken = this.consume();
      
      if (varToken.type !== 'IDENTIFIER') {
        throw new Error(`Se esperaba una variable después de ${quantifier.value}`);
      }
      
      const operand = this.parsePrimary(); 
      return { 
        type: quantifier.value === '∀' ? 'FORALL' : 'EXISTS', 
        variable: varToken.value, 
        operand 
      };
    }

    if (token.type === 'IDENTIFIER') {
      this.consume();

      if (this.match('PAREN_OPEN')) {
        const args: TermNode[] = [];
        
        if (this.peek()?.type !== 'PAREN_CLOSE') {
          do {
            args.push(this.parseTerm());
          } while (this.match('COMMA'));
        }
        
        if (!this.match('PAREN_CLOSE')) throw new Error(`Falta ')' en el predicado ${token.value}`);
        return { type: 'PREDICATE', name: token.value, args };
      }

      return { type: 'PROPOSITION', name: token.value };
    }

    throw new Error(`Símbolo inesperado: ${token.value}`);
  }

  private parseTerm(): TermNode {
    const token = this.consume();
    
    if (token.type !== 'IDENTIFIER') {
      throw new Error(`Se esperaba una variable, constante o función, pero se encontró: ${token.value}`);
    }

    const semanticType = this.dictionary[token.value] || 'VARIABLE';

    if (this.match('PAREN_OPEN')) {
      const args: TermNode[] = [];
      if (this.peek()?.type !== 'PAREN_CLOSE') {
        do {
          args.push(this.parseTerm());
        } while (this.match('COMMA'));
      }
      if (!this.match('PAREN_CLOSE')) throw new Error(`Falta ')' en la función ${token.value}`);
      return { type: 'FUNCTION', name: token.value, args };
    }

    if (semanticType === 'CONSTANT') {
      return { type: 'CONSTANT', name: token.value };
    }
    
    return { type: 'VARIABLE', name: token.value };
  }
}