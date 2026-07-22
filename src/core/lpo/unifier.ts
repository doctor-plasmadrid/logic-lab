export type Substitution = Record<string, string>;

export function parseSubstitution(thetaStr: string): Substitution {
  const sub: Substitution = {};
  if (!thetaStr.trim()) return sub;
  
  const parts = thetaStr.split(',');
  for (const part of parts) {
    const match = part.match(/([a-zA-ZñÑ]+)\s*(?:\/|\||->|=>|=)\s*([a-zA-ZñÑ(),]+)/);
    if (match) {
      sub[match[1].trim()] = match[2].trim();
    }
  }
  return sub;
}

export function applySubstitution(clause: string, theta: Substitution): string {
  let res = clause;
  for (const [variable, value] of Object.entries(theta)) {
    const regex = new RegExp(`\\b${variable}\\b`, 'g');
    res = res.replace(regex, value);
  }
  return res;
}

export function resolveLPO(c1Str: string, c2Str: string, theta1Str: string, theta2Str: string): { resolvent: string, resolvedLiteral: string } | null {
  const theta1 = parseSubstitution(theta1Str);
  const theta2 = parseSubstitution(theta2Str);
  
  const sub1 = applySubstitution(c1Str, theta1);
  const sub2 = applySubstitution(c2Str, theta2);

  let clean1 = sub1.trim();
  if (clean1.startsWith('(') && clean1.endsWith(')')) clean1 = clean1.slice(1, -1);
  
  let clean2 = sub2.trim();
  if (clean2.startsWith('(') && clean2.endsWith(')')) clean2 = clean2.slice(1, -1);

  const lits1 = clean1.split('∨').map(s => s.trim()).filter(Boolean);
  const lits2 = clean2.split('∨').map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < lits1.length; i++) {
    const L1 = lits1[i];
    const isL1Neg = L1.startsWith('¬');
    const core1 = isL1Neg ? L1.slice(1).trim() : L1;

    for (let j = 0; j < lits2.length; j++) {
      const L2 = lits2[j];
      const isL2Neg = L2.startsWith('¬');
      const core2 = isL2Neg ? L2.slice(1).trim() : L2;

      if (core1 === core2 && isL1Neg !== isL2Neg) {
        const resLits = [
          ...lits1.slice(0, i), ...lits1.slice(i+1),
          ...lits2.slice(0, j), ...lits2.slice(j+1)
        ];
        
        const uniqueRes = Array.from(new Set(resLits));
        
        return {
          resolvent: uniqueRes.length === 0 ? '□' : uniqueRes.join(' ∨ '),
          resolvedLiteral: L1
        };
      }
    }
  }
  return null;
}