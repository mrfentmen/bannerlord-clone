/**
 * LoanRecord system (Rowan solo task 79).
 *
 * Borrow from moneylenders, repay with interest, or default and eat the
 * consequences: credit ruined, lenders refuse, and collectors take their
 * cut from your treasury. Persists in localStorage.
 */

export interface LoanRecord {
  id: string;
  lender: string;
  principal: number;
  /** Seasonal interest rate, e.g. 0.1 = 10%. */
  rate: number;
  balance: number;
  seasonsTaken: number;
  repaid: boolean;
  defaulted: boolean;
}

const STORE_KEY = "campaign.loans.v1";

function load(): LoanRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(loans: LoanRecord[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(loans));
  } catch {
    // Session-only loans.
  }
}

/** Take a loan. Returns the loan and the coin you receive. */
export function borrow(lender: string, principal: number, rate: number): LoanRecord {
  if (principal <= 0) throw new Error("principal must be positive");
  if (rate < 0 || rate > 1) throw new Error("rate must be 0..1");
  if (load().some((l) => !l.repaid && !l.defaulted)) {
    throw new Error("you already have an outstanding loan — repay or default first");
  }
  const loan: LoanRecord = {
    id: `loan-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    lender,
    principal,
    rate,
    balance: principal,
    seasonsTaken: 0,
    repaid: false,
    defaulted: false,
  };
  const loans = load();
  loans.push(loan);
  save(loans);
  return loan;
}

/** Accrue one season of interest on all outstanding loans. */
export function accrueLoanInterest(): LoanRecord[] {
  const loans = load();
  for (const loan of loans) {
    if (loan.repaid || loan.defaulted) continue;
    loan.seasonsTaken += 1;
    loan.balance = Math.round(loan.balance * (1 + loan.rate));
  }
  save(loans);
  return loans.filter((l) => !l.repaid && !l.defaulted);
}

/**
 * Repay a loan. `coin` is what you pay now; returns the updated loan and
 * any overpayment returned. Throws when there is no such loan.
 */
export function payLoan(id: string, coin: number): { loan: LoanRecord; change: number } {
  if (coin <= 0) throw new Error("repayment must be positive");
  const loans = load();
  const loan = loans.find((l) => l.id === id);
  if (!loan) throw new Error(`no loan: ${id}`);
  if (loan.repaid || loan.defaulted) throw new Error("loan is already settled");
  const change = Math.max(0, coin - loan.balance);
  loan.balance = Math.max(0, loan.balance - coin);
  if (loan.balance === 0) loan.repaid = true;
  save(loans);
  return { loan, change };
}

/**
 * Default on a loan. Consequences: the lender writes you off (no more
 * loans while the record stands), collectors seize 50% of the principal
 * from your treasury immediately, and your credit is ruined.
 */
export function defaultLoan(id: string): { loan: LoanRecord; seized: number; line: string } {
  const loans = load();
  const loan = loans.find((l) => l.id === id);
  if (!loan) throw new Error(`no loan: ${id}`);
  if (loan.repaid || loan.defaulted) throw new Error("loan is already settled");
  loan.defaulted = true;
  const seized = Math.round(loan.principal * 0.5);
  save(loans);
  return {
    loan,
    seized,
    line: `You default on ${loan.lender}. Collectors seize ${seized} from your treasury; no lender will touch you again.`,
  };
}

/** Active (unsettled) loans. */
export function activeLoans(): LoanRecord[] {
  return load().filter((l) => !l.repaid && !l.defaulted);
}
