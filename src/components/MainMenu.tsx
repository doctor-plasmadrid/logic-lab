import React, { useState, useEffect } from 'react';
import { ASTNode } from '../core/types';
import { tokenize } from '../core/lexer';
import { LogicParser } from '../core/parser';
import { eliminateImplications, pushNegations, astToString, getClauses, getLiterals } from '../core/dpll/cnf';
import { solveDPLL, DPLLStep, Clause, formatSingleClause, resolveClauses } from '../core/dpll/solver';
import { areLogicallyEquivalent } from '../core/dpll/evaluator';
import { isStrictSkolemForm, isQuantifierFree, toSkolem, toCNF } from '../core/lpo/skolem';
import { resolveLPO } from '../core/lpo/unifier';
import { useLanguage } from '../LanguageContext';

type SymbolType = 'FUNCTION' | 'PREDICATE' | 'CONSTANT' | 'VARIABLE';
type SymbolDictionary = Record<string, SymbolType>;

const LOGIC_THEME = {
  bg: '#1a1b26', panel: '#24283b', text: '#c0caf5', accent: '#bb9af7',
  constant: '#ff9e64', variable: '#9ece6a', function: '#7aa2f7',
  predicate: '#e0af68', operator: '#f7768e',
};

const getDefaultType = (char: string): SymbolType | null => {
  if (!/^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜàèìòùÀÈÌÒÙ]$/.test(char)) return null;
  if (char === char.toUpperCase()) return 'PREDICATE';

  const normalized = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const code = normalized.charCodeAt(0);

  if (code >= 97 && code <= 101) return 'CONSTANT'; // a-e
  if (code >= 102 && code <= 109) return 'FUNCTION';  // f-m
  return 'VARIABLE';                                 // n-z
};

