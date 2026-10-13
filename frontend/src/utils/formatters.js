export const formatCurrency = (amount, currency = 'PHP') => {
  if (amount === null || amount === undefined || amount === '') return 'Unavailable';
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 'Unavailable';

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
};

export const formatPricePerKg = (amount) => {
  if (amount === null || amount === undefined || amount === '') return 'Unavailable';
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount)
    ? `${formatCurrency(numericAmount)}/kg`
    : 'Unavailable';
};
