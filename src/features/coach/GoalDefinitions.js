export const GOAL_DEFINITIONS = {
  LONGEVITY: {
    label: 'Longevità',
    surplus_percentage: 0, // Mantenimento
    multipliers: {
      protein: 1.4, // Moderato
      fats: 1.0,    // Ottimale
      carbs: 3.0    // Bilanciato
    },
    missions: [
      { id: 'kcal', title: 'Target Calorico', unit: 'kcal' },
      { id: 'protein', title: 'Proteine', unit: 'g' },
      { id: 'fats', title: 'Grassi Sani', unit: 'g' },
      { id: 'carbs', title: 'Carboidrati', unit: 'g' }
    ]
  },
  HYPERTROPHY: {
    label: 'Massa',
    surplus_percentage: 0.15, // 15% surplus
    multipliers: {
      protein: 2.0,
      fats: 0.9,
      carbs: 6.0
    },
    missions: [
      { id: 'kcal', title: 'Surplus Calorico', unit: 'kcal' },
      { id: 'protein', title: 'Proteine', unit: 'g' },
      { id: 'fats', title: 'Grassi', unit: 'g' },
      { id: 'carbs', title: 'Carboidrati', unit: 'g' }
    ]
  },
  DEFINITION: {
    label: 'Definizione',
    surplus_percentage: -0.15, // 15% deficit
    multipliers: {
      protein: 2.2, // Più alto per preservazione
      fats: 0.7,    // Taglio grassi
      carbs: 2.5    // Taglio carboidrati
    },
    missions: [
      { id: 'kcal', title: 'Deficit Calorico', unit: 'kcal' },
      { id: 'protein', title: 'Proteine (Preservazione)', unit: 'g' },
      { id: 'fats', title: 'Grassi', unit: 'g' },
      { id: 'carbs', title: 'Carboidrati', unit: 'g' }
    ]
  }
};
