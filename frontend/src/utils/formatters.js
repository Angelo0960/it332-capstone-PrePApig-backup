export const formatCurrency = (amount, currency = 'PHP') => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return currency === 'PHP' ? '₱0.00' : '0.00';

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
};

export const formatPricePerKg = (amount) => {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount)
    ? `${formatCurrency(numericAmount)}/kg`
    : 'Unavailable';
};