export default function MainMenu() {
  const { language, setLanguage, t } = useLanguage();
  const [logicMode, setLogicMode] = useState<'PROPOSICIONAL' | 'LPO'>('PROPOSICIONAL');
  const [formulas, setFormulas] = useState<string[]>(['']);
  const [asts, setAsts] = useState<(ASTNode | null)[]>([]);
  const [dictionary, setDictionary] = useState<SymbolDictionary>({});
  const [activeInput, setActiveInput] = useState<{ section: 'formula' | 'practice' | 'lpo', index: number }>({ section: 'formula', index: 0 });

  const [practiceActiveFormula, setPracticeActiveFormula] = useState<number>(0);
  const [practiceSubclauses, setPracticeSubclauses] = useState<string[]>(['']);
  const [practiceFeedback, setPracticeFeedback] = useState<'IDLE' | 'CORRECT_SUB' | 'CORRECT_ALL' | 'INCORRECT' | 'INCORRECT_FORMAT' | 'SYNTAX_ERROR' | 'SHOW_SOLUTION'>('IDLE');
  const [validatedClauses, setValidatedClauses] = useState<string[]>([]);
  const [hornAnswer, setHornAnswer] = useState<{ isHorn: boolean, explanation: string } | null>(null);
  const [hornFeedback, setHornFeedback] = useState<'IDLE' | 'CORRECT' | 'INCORRECT' | 'SHOW'>('IDLE');
  const [activeAlgorithm, setActiveAlgorithm] = useState<'DPLL' | 'LINEAR' | null>(null);
  
  const [dpllTrace, setDpllTrace] = useState<DPLLStep[] | null>(null);
  const [dpllGameMode, setDpllGameMode] = useState<'INTERACTIVE' | 'SHOW_ALL'>('INTERACTIVE');
  const [dpllStepIndex, setDpllStepIndex] = useState<number>(0);
  const [dpllPendingLiteralRule, setDpllPendingLiteralRule] = useState<DPLLStep['type'] | null>(null);
  const [dpllMinigameFeedback, setDpllMinigameFeedback] = useState<string | null>(null);

  const [linearBaseClauses, setLinearBaseClauses] = useState<Clause[]>([]);
  const [linearHead, setLinearHead] = useState<Clause | null>(null);
  const [linearHistory, setLinearHistory] = useState<{ left: Clause, right: Clause, resolvent: Clause, lit: string }[]>([]);
  const [linearFeedback, setLinearFeedback] = useState<string | null>(null);
  const [linearStatus, setLinearStatus] = useState<'IDLE' | 'PLAYING' | 'SUCCESS' | 'FAIL'>('IDLE');

  const [lpoPhase, setLpoPhase] = useState<'IDLE' | 'SKOLEM' | 'CLAUSAL' | 'LINEAR'>('IDLE');
  const [lpoActiveFormula, setLpoActiveFormula] = useState<number>(0);
  const [lpoInputs, setLpoInputs] = useState<string[]>(['']);
  const [lpoFeedback, setLpoFeedback] = useState<string | null>(null);
  const [lpoSkolemFormulas, setLpoSkolemFormulas] = useState<string[]>([]);
  const [lpoClausalFormulas, setLpoClausalFormulas] = useState<string[]>([]);

  const [lpoLinearHead, setLpoLinearHead] = useState<string | null>(null);
  const [lpoLinearTarget, setLpoLinearTarget] = useState<string | null>(null);
  const [lpoSubstitution1, setLpoSubstitution1] = useState<string>('');
  const [lpoSubstitution2, setLpoSubstitution2] = useState<string>('');
  const [lpoLinearHistory, setLpoLinearHistory] = useState<{ left: string, right: string, resolvent: string, theta1: string, theta2: string }[]>([]);

  const resetPractice = () => {
    setPracticeActiveFormula(0); setPracticeSubclauses(['']); setPracticeFeedback('IDLE');
    setValidatedClauses([]); setHornAnswer(null); setHornFeedback('IDLE');
    setActiveAlgorithm(null); setDpllTrace(null); resetLinearGame();
    
    setLpoPhase('IDLE'); setLpoActiveFormula(0); setLpoInputs(['']); setLpoSkolemFormulas([]); setLpoClausalFormulas([]);
    setLpoLinearHead(null); setLpoLinearTarget(null); setLpoSubstitution1(''); setLpoSubstitution2(''); setLpoLinearHistory([]); setLpoFeedback(null);
  };

  const handleModeChange = (mode: 'PROPOSICIONAL' | 'LPO') => {
    setLogicMode(mode); setFormulas(['']); resetPractice();
  };

  useEffect(() => {
    if (logicMode === 'PROPOSICIONAL') {
      setDictionary({});
      return;
    }
    
    const allText = formulas.join('') + practiceSubclauses.join('') + lpoInputs.join('') + lpoSkolemFormulas.join('') + lpoClausalFormulas.join('');
    
    const letters = new Set<string>();
    for (const char of allText) if (/^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜàèìòùÀÈÌÒÙ]$/.test(char)) letters.add(char);

    setDictionary((prev) => {
      const updated = { ...prev }; let changed = false;
      letters.forEach((l) => { if (!updated[l]) { const def = getDefaultType(l); if (def) { updated[l] = def; changed = true; } } });
      Object.keys(updated).forEach((l) => { if (!letters.has(l)) { delete updated[l]; changed = true; } });
      return changed ? updated : prev;
    });
  }, [formulas, practiceSubclauses, lpoInputs, lpoSkolemFormulas, lpoClausalFormulas, logicMode]);

  useEffect(() => {
    setAsts(formulas.map((f, i) => { 
      if (!f.trim()) return null; 
      try { 
        const tokens = tokenize(f);
        const parsedAst = new LogicParser(tokens, logicMode, dictionary).parse(); 
        return parsedAst;
      } catch (error) { 
        console.error(`[LogicParser] Error al leer la premisa α${i + 1}:`, error);
        return null; 
      } 
    }));
  }, [formulas, logicMode, dictionary]);

  const applyShortcuts = (val: string) => {
    let newVal = val.replace(/!!|:not/g, '¬').replace(/\+\+|\|\||:or/g, '∨').replace(/\*\*|&&|:and/g, '∧').replace(/-->|->|:imp/g, '⇒').replace(/<->|<>|:bic/g, '⇔');
    if (logicMode === 'LPO') newVal = newVal.replace(/\{\}|:all/g, '∀').replace(/\[\]|:exi/g, '∃');
    return newVal;
  };

  const insertSymbol = (sym: string) => {
    if (activeInput.section === 'formula') { const newF = [...formulas]; newF[activeInput.index] += sym; setFormulas(newF); }
    else if (activeInput.section === 'practice') { const newS = [...practiceSubclauses]; newS[activeInput.index] += sym; setPracticeSubclauses(newS); }
    else if (activeInput.section === 'lpo') { const newL = [...lpoInputs]; newL[activeInput.index] += sym; setLpoInputs(newL); }
  };

  const generateRandomSigma = () => {
    const numPremises = Math.floor(Math.random() * 8) + 2;
    let newFormulas: string[] = [];

    if (logicMode === 'PROPOSICIONAL') {
      const pVars = ['P', 'Q', 'R', 'S', 'T'];
      const getVar = () => pVars[Math.floor(Math.random() * pVars.length)];
      const type = Math.floor(Math.random() * 3);

      if (type === 0) {
        const tpls = ['V ∨ ¬V', '(V ∧ W) ⇒ V', 'V ⇒ (V ∨ W)', '¬(V ∧ ¬V)'];
        for (let i = 0; i < numPremises; i++) {
          let t = tpls[Math.floor(Math.random() * tpls.length)];
          newFormulas.push(t.replace(/V/g, getVar()).replace(/W/g, getVar()));
        }
      } else if (type === 1) {
        const v1 = getVar(); const v2 = getVar();
        newFormulas.push(v1); 
        newFormulas.push(`${v1} ⇒ ${v2}`); 
        newFormulas.push(`¬${v2}`);
        while (newFormulas.length < numPremises) {
          newFormulas.push(`${Math.random() > 0.5 ? '¬' : ''}${getVar()} ∨ ${getVar()}`);
        }
        if (numPremises === 2) newFormulas = [v1, `¬${v1}`];
      } else {
        for (let i = 0; i < numPremises; i++) {
          newFormulas.push(`${Math.random() > 0.5 ? '¬' : ''}${getVar()} ∨ ${getVar()}`);
        }
      }
    } else {
      const lpoPreds = ['P', 'Q', 'R'];
      const lpoConsts = ['a', 'b', 'c'];
      const getPred = () => lpoPreds[Math.floor(Math.random() * lpoPreds.length)];
      const getConst = () => lpoConsts[Math.floor(Math.random() * lpoConsts.length)];

      const type = Math.floor(Math.random() * 2);
      const p1 = getPred(); const p2 = getPred(); const c1 = getConst();

      if (type === 1) {
        newFormulas.push(`∀x (${p1}(x) ⇒ ${p2}(x))`);
        newFormulas.push(`${p1}(${c1})`);
        newFormulas.push(`¬${p2}(${c1})`);
        while (newFormulas.length < numPremises) newFormulas.push(`∃y ${getPred()}(y)`);
        if (numPremises === 2) newFormulas = [`∀x ${p1}(x)`, `¬${p1}(${c1})`]; 
      } else {
        newFormulas.push(`∀x (${p1}(x) ⇒ ${p2}(x))`);
        newFormulas.push(`${p1}(${c1})`);
        newFormulas.push(`${p2}(${c1})`);
        while (newFormulas.length < numPremises) newFormulas.push(`∀z (${getPred()}(z) ∨ ¬${getPred()}(z))`);
        if (numPremises === 2) newFormulas = [`∀x ${p1}(x)`, `${p1}(${c1})`];
      }
    }

    setFormulas(newFormulas.slice(0, numPremises));
    resetPractice();
  };

  const showFncSolution = () => {
    const activeAst = asts[practiceActiveFormula];
    if (!activeAst) return;
    try {
      const fncAst = toCNF(pushNegations(eliminateImplications(activeAst)));
      const targetClauses = getClauses(fncAst);
      setPracticeSubclauses(targetClauses.map(c => astToString(c)));
      setPracticeFeedback('SHOW_SOLUTION');
    } catch (e) { console.error(e); }
  };

  const showLpoSkolemSolution = () => {
    const activeAst = asts[lpoActiveFormula];
    if (!activeAst) {
      setLpoFeedback(t('skolemFatalError'));
      return;
    }

    try {
      const skolemAst = toSkolem(activeAst);
      const solutionText = astToString(skolemAst);

      setLpoInputs([solutionText]);
      setLpoFeedback(t('skolemSolutionAutocompleted'));
    } catch (e) {
      setLpoInputs([""]);
      setLpoFeedback(t('skolemInternalError'));
    }
  };

  const showLpoClausalSolution = () => {
    try {
      let coreAst = new LogicParser(tokenize(lpoSkolemFormulas[lpoActiveFormula]), logicMode, dictionary).parse();

      while (coreAst && coreAst.type === 'FORALL') {
        coreAst = (coreAst as any).operand || (coreAst as any).body || (coreAst as any).expression;
      }

      const fncAst = toCNF(coreAst);
      const targetClauses = getClauses(fncAst);
      setLpoInputs(targetClauses.map(c => astToString(c)));
      setLpoFeedback(t('clausalSolutionAutocompleted'));
    } catch (e) {
      setLpoInputs([`[Error generating clauses]`]);
    }
  };

  const computeHornStatus = (finalClausesText: string[]) => {
    for (const text of finalClausesText) {
      const ast = new LogicParser(tokenize(text), logicMode, dictionary).parse();
      const extractLits = (node: ASTNode): {name: string, isPos: boolean}[] => {
        if (node.type === 'PROPOSITION') return [{name: node.name, isPos: true}];
        if (node.type === 'NOT' && node.operand.type === 'PROPOSITION') return [{name: node.operand.name, isPos: false}];
        if (node.type === 'OR') return [...extractLits(node.left), ...extractLits(node.right)];
        return [];
      };
      const posLiterals = extractLits(ast).filter(l => l.isPos);
      if (posLiterals.length > 1) {
        setHornAnswer({ isHorn: false, explanation: `La cláusula "${text}" tiene ${posLiterals.length} literales positivos: ${posLiterals.map(l=>l.name).join(', ')}.` });
        return;
      }
    }
    setHornAnswer({ isHorn: true, explanation: "Todas las cláusulas del conjunto tienen como máximo 1 literal positivo." });
  };

  const checkSubclauses = () => {
    try {
      const activeAst = asts[practiceActiveFormula];
      if (!activeAst) return;

      let hasFormatError = false; let allFilled = true; const userAsts: ASTNode[] = [];

      for (const text of practiceSubclauses) {
        if (!text.trim()) { allFilled = false; continue; }
        try {
          const parsed = new LogicParser(tokenize(text), logicMode, dictionary).parse();
          userAsts.push(parsed);
          const checkClause = (node: ASTNode): boolean => {
            if (node.type === 'PROPOSITION' || node.type === 'PREDICATE') return true;
            if (node.type === 'NOT' && (node.operand.type === 'PROPOSITION' || node.operand.type === 'PREDICATE')) return true;
            if (node.type === 'OR') return checkClause(node.left) && checkClause(node.right);
            return false;
          };
          if (!checkClause(parsed)) hasFormatError = true;
        } catch { setPracticeFeedback('SYNTAX_ERROR'); return; }
      }

      if (!allFilled) { setPracticeFeedback('INCORRECT'); return; }

      let combinedUserAst = userAsts[0];
      for (let i = 1; i < userAsts.length; i++) combinedUserAst = { type: 'AND', left: combinedUserAst, right: userAsts[i] };

      if (!areLogicallyEquivalent(activeAst, combinedUserAst)) { setPracticeFeedback('INCORRECT'); return; }
      if (hasFormatError) { setPracticeFeedback('INCORRECT_FORMAT'); return; }

      const newValidated = [...validatedClauses, ...practiceSubclauses];
      setValidatedClauses(newValidated);
      
      const validFormulasCount = formulas.filter(f => f.trim() !== '').length;

      if (practiceActiveFormula < validFormulasCount - 1) {
        setPracticeActiveFormula(prev => prev + 1); setPracticeSubclauses(['']); setPracticeFeedback('CORRECT_SUB');
      } else {
        setPracticeFeedback('CORRECT_ALL'); computeHornStatus(newValidated);
      }
    } catch { setPracticeFeedback('SYNTAX_ERROR'); }
  };

  const getExtractedClauses = (): Clause[] => {
    return validatedClauses.map(textClause => { return getLiterals(new LogicParser(tokenize(textClause), logicMode, dictionary).parse()); });
  };

  const executeDPLL = () => {
    setActiveAlgorithm('DPLL'); setDpllTrace(solveDPLL(getExtractedClauses()).steps);
    setDpllStepIndex(0); setDpllGameMode('INTERACTIVE'); setDpllPendingLiteralRule(null); setDpllMinigameFeedback(null);
  };

  const resetDPLLGame = () => {
    setDpllStepIndex(0); setDpllGameMode('INTERACTIVE'); setDpllPendingLiteralRule(null); setDpllMinigameFeedback(null);
  };

  const executeLinear = () => {
    setActiveAlgorithm('LINEAR'); setLinearBaseClauses(getExtractedClauses()); resetLinearGame();
  };

  const resetLinearGame = () => {
    setLinearHead(null); setLinearHistory([]); setLinearFeedback(null); setLinearStatus('PLAYING');
  };

  const handleLinearSelect = (targetClause: Clause) => {
    if (linearStatus !== 'PLAYING') return;
    if (!linearHead) {
      setLinearHead(targetClause); setLinearFeedback(t('headSet')); return;
    }
    const resolution = resolveClauses(linearHead, targetClause);
    if (resolution) {
      const { resolvent, resolvedLiteral } = resolution;
      setLinearHistory([...linearHistory, { left: linearHead, right: targetClause, resolvent, lit: resolvedLiteral }]);
      setLinearHead(resolvent);
      if (resolvent.length === 0) {
        setLinearStatus('SUCCESS'); setLinearFeedback(t('emptyClauseReached'));
      } else { setLinearFeedback(t('continueResolving', { lit: resolvedLiteral })); }
    } else { setLinearFeedback(t('cannotResolve')); }
  };

  const handleGuessRule = (rule: DPLLStep['type']) => {
    if (!dpllTrace) return;
    const nextStep = dpllTrace[dpllStepIndex + 1];
    if (nextStep.type === rule) {
        if (['UNIT_PROPAGATION', 'PURE_LITERAL', 'SPLIT', 'BACKTRACK'].includes(rule)) { setDpllPendingLiteralRule(rule); setDpllMinigameFeedback("✓ Regla correcta. Ahora, ¿sobre qué literal la aplicamos?"); } 
        else { setDpllStepIndex(prev => prev + 1); setDpllMinigameFeedback(null); }
    } else { setDpllMinigameFeedback(`✗ Esa no es la regla prioritaria correcta en este estado.`); }
  };

  const handleGuessLiteral = (litName: string, isPos: boolean) => {
    if (!dpllTrace || !dpllPendingLiteralRule) return;
    
    const currentStep = dpllTrace[dpllStepIndex];
    const nextStep = dpllTrace[dpllStepIndex + 1];
    const clauses = currentStep.clauses;

    let isValid = false;

    if (dpllPendingLiteralRule === 'UNIT_PROPAGATION') {
      isValid = clauses.some(c => c.length === 1 && c[0].name === litName && c[0].isPositive === isPos);
    
    } else if (dpllPendingLiteralRule === 'PURE_LITERAL') {
      const allLits = clauses.flat();
      const hasPos = allLits.some(l => l.name === litName && l.isPositive);
      const hasNeg = allLits.some(l => l.name === litName && !l.isPositive);
      
      if (isPos && hasPos && !hasNeg) isValid = true;
      if (!isPos && hasNeg && !hasPos) isValid = true;
    
    } else if (dpllPendingLiteralRule === 'SPLIT') {
      const allLits = clauses.flat();
      isValid = allLits.some(l => l.name === litName);
    
    } else {
      isValid = (nextStep.actionLiteral?.name === litName && nextStep.actionLiteral?.isPositive === isPos);
    }

    if (isValid) {
      const userLitStr = `${isPos ? '' : '¬'}${litName}`;
      
      if (nextStep.actionLiteral?.name === litName && nextStep.actionLiteral?.isPositive === isPos) {
         setDpllMinigameFeedback(`✓ ¡Excelente! Aplicado sobre el literal ${userLitStr}.`);
      } else {
         const engineLitStr = nextStep.actionLiteral ? `${nextStep.actionLiteral.isPositive ? '' : '¬'}${nextStep.actionLiteral.name}` : '';
         setDpllMinigameFeedback(`✓ ¡Correcto! ${userLitStr} era totalmente válido.`);
      }
      
      setDpllStepIndex(prev => prev + 1); 
      setDpllPendingLiteralRule(null);
    } else {
      setDpllMinigameFeedback(`✗ Incorrecto. El literal ${isPos ? '' : '¬'}${litName} no cumple las condiciones de la regla en este momento.`);
    }
  };

  const getUniqueLiterals = (clauses: Clause[]) => {
    const unique = Array.from(new Set(clauses.flat().map(l => `${l.isPositive ? '+' : '-'}${l.name}`)));
    return unique.map(str => ({ isPositive: str[0] === '+', name: str.slice(1) }));
  };

  const startLpoPractice = () => {
    setLpoPhase('SKOLEM'); setLpoActiveFormula(0); setLpoInputs(['']); setLpoFeedback(null);
  };

  const checkLpoSkolem = () => {
    const userInput = lpoInputs[0];
    if (!userInput.trim()) { setLpoFeedback(t('skolemEmpty')); return; }

    const activeAst = asts[lpoActiveFormula];
    if (!activeAst) {
      setLpoFeedback(t('skolemFatal'));
      return;
    }

    try {
      const userAst = new LogicParser(tokenize(userInput), logicMode, dictionary).parse();

      if (!isStrictSkolemForm(userAst)) {
        setLpoFeedback(t('skolemInvalid'));
        return;
      }

      const expectedAst = toSkolem(activeAst);
      const userStr = astToString(userAst);
      const expectedStr = astToString(expectedAst);

      if (userStr !== expectedStr) {
        setLpoFeedback(t('skolemIncorrect', { expected: expectedStr }));
        return;
      }

      const newSkolemList = [...lpoSkolemFormulas, userStr];
      setLpoSkolemFormulas(newSkolemList);

      const validFormulasCount = formulas.filter(f => f.trim() !== '').length;
      if (lpoActiveFormula < validFormulasCount - 1) {
        setLpoActiveFormula(prev => prev + 1); setLpoInputs(['']); setLpoFeedback(t('skolemCorrect'));
      } else {
        setLpoPhase('CLAUSAL'); setLpoActiveFormula(0); setLpoInputs(['']); setLpoFeedback(t('skolemAllComplete'));
      }
    } catch (e) { setLpoFeedback(t('skolemSyntaxError')); }
  };

  const checkLpoClausal = () => {
    try {
      let coreAst = new LogicParser(tokenize(lpoSkolemFormulas[lpoActiveFormula]), logicMode, dictionary).parse();

      while (coreAst && coreAst.type === 'FORALL') {
         coreAst = (coreAst as any).operand || (coreAst as any).body || (coreAst as any).expression;
      }

      const expectedFncAst = toCNF(coreAst);
      const expectedClausesStrings = getClauses(expectedFncAst).map(c => astToString(c));
      const userClausesStrings: string[] = [];

      for (const input of lpoInputs) {
        if (!input.trim()) { setLpoFeedback(t('fillAllBoxes')); return; }

        const userAst = new LogicParser(tokenize(input), logicMode, dictionary).parse();
        if (!isQuantifierFree(userAst)) { setLpoFeedback(t('clausalInvalid')); return; }

        const checkClause = (node: any): boolean => {
          if (node.type === 'PROPOSITION' || node.type === 'PREDICATE') return true;
          if (node.type === 'NOT') {
            const op = node.operand || node.body || node.expression;
            return op && (op.type === 'PROPOSITION' || op.type === 'PREDICATE');
          }
          if (node.type === 'OR') return checkClause(node.left) && checkClause(node.right);
          return false;
        };

        if (!checkClause(userAst)) {
           setLpoFeedback(t('clausalInvalid2'));
           return;
        }
        userClausesStrings.push(astToString(userAst));
      }

      if (userClausesStrings.length !== expectedClausesStrings.length) {
         setLpoFeedback(t('wrongClauseCount', { count: expectedClausesStrings.length.toString() }));
         return;
      }

      const parseToLiteralSet = (astStr: string) => {
          const ast = new LogicParser(tokenize(astStr), logicMode, dictionary).parse();
          return getLiterals(ast).map(l => (l.isPositive ? '+' : '-') + (l.name || l.value)).sort().join(',');
      };

      const expectedSets = expectedClausesStrings.map(parseToLiteralSet).sort();
      const userSets = userClausesStrings.map(parseToLiteralSet).sort();

      if (expectedSets.join('|') !== userSets.join('|')) {
          setLpoFeedback(t('clausesIncorrect'));
          return;
      }

      const newClausalList = [...lpoClausalFormulas, ...userClausesStrings];
      setLpoClausalFormulas(newClausalList);

      if (lpoActiveFormula < lpoSkolemFormulas.length - 1) {
        setLpoActiveFormula(prev => prev + 1); setLpoInputs(['']); setLpoFeedback(t('clausesCorrect'));
      } else { setLpoPhase('LINEAR'); setLpoFeedback(null); }

    } catch (e) { setLpoFeedback(t('clausalSyntaxError')); return; }
  };

  const handleLpoLinearSelect = (target: string) => {
    if (!lpoLinearHead) {
      setLpoLinearHead(target);
      setLpoFeedback(t('headSetLpo'));
    } else if (!lpoLinearTarget) {
      const directResolution = resolveLPO(lpoLinearHead, target, "", "");

      if (directResolution) {
        setLpoLinearHistory([...lpoLinearHistory, {
          left: lpoLinearHead, right: target, resolvent: directResolution.resolvent,
          theta1: 'ε', theta2: 'ε'
        }]);
        setLpoLinearHead(directResolution.resolvent);
        setLpoLinearTarget(null);

        if (directResolution.resolvent === '□') {
          setLpoFeedback(t('emptyClauseDirect'));
        } else {
          setLpoFeedback(t('directResolution', { lit: directResolution.resolvedLiteral }));
        }
      } else {
        setLpoLinearTarget(target);
        setLpoFeedback(t('clauseSelected'));
      }
    }
  };

  const handleLpoResolve = () => {
    const result = resolveLPO(lpoLinearHead!, lpoLinearTarget!, lpoSubstitution1, lpoSubstitution2);

    if (result) {
      setLpoLinearHistory([...lpoLinearHistory, {
        left: lpoLinearHead!, right: lpoLinearTarget!, resolvent: result.resolvent,
        theta1: lpoSubstitution1 || 'ε', theta2: lpoSubstitution2 || 'ε'
      }]);
      setLpoLinearHead(result.resolvent);
      setLpoLinearTarget(null); setLpoSubstitution1(''); setLpoSubstitution2('');
      if (result.resolvent === '□') {
        setLpoFeedback(t('emptyClauseUnification'));
      } else {
        setLpoFeedback(t('unificationSuccess', { lit: result.resolvedLiteral }));
      }
    } else {
      setLpoFeedback(t('cannotUnify'));
    }
  };

  const highlightFormula = (text: string) => { 
     let parenLevel = 0; const parenColors = ['#ff79c6', '#8be9fd', '#50fa7b', '#f1fa8c', '#bd93f9'];
     return text.split('').map((char, i) => {
       if (char === '(') { const c = parenColors[parenLevel % parenColors.length]; parenLevel++; return <span key={i} style={{ color: c }}>{char}</span>; }
       if (char === ')') { parenLevel = Math.max(0, parenLevel - 1); return <span key={i} style={{ color: parenColors[parenLevel % parenColors.length] }}>{char}</span>; }
       if (['⇒', '⇔', '¬', '∧', '∨', '∀', '∃'].includes(char)) return <span key={i} style={{ color: LOGIC_THEME.operator }}>{char}</span>;
       if (logicMode === 'LPO' && dictionary[char]) {
         const t = dictionary[char]; return <span key={i} style={{ color: LOGIC_THEME[t === 'FUNCTION' ? 'function' : t === 'PREDICATE' ? 'predicate' : t === 'CONSTANT' ? 'constant' : 'variable'] }}>{char}</span>;
       }
       return <span key={i} style={{ color: /^[A-Z]$/.test(char) ? LOGIC_THEME.predicate : LOGIC_THEME.variable }}>{char}</span>;
     });
  };

  return (
    <div className="min-h-screen w-full flex flex-col p-8 box-border select-none" style={{ backgroundColor: LOGIC_THEME.bg, color: LOGIC_THEME.text }}>
      <header className="mb-6 flex flex-col items-center relative">
        <button
          onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
          className="absolute top-0 right-0 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 font-bold text-sm transition-all"
          style={{ fontFamily: "'Silkscreen', sans-serif" }}
        >
          {language === 'es' ? 'EN' : 'ES'}
        </button>
        <h1 className="text-4xl md:text-5xl mb-2 tracking-tighter" style={{ fontFamily: "'DotGothic16', sans-serif", color: LOGIC_THEME.accent }}>
          {t('title')} <span className="text-2xl opacity-60 ml-2 text-slate-400" style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('subtitle')}</span>
        </h1>
        <div className="bg-slate-900/50 p-1 rounded-lg border border-slate-700/50 inline-flex mt-4">
          <button onClick={() => handleModeChange('PROPOSICIONAL')} className={`px-6 py-2 rounded-md font-bold text-sm tracking-widest uppercase transition-all ${logicMode === 'PROPOSICIONAL' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`} style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('propositional')}</button>
          <button onClick={() => handleModeChange('LPO')} className={`px-6 py-2 rounded-md font-bold text-sm tracking-widest uppercase transition-all ${logicMode === 'LPO' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`} style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('firstOrder')}</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <div className="relative group mt-4">
          <div className="absolute -top-3 left-4 flex gap-2 items-center z-10">
            <span className="bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-700 rounded shadow-sm">{t('livePreview')}</span>
            <button onClick={generateRandomSigma} className="bg-indigo-900/60 hover:bg-indigo-600 text-indigo-300 hover:text-white px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest border border-indigo-700/50 rounded transition-all shadow-sm flex items-center gap-1">
              {t('generateRandom')}
            </button>
          </div>
          <div className="w-full min-h-[80px] p-6 rounded-lg border border-slate-700 bg-slate-900/40 text-2xl font-mono flex flex-wrap items-center shadow-inner gap-1">
            <span className="text-slate-500 mr-2">Σ = {'{'}</span>{formulas.map((f, i) => (<React.Fragment key={`prev-${i}`}>{f ? highlightFormula(f) : <span className="opacity-20">_</span>}{i < formulas.length - 1 && <span className="text-slate-500 mr-2">,</span>}</React.Fragment>))}<span className="text-slate-500 ml-2">{'}'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {formulas.map((f, i) => (
            <div key={`form-${i}`} className="flex items-center gap-3">
              <span className="font-mono font-bold text-slate-400 w-8 text-right text-xl">α{i + 1}:</span>
              <input type="text" value={f} onFocus={() => setActiveInput({ section: 'formula', index: i })} onChange={(e) => { const n = [...formulas]; n[i] = applyShortcuts(e.target.value); setFormulas(n); resetPractice(); }} spellCheck="false" autoComplete="off" placeholder={`${t('premise')} ${i + 1}`} className="flex-1 p-3 bg-black/30 border-b-2 border-slate-700 focus:border-indigo-500 outline-none transition-all text-xl font-mono text-white rounded-t" />
              {formulas.length > 1 && <button onClick={() => { setFormulas(formulas.filter((_, idx) => idx !== i)); setAsts(asts.filter((_, idx) => idx !== i)); resetPractice(); }} className="px-4 py-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 font-bold text-xl transition-colors">×</button>}
            </div>
          ))}
          <button onClick={() => { setFormulas([...formulas, '']); resetPractice(); }} className="self-start ml-14 text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 px-3 py-1 bg-indigo-900/30 rounded border border-indigo-900/50 transition-colors">{t('addClause')} {formulas.length + 1}</button>
        </div>

        <div className="flex flex-wrap gap-2 p-3 bg-slate-900/20 border border-slate-800 rounded-lg items-center">
          <span className="text-xs uppercase tracking-wider font-bold opacity-40 mr-2" style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('symbols')}:</span>
          {['⇒', '⇔', '¬', '∧', '∨', '∀', '∃'].map((sym) => {
            const dis = logicMode === 'PROPOSICIONAL' && (sym === '∀' || sym === '∃'); return <button key={sym} onClick={() => insertSymbol(sym)} disabled={dis} className={`px-4 py-2 border rounded text-lg font-mono transition-all ${dis ? 'bg-slate-900/40 border-slate-800 text-slate-700 cursor-not-allowed' : 'bg-slate-800/60 border-slate-700 text-white hover:bg-slate-700 active:scale-95'}`}>{sym}</button>;
          })}
        </div>

        {logicMode === 'LPO' && Object.keys(dictionary).length > 0 && (
          <section className="p-4 bg-slate-900/30 border border-slate-800/80 rounded-lg">
            <h3 className="text-xs uppercase tracking-widest font-bold opacity-50 mb-3" style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('semanticConfig')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(dictionary).map(([letter, type]) => (
                <div key={letter} className="flex items-center justify-between bg-black/20 p-2 rounded border border-slate-800 font-mono text-sm">
                  <span className="text-lg font-bold px-2" style={{ color: LOGIC_THEME[type === 'FUNCTION' ? 'function' : type === 'PREDICATE' ? 'predicate' : type === 'CONSTANT' ? 'constant' : 'variable'] }}>{letter}</span>
                  <select value={type} onChange={(e) => setDictionary(prev => ({...prev, [letter]: e.target.value as SymbolType}))} className="bg-slate-900 text-xs text-slate-300 border border-slate-700 rounded px-2 py-1 outline-none">
                    <option value="VARIABLE">{t('variable')}</option>
                    <option value="CONSTANT">{t('constant')}</option>
                    <option value="FUNCTION">{t('function')}</option>
                    <option value="PREDICATE">{t('predicate')}</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {logicMode === 'PROPOSICIONAL' && asts.some(a => a !== null) && (
          <section className="p-5 bg-slate-800/40 border border-indigo-500/30 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm uppercase tracking-widest font-bold text-indigo-300" style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('buildCNF')}</h3>
              <div className="flex gap-2">
                <button onClick={showFncSolution} className="text-xs bg-indigo-900/50 text-indigo-300 px-3 py-1 rounded hover:bg-indigo-800 transition-colors border border-indigo-700/50">{t('showSolution')}</button>
                <button onClick={resetPractice} className="text-xs bg-slate-700/50 text-slate-300 px-3 py-1 rounded hover:bg-slate-600 transition-colors border border-slate-600/50">{t('restart')}</button>
              </div>
            </div>

            {validatedClauses.length > 0 && (
              <div className="mb-6 p-4 bg-black/40 border border-slate-700 rounded-lg font-mono text-lg text-emerald-300 shadow-inner flex flex-wrap gap-2 items-center">
                <span className="text-slate-500 font-bold">Σ_FNC = {'{'}</span>
                {validatedClauses.map((c, i) => (<React.Fragment key={i}><span className="bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-800/50">{c}</span>{i < validatedClauses.length - 1 && <span className="text-slate-500">,</span>}</React.Fragment>))}
                <span className="text-slate-500 font-bold">{'}'}</span>
              </div>
            )}

            {practiceFeedback !== 'CORRECT_ALL' && (
              <>
                <p className="text-sm opacity-70 mb-4 font-sans">{t('transforming')} <span className="font-bold text-indigo-300">α{practiceActiveFormula + 1}</span>. {t('separateConjunctions')}</p>
                <div className="flex flex-col gap-3">
                  {practiceSubclauses.map((sub, idx) => (
                    <div key={`prac-${idx}`} className="flex items-center gap-3">
                      <span className="font-mono font-bold text-emerald-400 w-12 text-right">α{practiceActiveFormula + 1}.{idx + 1}:</span>
                      <input type="text" value={sub} onFocus={() => setActiveInput({ section: 'practice', index: idx })} onChange={(e) => { const n = [...practiceSubclauses]; n[idx] = applyShortcuts(e.target.value); setPracticeSubclauses(n); setPracticeFeedback('IDLE'); }} className="flex-1 p-3 bg-black/50 border-2 border-slate-600 outline-none text-lg font-mono rounded text-white" />
                      {practiceSubclauses.length > 1 && <button onClick={() => setPracticeSubclauses(practiceSubclauses.filter((_, i) => i !== idx))} className="px-3 py-2 text-red-400 hover:text-red-300">×</button>}
                    </div>
                  ))}
                  <div className="flex gap-4 mt-2 ml-14">
                     <button onClick={() => setPracticeSubclauses([...practiceSubclauses, ''])} className="px-4 py-2 bg-slate-800 text-slate-300 text-sm font-bold rounded hover:bg-slate-700">{t('separateAnd')}</button>
                     <button onClick={checkSubclauses} className="bg-emerald-600 text-white px-8 py-2 rounded font-bold hover:bg-emerald-500">{t('validate')} α{practiceActiveFormula + 1}</button>
                  </div>
                </div>
                {practiceFeedback === 'INCORRECT' && <div className="mt-4 text-red-400 text-sm font-bold">{t('errorCheck')}</div>}
                {practiceFeedback === 'INCORRECT_FORMAT' && <div className="mt-4 text-orange-400 text-sm font-bold">{t('errorFormat')}</div>}
                {practiceFeedback === 'SYNTAX_ERROR' && <div className="mt-4 text-red-400 text-sm font-bold">{t('syntaxError')}</div>}
                {practiceFeedback === 'SHOW_SOLUTION' && <div className="mt-4 text-indigo-400 text-sm font-bold flex items-center gap-2">{t('solutionAutocompleted')}</div>}
              </>
            )}

            {practiceFeedback === 'CORRECT_ALL' && hornAnswer && (
              <div className="mt-4 p-6 bg-indigo-900/20 border-2 border-indigo-500/50 rounded-xl">
                <h3 className="text-xl font-bold text-indigo-300 mb-4" style={{ fontFamily: "'DotGothic16', sans-serif" }}>{t('bonusQuestion')}</h3>
                <p className="text-slate-300 mb-4" dangerouslySetInnerHTML={{ __html: t('hornQuestion') }}></p>
                <div className="flex gap-3 mb-4">
                  <button onClick={() => setHornFeedback(hornAnswer.isHorn ? 'CORRECT' : 'INCORRECT')} className="px-6 py-2 bg-slate-800 hover:bg-indigo-600 text-white font-bold rounded">{t('yes')}</button>
                  <button onClick={() => setHornFeedback(!hornAnswer.isHorn ? 'CORRECT' : 'INCORRECT')} className="px-6 py-2 bg-slate-800 hover:bg-indigo-600 text-white font-bold rounded">{t('no')}</button>
                  <button onClick={() => setHornFeedback('SHOW')} className="px-6 py-2 bg-transparent border border-indigo-600 hover:border-indigo-400 text-indigo-400 font-bold rounded">{t('showAnswer')}</button>
                </div>
                {hornFeedback !== 'IDLE' && (
                  <div className={`p-4 rounded-lg font-bold text-sm ${hornFeedback === 'CORRECT' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/30' : hornFeedback === 'INCORRECT' ? 'bg-red-900/40 text-red-400 border border-red-500/30' : 'bg-indigo-900/30 text-indigo-300 border border-indigo-500/30'}`}>
                    {hornFeedback === 'CORRECT' && <span className="block mb-1 text-lg">{t('correct')}</span>}
                    {hornFeedback === 'INCORRECT' && <span className="block mb-1 text-lg">{t('incorrect')}</span>}
                    {hornFeedback === 'SHOW' && <span className="block mb-1 text-lg">{t('solution')}</span>}
                    <span className="font-mono">{hornAnswer.explanation}</span>
                  </div>
                )}
              </div>
            )}

            {practiceFeedback === 'CORRECT_ALL' && hornFeedback !== 'IDLE' && (
              <div className="mt-8 pt-6 border-t border-slate-700/50">
                <h3 className="text-xl font-bold text-emerald-300 mb-4 tracking-widest" style={{ fontFamily: "'DotGothic16', sans-serif" }}>{t('resolutionSystem')}</h3>
                <div className="flex gap-4">
                  <button onClick={executeDPLL} className={`flex-1 py-4 border-2 rounded-xl font-bold uppercase tracking-widest ${activeAlgorithm === 'DPLL' ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}>{t('davisPutnam')}</button>
                  <button onClick={executeLinear} className={`flex-1 py-4 border-2 rounded-xl font-bold uppercase tracking-widest ${activeAlgorithm === 'LINEAR' ? 'bg-orange-600 border-orange-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}>{t('linearInput')}</button>
                </div>

                {activeAlgorithm === 'DPLL' && dpllTrace && (
                  <div className="mt-6 p-6 bg-black/40 border border-purple-500/30 rounded-lg font-mono">
                     <div className="flex justify-between items-center mb-4 border-b border-purple-900/50 pb-2">
                      <h4 className="text-purple-400 font-bold uppercase tracking-widest text-sm">{t('dpllLab')}</h4>
                      <div className="flex gap-2">
                         <button onClick={resetDPLLGame} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded border border-slate-600">{t('restart')}</button>
                         <button onClick={() => setDpllGameMode('SHOW_ALL')} className="text-xs bg-purple-900/50 hover:bg-purple-800 text-purple-300 px-3 py-1 rounded border border-purple-700">{t('showAnswerBtn')}</button>
                      </div>
                    </div>

                    <ul className="space-y-4 text-sm mb-6">
                      {dpllTrace.slice(0, dpllGameMode === 'SHOW_ALL' ? dpllTrace.length : dpllStepIndex + 1).map((step, i) => (
                        <li key={i} className={`p-4 rounded border ${step.type === 'SUCCESS' ? 'bg-emerald-900/30 border-emerald-700 text-emerald-200' : step.type === 'FAIL' ? 'bg-red-900/30 border-red-700 text-red-200' : step.type === 'SPLIT' ? 'bg-blue-900/20 border-blue-800 text-blue-200' : step.type === 'BACKTRACK' ? 'bg-orange-900/20 border-orange-800 text-orange-200' : 'bg-slate-900/50 border-slate-700 text-slate-300'}`}>
                          <div className="font-bold mb-2"><span className="opacity-50 mr-2">[{i + 1}]</span><span>{step.message}</span></div>
                          <div className="pl-6 border-l-2 border-slate-600/50 opacity-80">
                            <div><span className="text-purple-300">Σ</span> = {step.clausesStr}</div>
                            {Object.keys(step.assignment).length > 0 && <div className="mt-1 text-xs opacity-70">Asignaciones: {JSON.stringify(step.assignment).replace(/"/g, '')}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {dpllGameMode === 'INTERACTIVE' && dpllStepIndex < dpllTrace.length - 1 && (
                       <div className="p-5 bg-purple-900/20 border-2 border-purple-500/50 rounded-xl shadow-lg">
                         <h5 className="text-purple-300 font-bold mb-3 uppercase tracking-widest text-xs">{t('whatStep')}</h5>
                         {!dpllPendingLiteralRule ? (
                           <div className="flex flex-wrap gap-2">
                              <button onClick={() => handleGuessRule('UNIT_PROPAGATION')} className="px-3 py-2 bg-slate-800 hover:bg-indigo-600 rounded text-sm font-bold transition-colors">{t('unitPropagation')}</button>
                              <button onClick={() => handleGuessRule('PURE_LITERAL')} className="px-3 py-2 bg-slate-800 hover:bg-indigo-600 rounded text-sm font-bold transition-colors">{t('pureLiteral')}</button>
                              <button onClick={() => handleGuessRule('SPLIT')} className="px-3 py-2 bg-slate-800 hover:bg-indigo-600 rounded text-sm font-bold transition-colors">{t('split')}</button>
                              <button onClick={() => handleGuessRule('BACKTRACK')} className="px-3 py-2 bg-slate-800 hover:bg-orange-600 rounded text-sm font-bold transition-colors">{t('backtrack')}</button>
                              <button onClick={() => handleGuessRule('FAIL')} className="px-3 py-2 bg-slate-800 hover:bg-red-600 rounded text-sm font-bold transition-colors">{t('emptyClause')}</button>
                              <button onClick={() => handleGuessRule('SUCCESS')} className="px-3 py-2 bg-slate-800 hover:bg-emerald-600 rounded text-sm font-bold transition-colors">{t('emptySet')}</button>
                           </div>
                         ) : (
                           <div>
                              <p className="text-sm text-slate-300 mb-2">{t('chooseLiteral')}</p>
                              <div className="flex flex-wrap gap-2">
                                 {getUniqueLiterals(dpllTrace[dpllStepIndex].clauses).map((lit, idx) => (
                                    <button key={idx} onClick={() => handleGuessLiteral(lit.name, lit.isPositive)} className="px-4 py-2 font-mono text-lg font-bold bg-indigo-900/50 hover:bg-indigo-500 border border-indigo-400 rounded transition-colors">
                                       {lit.isPositive ? '' : '¬'}{lit.name}
                                    </button>
                                 ))}
                              </div>
                              <button onClick={() => setDpllPendingLiteralRule(null)} className="mt-4 text-xs text-slate-400 hover:text-white underline">{t('changeRule')}</button>
                           </div>
                         )}
                         {dpllMinigameFeedback && <div className={`mt-4 text-sm font-bold ${dpllMinigameFeedback.includes('✗') ? 'text-red-400' : 'text-emerald-400'}`}>{dpllMinigameFeedback}</div>}
                       </div>
                    )}
                  </div>
                )}

                {activeAlgorithm === 'LINEAR' && (
                  <div className="mt-6 p-6 bg-black/40 border border-orange-500/30 rounded-lg font-mono">
                    <div className="flex justify-between items-center mb-6 border-b border-orange-900/50 pb-2">
                      <h4 className="text-orange-400 font-bold uppercase tracking-widest text-sm">{t('linearLab')}</h4>
                      <button onClick={resetLinearGame} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded border border-slate-600">{t('restartTree')}</button>
                    </div>

                    <div className="mb-6 p-4 bg-orange-900/10 border border-orange-800/30 rounded">
                      <h5 className="text-xs text-orange-300/70 uppercase tracking-widest mb-3">{t('inputSet')}</h5>
                      <div className="flex flex-wrap gap-2">
                        {linearBaseClauses.map((c, idx) => (
                          <button key={idx} onClick={() => handleLinearSelect(c)} disabled={linearStatus === 'SUCCESS'}
                            className="px-3 py-2 bg-slate-800 hover:bg-orange-900/60 border border-slate-600 hover:border-orange-500 rounded font-mono text-sm font-bold text-slate-200 hover:text-white transition-all disabled:opacity-50">
                            {formatSingleClause(c)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {linearFeedback && (
                      <div className={`mb-6 p-3 rounded font-bold text-sm border text-center ${linearStatus === 'SUCCESS' ? 'bg-emerald-900/30 border-emerald-700 text-emerald-200' : linearFeedback.includes('✗') ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-slate-900/50 border-slate-700 text-slate-300'}`}>
                        {linearFeedback}
                      </div>
                    )}

                    <div className="flex flex-col items-center">
                      {linearHistory.map((step, idx) => (
                        <div key={idx} className="flex flex-col items-center w-full">
                          <div className="flex items-center justify-center gap-4 w-full">
                            <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-300 text-sm">{formatSingleClause(step.left)}</div>
                            <div className="text-slate-500 font-bold">+</div>
                            <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-300 text-sm">{formatSingleClause(step.right)}</div>
                          </div>
                          <div className="flex flex-col items-center my-1">
                            <div className="w-px h-4 bg-slate-600"></div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-900 rounded border border-slate-700">Resuelto por {step.lit}</div>
                            <div className="w-px h-4 bg-slate-600"></div>
                          </div>
                          <div className="px-5 py-2 bg-orange-900/20 border border-orange-700/50 rounded text-orange-200 font-bold text-base shadow-sm">
                            {formatSingleClause(step.resolvent)}
                          </div>
                          {idx < linearHistory.length - 1 && <div className="w-px h-6 bg-slate-700 my-2"></div>}
                        </div>
                      ))}
                      {linearHistory.length === 0 && linearHead && (
                         <div className="px-5 py-2 bg-orange-900/20 border border-orange-700/50 rounded text-orange-200 font-bold text-base shadow-sm">
                           {formatSingleClause(linearHead)}
                         </div>
                      )}
                    </div>
                    {!linearHead && <div className="text-center p-8 border border-dashed border-slate-700 rounded-lg text-slate-500 font-mono text-sm">{t('selectClause')}</div>}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {logicMode === 'LPO' && asts.some(a => a !== null) && (
          <section className="p-5 bg-emerald-900/10 border border-emerald-500/30 rounded-lg">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm uppercase tracking-widest font-bold text-emerald-400" style={{ fontFamily: "'Silkscreen', sans-serif" }}>{t('lpoFlow')}</h3>
              {lpoPhase !== 'IDLE' ? (
                <button onClick={resetPractice} className="text-xs bg-slate-700/50 text-slate-300 px-3 py-1 rounded hover:bg-slate-600 transition-colors">{t('restart')}</button>
              ) : (
                <button onClick={startLpoPractice} className="bg-emerald-600 text-white font-bold uppercase tracking-widest px-6 py-2 rounded shadow hover:bg-emerald-500 transition-all">{t('startLpoPractice')}</button>
              )}
            </div>

            {(lpoSkolemFormulas.length > 0 || lpoClausalFormulas.length > 0) && (
              <div className="mb-6 flex flex-col gap-3">
                {lpoSkolemFormulas.length > 0 && (
                  <div className="p-4 bg-black/40 border border-emerald-700/50 rounded-lg font-mono text-lg text-emerald-300 shadow-inner flex flex-wrap gap-2 items-center">
                    <span className="text-slate-500 font-bold">Σ_SKOLEM = {'{'}</span>
                    {lpoSkolemFormulas.map((c, i) => (
                      <React.Fragment key={`sk-${i}`}>
                        <span className="bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-800/50">{c}</span>
                        {i < lpoSkolemFormulas.length - 1 && <span className="text-slate-500">,</span>}
                      </React.Fragment>
                    ))}
                    <span className="text-slate-500 font-bold">{'}'}</span>
                  </div>
                )}
                
                {lpoClausalFormulas.length > 0 && (
                  <div className="p-4 bg-black/40 border border-teal-700/50 rounded-lg font-mono text-lg text-teal-300 shadow-inner flex flex-wrap gap-2 items-center">
                    <span className="text-slate-500 font-bold">Σ_CLAUSAL = {'{'}</span>
                    {lpoClausalFormulas.map((c, i) => (
                      <React.Fragment key={`cl-${i}`}>
                        <span className="bg-teal-900/30 px-2 py-0.5 rounded border border-teal-800/50">{c}</span>
                        {i < lpoClausalFormulas.length - 1 && <span className="text-slate-500">,</span>}
                      </React.Fragment>
                    ))}
                    <span className="text-slate-500 font-bold">{'}'}</span>
                  </div>
                )}
              </div>
            )}

            {lpoPhase === 'SKOLEM' && (
              <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-800 text-white px-2 py-1 rounded text-xs font-bold">{t('phase1')}</span>
                    <span className="text-slate-300 font-bold uppercase tracking-widest text-sm">{t('skolemForms')}</span>
                  </div>
                  <button onClick={showLpoSkolemSolution} className="text-xs bg-emerald-900/50 text-emerald-300 px-3 py-1 rounded hover:bg-emerald-800 transition-colors border border-emerald-700/50">{t('showSolution')}</button>
                </div>
                <p className="text-sm text-slate-400 mb-4">{t('skolemPrompt')} <span className="font-mono text-emerald-300 bg-black/50 px-2 py-1 rounded">α{lpoActiveFormula + 1}: {formulas[lpoActiveFormula]}</span></p>

                <div className="flex gap-3">
                  <span className="font-mono font-bold text-emerald-400 w-12 text-right mt-3">Sk{lpoActiveFormula + 1}:</span>
                  <input type="text" value={lpoInputs[0]} onFocus={() => setActiveInput({ section: 'lpo', index: 0 })} onChange={(e) => setLpoInputs([applyShortcuts(e.target.value)])} className="flex-1 p-3 bg-black/50 border-2 border-slate-600 focus:border-emerald-400 outline-none transition-all text-lg font-mono rounded text-white" />
                  <button onClick={checkLpoSkolem} className="bg-emerald-600 text-white px-6 py-2 rounded font-bold hover:bg-emerald-500">{t('validateSkolem')}</button>
                </div>
                {lpoFeedback && <div className={`mt-3 text-sm font-bold flex items-center gap-2 ${lpoFeedback.includes('✗') ? 'text-red-400' : 'text-emerald-400'}`}>{lpoFeedback}</div>}
              </div>
            )}

            {lpoPhase === 'CLAUSAL' && (
              <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-teal-700 text-white px-2 py-1 rounded text-xs font-bold">{t('phase2')}</span>
                    <span className="text-slate-300 font-bold uppercase tracking-widest text-sm">{t('clausulation')}</span>
                  </div>
                  <button onClick={showLpoClausalSolution} className="text-xs bg-teal-900/50 text-teal-300 px-3 py-1 rounded hover:bg-teal-800 transition-colors border border-teal-700/50">{t('showSolution')}</button>
                </div>
                <p className="text-sm text-slate-400 mb-4">{t('clausalPrompt')} <span className="font-mono text-teal-300 bg-black/50 px-2 py-1 rounded">Sk{lpoActiveFormula + 1}: {lpoSkolemFormulas[lpoActiveFormula]}</span></p>

                <div className="flex flex-col gap-3">
                  {lpoInputs.map((sub, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="font-mono font-bold text-teal-400 w-12 text-right">C{lpoActiveFormula + 1}.{idx + 1}:</span>
                      <input type="text" value={sub} onFocus={() => setActiveInput({ section: 'lpo', index: idx })} onChange={(e) => { const n = [...lpoInputs]; n[idx] = applyShortcuts(e.target.value); setLpoInputs(n); }} className="flex-1 p-3 bg-black/50 border-2 border-slate-600 focus:border-teal-400 outline-none text-lg font-mono rounded text-white" />
                      {lpoInputs.length > 1 && <button onClick={() => setLpoInputs(lpoInputs.filter((_, i) => i !== idx))} className="px-3 py-2 text-red-400 hover:text-red-300">×</button>}
                    </div>
                  ))}
                  <div className="flex gap-4 mt-2 ml-14">
                     <button onClick={() => setLpoInputs([...lpoInputs, ''])} className="px-4 py-2 bg-slate-800 text-slate-300 text-sm font-bold rounded hover:bg-slate-700">{t('separateAnd')}</button>
                     <button onClick={checkLpoClausal} className="bg-teal-600 text-white px-8 py-2 rounded font-bold hover:bg-teal-500">{t('validateClauses')}</button>
                  </div>
                </div>
                {lpoFeedback && <div className={`mt-3 text-sm font-bold ${lpoFeedback.includes('✗') ? 'text-red-400' : 'text-teal-400'}`}>{lpoFeedback}</div>}
              </div>
            )}

            {lpoPhase === 'LINEAR' && (
              <div className="animate-fade-in mt-4 p-6 bg-black/40 border border-blue-500/30 rounded-lg font-mono">
                <div className="flex justify-between items-center mb-6 border-b border-blue-900/50 pb-2">
                  <h4 className="text-blue-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                    <span className="bg-blue-800 text-white px-2 py-0.5 rounded text-xs">{t('phase3')}</span> {t('linearResolution')}
                  </h4>
                  <button onClick={() => { setLpoLinearHead(null); setLpoLinearTarget(null); setLpoSubstitution1(''); setLpoSubstitution2(''); setLpoLinearHistory([]); setLpoFeedback(null); }} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded border border-slate-600">{t('restartTree')}</button>
                </div>

                <div className="mb-6 p-4 bg-blue-900/10 border border-blue-800/30 rounded">
                  <h5 className="text-xs text-blue-300/70 uppercase tracking-widest mb-3">{t('inputSetLpo')}</h5>
                  <div className="flex flex-wrap gap-2">
                    {lpoClausalFormulas.map((c, idx) => (
                      <button key={idx} onClick={() => handleLpoLinearSelect(c)}
                        className={`px-3 py-2 bg-slate-800 hover:bg-blue-900/60 border ${lpoLinearTarget === c || lpoLinearHead === c ? 'border-blue-400 text-white' : 'border-slate-600 text-slate-200'} rounded font-mono text-sm font-bold transition-all`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {lpoLinearHead && lpoLinearTarget && (
                  <div className="mb-8 p-5 bg-blue-900/20 border-2 border-blue-500/50 rounded-xl shadow-lg flex flex-col items-center">
                    <h5 className="text-blue-300 font-bold mb-4 uppercase tracking-widest text-xs">{t('prepUnification')}</h5>

                    <div className="flex flex-col md:flex-row items-center justify-center gap-6 w-full">
                      <div className="flex flex-col items-center flex-1">
                        <span className="text-white bg-slate-800 px-4 py-3 rounded border border-slate-600 mb-3 text-center w-full">{lpoLinearHead}</span>
                        <label className="text-xs text-slate-400 mb-1 font-sans">{t('substitution1')}</label>
                        <input type="text" value={lpoSubstitution1} onChange={(e) => setLpoSubstitution1(e.target.value)} className="w-full p-2 bg-black/60 border border-slate-600 focus:border-blue-400 rounded text-white font-mono text-center outline-none" placeholder="Ej: x/a, y|f(b)" />
                      </div>

                      <span className="text-blue-400 font-bold text-2xl hidden md:block">⋈</span>

                      <div className="flex flex-col items-center flex-1">
                        <span className="text-white bg-slate-800 px-4 py-3 rounded border border-slate-600 mb-3 text-center w-full">{lpoLinearTarget}</span>
                        <label className="text-xs text-slate-400 mb-1 font-sans">{t('substitution2')}</label>
                        <input type="text" value={lpoSubstitution2} onChange={(e) => setLpoSubstitution2(e.target.value)} className="w-full p-2 bg-black/60 border border-slate-600 focus:border-blue-400 rounded text-white font-mono text-center outline-none" placeholder="Ej: z->c, w=a" />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col items-center w-full">
                      <button onClick={handleLpoResolve} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors text-lg">{t('unifyResolve')}</button>
                      <button onClick={() => { setLpoLinearTarget(null); setLpoSubstitution1(''); setLpoSubstitution2(''); }} className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline">{t('cancelSelection')}</button>
                    </div>
                  </div>
                )}

                {lpoFeedback && (
                  <div className={`mb-6 p-3 rounded font-bold text-sm border text-center ${lpoFeedback.includes('✗') ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-slate-900/50 border-slate-700 text-slate-300'}`}>
                    {lpoFeedback}
                  </div>
                )}

                <div className="flex flex-col items-center">
                  {lpoLinearHistory.map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center w-full">
                      <div className="flex items-center justify-center gap-4 w-full">
                        <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-300 text-sm">{step.left}</div>
                        <div className="text-slate-500 font-bold">+</div>
                        <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-300 text-sm">{step.right}</div>
                      </div>
                      <div className="flex flex-col items-center my-1">
                        <div className="w-px h-4 bg-slate-600"></div>
                        <div className="text-[10px] text-blue-300 uppercase tracking-widest px-2 py-0.5 bg-slate-900 rounded border border-blue-900 mt-1">θ₁ = {`{${step.theta1}}`}</div>
                        <div className="text-[10px] text-blue-300 uppercase tracking-widest px-2 py-0.5 bg-slate-900 rounded border border-blue-900 mt-1 mb-1">θ₂ = {`{${step.theta2}}`}</div>
                        <div className="w-px h-4 bg-slate-600"></div>
                      </div>
                      <div className="px-5 py-2 bg-blue-900/20 border border-blue-700/50 rounded text-blue-200 font-bold text-base shadow-sm">
                        {step.resolvent}
                      </div>
                      {idx < lpoLinearHistory.length - 1 && <div className="w-px h-6 bg-slate-700 my-2"></div>}
                    </div>
                  ))}
                  {lpoLinearHistory.length === 0 && lpoLinearHead && !lpoLinearTarget && (
                     <div className="px-5 py-2 bg-blue-900/20 border border-blue-700/50 rounded text-blue-200 font-bold text-base shadow-sm">
                       {lpoLinearHead}
                     </div>
                  )}
                </div>

                {!lpoLinearHead && (
                  <div className="text-center p-8 border border-dashed border-slate-700 rounded-lg text-slate-500 font-mono text-sm">
                    {t('selectClauseLpo')}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}