// ESSENSPLÄNE: fertige Wochenvorlagen mit eigenen Rezepten (src/mealplans/*.js).
// Übernehmen kopiert die Rezepte ins Kochbuch (source "essensplan", plan = id) und trägt die Woche ein.
import eisenPostpartal from "./mealplans/eisen-postpartal.js";
import { DAYS, MEALS } from "./data.js";

export const MEALPLANS = [eisenPostpartal];
export const mealPlanById = (id) => MEALPLANS.find(p=>p.id===id) || null;
// Rezeptnamen eines Plans, die in der Woche vorkommen (Reihenfolge Mo..So, Slot-Reihenfolge)
export const mealPlanNames = (plan) => {
  const seen=[];
  DAYS.forEach(d=>MEALS.forEach(m=>((plan.days[d]&&plan.days[d][m])||[]).forEach(n=>{ if(!seen.includes(n)) seen.push(n); })));
  return seen;
};
