const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const inputFile = path.join(__dirname, 'crea_food_composition_tables.csv');
const outputLite = path.join(__dirname, '../src/data/crea_foods_lite.json');
const liteData = [];

fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    liteData.push({
      id: row.food_code,
      name: row.name,
      category: row.category,
      kcal: parseFloat(row.energy_kcal) || 0,
      pro: parseFloat(row.proteins) || 0,
      fat: parseFloat(row.lipids) || 0,
      carbs: parseFloat(row.available_carbohydrates) || 0
    });
  })
  .on('end', () => {
    const dir = path.dirname(outputLite);
    if (!fs.existsSync(dir)){ fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(outputLite, JSON.stringify(liteData));
    console.log(`✅ Successo! Generato JSON con ${liteData.length} alimenti!`);
  });