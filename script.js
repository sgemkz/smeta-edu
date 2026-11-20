"use strict";

const items = document.querySelector("#items");
const template = document.querySelector("#item-template");
const addButton = document.querySelector("#add-item");
const totalOutput = document.querySelector("#total");
const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});
let nextItemId = 0;

function parseNumber(value) {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${moneyFormatter.format(Object.is(safeValue, -0) ? 0 : safeValue).replace(/[\u00a0\u202f]/g, " ")} ₸`;
}

function recalculate() {
  let total = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector('[data-field="quantity"]').value);
    const price = parseNumber(row.querySelector('[data-field="price"]').value);
    // Округляем каждую строку до тиынов, чтобы итог совпадал с суммой строк.
    const rounded = Math.round(quantity * price * 100) / 100;
    const amount = Number.isFinite(rounded) ? rounded : 0;
    row.querySelector('[data-field="sum"]').textContent = formatMoney(amount);
    total += amount;
  }
  totalOutput.textContent = formatMoney(total);
}

function addItem(focusName = true) {
  const row = template.content.firstElementChild.cloneNode(true);
  const itemId = ++nextItemId;
  row.setAttribute("aria-label", `Позиция ${itemId}`);
  for (const field of row.querySelectorAll("input, select")) {
    field.id = `item-${itemId}-${field.dataset.field}`;
    row.querySelector(`[data-label="${field.dataset.field}"]`).htmlFor = field.id;
  }
  const sumLabel = row.querySelector("[data-sum-label]");
  sumLabel.id = `item-${itemId}-sum-label`;
  row.querySelector('[data-field="sum"]').setAttribute("aria-labelledby", sumLabel.id);
  row.querySelector("button").setAttribute("aria-label", `Удалить позицию ${itemId}`);
  items.append(row);
  recalculate();
  if (focusName) row.querySelector('[data-field="name"]').focus();
}

addButton.addEventListener("click", () => addItem());
items.addEventListener("input", recalculate);
items.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing && !event.repeat &&
      event.target.matches("input") && event.target.closest("tr") === items.lastElementChild) {
    event.preventDefault();
    addItem();
  }
});
items.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  const row = button.closest("tr");
  const focusRow = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  recalculate();
  if (focusRow) focusRow.querySelector('[data-field="name"]').focus();
  else addButton.focus();
});

const today = new Date();
document.querySelector("#estimate-date").value = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

addItem(false);
