export const toIndividualPigTableRows = (pigs) => pigs.map((pig) => ({
  id: pig.id,
  weight: pig.weight,
  healthStatus: pig.health_status || 'Unknown',
  notes: pig.notes || '',
  pig,
}));
