const axios = require("axios");

module.exports = {
  async afterCreate(event) {
    const order = event.result;

    try {
      const items = order.items || [];

      const deductions = [];

      // ===============================
      // 1. COLLECT ALL DEDUCTIONS FIRST
      // ===============================
      for (let item of items) {

        // IMPORTANT: menuItemId should exist in order item
        const menuItemId = item.menuItemId || item.id;

        const menuRes = await axios.get(
          `http://localhost:1337/api/menu-items/${menuItemId}?populate=recipe.ingredient`
        );

        const menu = menuRes.data?.data;
        if (!menu) continue;

        const recipes = menu.attributes?.recipe || [];

        for (let r of recipes) {
          const ingredientRel = r.ingredient?.data;
          if (!ingredientRel) continue;

          const ingredientId = ingredientRel.id;
          const usedQty = r.quantity * item.quantity;

          const ingRes = await axios.get(
            `http://localhost:1337/api/ingredients/${ingredientId}`
          );

          const current = ingRes.data?.data;
          if (!current) continue;

          const newStock =
            current.attributes.stock - usedQty;

          // ❌ BLOCK ORDER IF ANY INGREDIENT IS LOW
          if (newStock < 0) {
            throw new Error(
              `❌ Insufficient stock: ${current.attributes.name}`
            );
          }

          deductions.push({
            id: ingredientId,
            newStock,
            name: current.attributes.name,
            threshold: current.attributes.threshold,
          });
        }
      }

      // ===============================
      // 2. APPLY DEDUCTIONS SAFELY
      // ===============================
      for (let d of deductions) {
        await axios.put(
          `http://localhost:1337/api/ingredients/${d.id}`,
          {
            data: {
              stock: d.newStock,
            },
          }
        );

        // LOW STOCK ALERT
        if (d.newStock <= d.threshold) {
          console.log(
            `⚠ LOW STOCK ALERT: ${d.name} → ${d.newStock}`
          );
        }
      }

      console.log("✅ Inventory updated successfully");

    } catch (err) {
      console.log("❌ Inventory Error:", err.message);

      // IMPORTANT: optional rollback logic can be added later
    }
  },
};