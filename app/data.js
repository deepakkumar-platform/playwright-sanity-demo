// Demo data. Passwords here are fake demo values for a local test app.
module.exports = {
  moduleNames: { recipes: 'Recipes', menu: 'Menu', products: 'Products', inventory: 'Inventory' },
  users: [
    { username: 'qa.admin', password: 'demo-admin', displayName: 'QA Admin', profile: 'Administrator', modules: ['recipes', 'menu', 'products', 'inventory'] },
    { username: 'qa.chef', password: 'demo-chef', displayName: 'QA Chef', profile: 'Chef', modules: ['recipes', 'menu'] },
  ],
  recipes: [
    { id: 101, name: 'Chicken Biryani', category: 'Entree', mealType: 'Lunch', servings: 10, calories: 520, protein: 28, allergens: ['Dairy'] },
    { id: 102, name: 'Veg Pulao', category: 'Entree', mealType: 'Lunch', servings: 12, calories: 380, protein: 9, allergens: [] },
    { id: 103, name: 'Masala Oats', category: 'Breakfast', mealType: 'Breakfast', servings: 8, calories: 210, protein: 7, allergens: ['Gluten'] },
  ],
  menu: [
    { day: 'Monday', meal: 'Breakfast', item: 'Masala Oats' },
    { day: 'Monday', meal: 'Lunch', item: 'Chicken Biryani' },
    { day: 'Tuesday', meal: 'Lunch', item: 'Veg Pulao' },
  ],
  products: [
    { sku: 'P-1001', name: 'Basmati Rice 10kg', category: 'Grains', unit: 'Bag' },
    { sku: 'P-1002', name: 'Rolled Oats 5kg', category: 'Grains', unit: 'Bag' },
    { sku: 'P-2001', name: 'Chicken Thigh 2kg', category: 'Protein', unit: 'Pack' },
  ],
  inventory: [
    { area: 'Dry Store', product: 'Basmati Rice 10kg', qty: 14 },
    { area: 'Walk-in Freezer', product: 'Chicken Thigh 2kg', qty: 22 },
  ],
};
