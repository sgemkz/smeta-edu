"use strict";

const items = document.querySelector("#items");
const template = document.querySelector("#item-template");
const addButton = document.querySelector("#add-item");
const totalOutput = document.querySelector("#total");
const discountInput = document.querySelector("#discount");
const vatInput = document.querySelector("#vat");
const currencySelect = document.querySelector("#currency");
const printButton = document.querySelector("#save-pdf");
const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});
let nextItemId = 0;

function parseNumber(value) {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  const safeValue = roundAmount(value);
  return `${moneyFormatter.format(safeValue).replace(/[\u00a0\u202f]/g, " ")} ${currencySelect.value}`;
}

function roundAmount(value) {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function updateSummaryRow(rowId, outputId, amount) {
  document.querySelector(rowId).hidden = amount === 0;
  document.querySelector(outputId).textContent = formatMoney(amount);
}

function recalculate() {
  let total = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector('[data-field="quantity"]').value);
    const price = parseNumber(row.querySelector('[data-field="price"]').value);
    // Считаем целыми денежными единицами, чтобы итог совпадал с суммой строк.
    const amount = roundAmount(quantity * price);
    row.querySelector('[data-field="sum"]').textContent = formatMoney(amount);
    total += amount;
  }
  const subtotal = roundAmount(total);
  const discount = roundAmount(subtotal * (parseNumber(discountInput.value) / 100));
  const discounted = roundAmount(subtotal - discount);
  const vat = roundAmount(discounted * (parseNumber(vatInput.value) / 100));
  document.querySelector("#subtotal").textContent = formatMoney(subtotal);
  updateSummaryRow("#discount-row", "#discount-amount", discount);
  updateSummaryRow("#discounted-row", "#discounted-amount", discounted);
  updateSummaryRow("#vat-row", "#vat-amount", vat);
  totalOutput.textContent = formatMoney(discounted + vat);
  for (const symbol of document.querySelectorAll("[data-currency]")) {
    symbol.textContent = currencySelect.value;
  }
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

function preparePrint() {
  recalculate();
  const number = document.querySelector('[name="estimate-number"]').value.trim();
  const date = document.querySelector("#estimate-date").value;
  const formattedDate = date ? date.split("-").reverse().join(".") : "—";
  document.querySelector("#print-title").textContent = `Смета № ${number || "—"} от ${formattedDate}`;
  // Текстовые копии не обрезают длинные значения, как поля ввода при печати.
  for (const field of document.querySelectorAll(".details-grid input, #items input, #items select")) {
    let text = field.nextElementSibling;
    if (!text || !text.classList.contains("print-value")) {
      text = document.createElement("span");
      text.className = "print-value";
      text.setAttribute("aria-hidden", "true");
      field.after(text);
    }
    if (field.dataset.field === "price") {
      text.textContent = formatMoney(parseNumber(field.value));
    } else if (field.dataset.field === "quantity") {
      text.textContent = String(parseNumber(field.value)).replace(".", ",");
    } else {
      text.textContent = field.type === "date" ? (date ? formattedDate : "") : field.value;
    }
  }
  document.querySelector("#print-comment").textContent = document.querySelector("#comment").value;
}

printButton.addEventListener("click", () => {
  preparePrint();
  window.print();
});
window.addEventListener("beforeprint", preparePrint);

addButton.addEventListener("click", () => addItem());
discountInput.addEventListener("input", recalculate);
vatInput.addEventListener("input", recalculate);
currencySelect.addEventListener("change", recalculate);
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
