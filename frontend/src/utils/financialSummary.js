const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateTotalRecordedCosts = ({ expenses, feedCost, vaccineCost, recordsReady }) => {
  if (!recordsReady || !Array.isArray(expenses)) return null;
  if (feedCost === null || feedCost === undefined || feedCost === ''
    || vaccineCost === null || vaccineCost === undefined || vaccineCost === '') return null;
  if (!Number.isFinite(Number(feedCost)) || !Number.isFinite(Number(vaccineCost))) return null;

  let expenseTotal = 0;
  for (const row of expenses) {
    const amount = Number(row?.amount);
    if (!Number.isFinite(amount)) return null;
    expenseTotal += amount;
  }

  return roundCurrency(expenseTotal + Number(feedCost) + Number(vaccineCost));
};
