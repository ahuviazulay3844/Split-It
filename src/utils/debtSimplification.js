/**
 * Greedy minimum-cash-flow debt simplification.
 *
 * Given each member's net balance (positive = is owed money, negative = owes
 * money), it produces the shortest practical list of transfers that settles
 * everyone, by repeatedly matching the biggest creditor with the biggest debtor.
 * This avoids long debt chains (A→B→C becomes A→C directly).
 *
 * All math is done in integer cents to avoid floating-point drift.
 *
 * @param {{userId: string|object, amount: number}[]} balances
 * @returns {{fromUserId: string, toUserId: string, amount: number}[]}
 */
const simplifyDebts = (balances) => {
  const accounts = balances.map((b) => ({
    userId: String(b.userId),
    cents: Math.round(Number(b.amount) * 100),
  }));

  // Rounding can leave the system off by a few cents; absorb the residual into
  // the largest account so the totals net exactly to zero.
  const residual = accounts.reduce((sum, a) => sum + a.cents, 0);
  if (residual !== 0 && accounts.length > 0) {
    let maxAbs = 0;
    for (let i = 1; i < accounts.length; i += 1) {
      if (Math.abs(accounts[i].cents) > Math.abs(accounts[maxAbs].cents)) maxAbs = i;
    }
    accounts[maxAbs].cents -= residual;
  }

  const settlements = [];

  for (;;) {
    let creditor = 0;
    let debtor = 0;
    for (let i = 1; i < accounts.length; i += 1) {
      if (accounts[i].cents > accounts[creditor].cents) creditor = i;
      if (accounts[i].cents < accounts[debtor].cents) debtor = i;
    }

    // Nothing left to settle once the biggest creditor/debtor reach zero.
    if (accounts.length === 0 ||
       accounts[creditor].cents <= 0 || accounts[debtor].cents >= 0) {
      break;
    }

    const transfer = Math.min(accounts[creditor].cents, -accounts[debtor].cents);
    accounts[creditor].cents -= transfer;
    accounts[debtor].cents += transfer;

    settlements.push({
      fromUserId: accounts[debtor].userId,
      toUserId: accounts[creditor].userId,
      amount: transfer / 100,
    });
  }

  return settlements;
};

module.exports = { simplifyDebts };
