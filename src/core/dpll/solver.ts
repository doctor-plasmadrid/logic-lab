import { Literal } from './cnf';

export type Clause = Literal[];

export interface DPLLStep {
  type: 'INIT' | 'UNIT_PROPAGATION' | 'PURE_LITERAL' | 'SPLIT' | 'BACKTRACK' | 'SUCCESS' | 'FAIL';
  message: string;
  clausesStr: string;
  clauses: Clause[];
  assignment: Record<string, boolean>;
  actionLiteral?: Literal;
}

function formatClauses(clauses: Clause[]): string {
  if (clauses.length === 0) return "∅ (Vacío - ¡Satisfacible!)";
  if (clauses.some(c => c.length === 0)) return "{ □ } (Cláusula Vacía - Insatisfacible)";
  return "{ " + clauses.map(c => "{" + c.map(l => (l.isPositive ? "" : "¬") + l.name).join(" ∨ ") + "}").join(", ") + " }";
}

const isSame = (l1: Literal, l2: Literal) => l1.name === l2.name && l1.isPositive === l2.isPositive;
const isOpposite = (l1: Literal, l2: Literal) => l1.name === l2.name && l1.isPositive !== l2.isPositive;

export function solveDPLL(initialClauses: Clause[]): { isSatisfiable: boolean, steps: DPLLStep[], finalModel: Record<string, boolean> | null } {
  const steps: DPLLStep[] = [];
  
  steps.push({
    type: 'INIT',
    message: 'Iniciando DPLL con el conjunto de cláusulas FNC.',
    clausesStr: formatClauses(initialClauses),
    clauses: initialClauses.map(c => [...c]),
    assignment: {}
  });

  function dpll(clauses: Clause[], assignment: Record<string, boolean>, depth: number): boolean {
    if (clauses.length === 0) {
      steps.push({ type: 'SUCCESS', message: '¡No quedan cláusulas! El conjunto es SATISFACIBLE.', clausesStr: '∅', clauses: [], assignment });
      return true;
    }

    if (clauses.some(c => c.length === 0)) {
      steps.push({ type: 'FAIL', message: 'Se halló la cláusula vacía (□). Rama INSATISFACIBLE.', clausesStr: formatClauses(clauses), clauses: clauses.map(c => [...c]), assignment });
      return false;
    }

    let currentClauses = clauses.map(c => [...c]);
    let currentAssig = { ...assignment };
    let changed = true;

    while (changed) {
      changed = false;
      const unitClause = currentClauses.find(c => c.length === 1);
      
      if (unitClause) {
        const unitLiteral = unitClause[0];
        currentAssig[unitLiteral.name] = unitLiteral.isPositive;
        
        steps.push({
          type: 'UNIT_PROPAGATION',
          message: `Propagación Unitaria: Asignamos ${unitLiteral.isPositive ? '' : '¬'}${unitLiteral.name} = Verdadero.`,
          clausesStr: formatClauses(currentClauses),
          clauses: currentClauses.map(c => [...c]),
          assignment: { ...currentAssig },
          actionLiteral: unitLiteral
        });

        currentClauses = currentClauses
          .filter(c => !c.some(l => isSame(l, unitLiteral)))
          .map(c => c.filter(l => !isOpposite(l, unitLiteral)));
        changed = true; continue;
      }

      const allLiterals = currentClauses.flat();
      const pureLiteral = allLiterals.find(lit => !allLiterals.some(other => isOpposite(lit, other)));

      if (pureLiteral) {
        currentAssig[pureLiteral.name] = pureLiteral.isPositive;
        steps.push({
          type: 'PURE_LITERAL',
          message: `Literal Puro: ${pureLiteral.isPositive ? '' : '¬'}${pureLiteral.name}. Asignamos Verdadero.`,
          clausesStr: formatClauses(currentClauses),
          clauses: currentClauses.map(c => [...c]),
          assignment: { ...currentAssig },
          actionLiteral: pureLiteral
        });

        currentClauses = currentClauses.filter(c => !c.some(l => isSame(l, pureLiteral)));
        changed = true;
      }
    }

    if (currentClauses.length === 0) {
      steps.push({ type: 'SUCCESS', message: 'Conjunto simplificado al vacío. ¡SATISFACIBLE!', clausesStr: '∅', clauses: [], assignment: currentAssig });
      return true;
    }
    if (currentClauses.some(c => c.length === 0)) {
      steps.push({ type: 'FAIL', message: 'Una cláusula se vació. Rama INSATISFACIBLE.', clausesStr: formatClauses(currentClauses), clauses: currentClauses.map(c => [...c]), assignment: currentAssig });
      return false;
    }

    const splitLiteral = currentClauses[0][0];
    steps.push({
      type: 'SPLIT',
      message: `Bifurcación: Asumimos ${splitLiteral.isPositive ? '' : '¬'}${splitLiteral.name} = Verdadero.`,
      clausesStr: formatClauses(currentClauses),
      clauses: currentClauses.map(c => [...c]),
      assignment: { ...currentAssig },
      actionLiteral: splitLiteral
    });

    const assumeTrueClauses = [...currentClauses, [splitLiteral]];
    if (dpll(assumeTrueClauses, currentAssig, depth + 1)) return true;

    const oppositeLiteral: Literal = { name: splitLiteral.name, isPositive: !splitLiteral.isPositive };
    steps.push({
      type: 'BACKTRACK',
      message: `Backtrack: Asumimos lo contrario (¬${splitLiteral.isPositive ? '' : '¬'}${splitLiteral.name}).`,
      clausesStr: formatClauses(currentClauses),
      clauses: currentClauses.map(c => [...c]),
      assignment: { ...currentAssig },
      actionLiteral: oppositeLiteral
    });
    
    return dpll([...currentClauses, [oppositeLiteral]], currentAssig, depth + 1);
  }

  const result = dpll(initialClauses, {}, 0);
  return { isSatisfiable: result, steps: steps, finalModel: result ? steps[steps.length - 1].assignment : null };
}

export function formatSingleClause(c: Clause): string {
  if (c.length === 0) return '□';
  return '{ ' + c.map(l => (l.isPositive ? '' : '¬') + l.name).join(' ∨ ') + ' }';
}

export function resolveClauses(c1: Clause, c2: Clause): { resolvent: Clause, resolvedLiteral: string } | null {
  for (const l1 of c1) {
    const oppIndex = c2.findIndex(l2 => l2.name === l1.name && l2.isPositive !== l1.isPositive);
    
    if (oppIndex !== -1) {
      const l2 = c2[oppIndex];
      
      const res = [
        ...c1.filter(l => l !== l1),
        ...c2.filter(l => l !== l2)
      ];
      
      const uniqueRes = res.filter((val, idx, arr) => 
        arr.findIndex(v => v.name === val.name && v.isPositive === val.isPositive) === idx
      );
      
      return { resolvent: uniqueRes, resolvedLiteral: l1.name };
    }
  }
  return null;
}