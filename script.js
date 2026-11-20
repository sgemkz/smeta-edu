"use strict";

const items = document.querySelector("#items");
const template = document.querySelector("#item-template");
const addButton = document.querySelector("#add-item");
const totalOutput = document.querySelector("#total");
const discountInput = document.querySelector("#discount");
const vatInput = document.querySelector("#vat");
const currencySelect = document.querySelector("#currency");
const printButton = document.querySelector("#save-pdf");
const estimate = document.querySelector(".estimate");
const draftKey = "smeta-5-minutes-draft-v1";
const savedFields = {
  sender: document.querySelector('[name="sender"]'),
  recipient: document.querySelector('[name="recipient"]'),
  number: document.querySelector('[name="estimate-number"]'),
  date: document.querySelector("#estimate-date"),
  discount: discountInput,
  vat: vatInput,
  currency: currencySelect,
  comment: document.querySelector("#comment"),
};
let draftReady = false;
let copyTimer;
let copyRequest = 0;
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

function addItem(focusName = true, values = null) {
  const row = template.content.firstElementChild.cloneNode(true);
  const itemId = ++nextItemId;
  row.setAttribute("aria-label", `Позиция ${itemId}`);
  for (const field of row.querySelectorAll("input, select")) {
    field.id = `item-${itemId}-${field.dataset.field}`;
    row.querySelector(`[data-label="${field.dataset.field}"]`).htmlFor = field.id;
    if (values) field.value = values[field.dataset.field];
  }
  const sumLabel = row.querySelector("[data-sum-label]");
  sumLabel.id = `item-${itemId}-sum-label`;
  row.querySelector('[data-field="sum"]').setAttribute("aria-labelledby", sumLabel.id);
  row.querySelector("button").setAttribute("aria-label", `Удалить позицию ${itemId}`);
  items.append(row);
  recalculate();
  saveDraft();
  if (focusName) row.querySelector('[data-field="name"]').focus();
}

function estimateHeading() {
  const number = savedFields.number.value.trim();
  const date = savedFields.date.value;
  return `Смета № ${number || "—"} от ${date ? date.split("-").reverse().join(".") : "—"}`;
}

function preparePrint() {
  recalculate();
  const date = savedFields.date.value;
  const formattedDate = date ? date.split("-").reverse().join(".") : "—";
  document.querySelector("#print-title").textContent = estimateHeading();
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

function storageError() {
  const status = document.querySelector("#storage-status");
  status.textContent = "Браузер не разрешил сохранение черновика. Данные доступны до закрытия или обновления страницы.";
  status.hidden = false;
}

function saveDraft() {
  if (!draftReady) return;
  const draft = {
    version: 1,
    fields: Object.fromEntries(Object.entries(savedFields).map(([key, field]) => [key, field.value])),
    items: Array.from(items.rows, (row) => Object.fromEntries(
      Array.from(row.querySelectorAll("input, select"), (field) => [field.dataset.field, field.value])
    )),
  };
  try {
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    document.querySelector("#storage-status").hidden = true;
  } catch {
    storageError();
  }
}

function restoreDraft() {
  let raw;
  try {
    raw = window.localStorage.getItem(draftKey);
  } catch {
    storageError();
    return false;
  }
  if (!raw) return false;
  try {
    const draft = JSON.parse(raw);
    if (!draft || draft.version !== 1 || !draft.fields || !Array.isArray(draft.items) ||
        !Object.keys(savedFields).every((key) => typeof draft.fields[key] === "string") ||
        !["₸", "₽", "$", "€"].includes(draft.fields.currency) ||
        !draft.items.every((row) => row && ["name", "quantity", "unit", "price"].every((key) => typeof row[key] === "string") &&
          ["шт", "час", "услуга"].includes(row.unit))) return false;
    for (const [key, field] of Object.entries(savedFields)) field.value = draft.fields[key];
    for (const row of draft.items) addItem(false, row);
    recalculate();
    return true;
  } catch {
    return false;
  }
}

function todayValue() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function resetCopy() {
  copyRequest++;
  window.clearTimeout(copyTimer);
  document.querySelector("#copy-status").textContent = "";
  document.querySelector("#manual-copy").hidden = true;
  document.querySelector("#copy-text").value = "";
}

function newEstimate() {
  if (!window.confirm("Создать новую смету? Текущий черновик будет очищен.")) return;
  const current = savedFields.number.value.trim();
  const match = current.match(/^(.*?)(\d+)$/);
  const nextNumber = match ? match[1] + (BigInt(match[2]) + 1n).toString().padStart(match[2].length, "0") : "1";
  draftReady = false;
  for (const field of Object.values(savedFields)) field.value = "";
  savedFields.number.value = nextNumber;
  savedFields.date.value = todayValue();
  discountInput.value = "0";
  vatInput.value = "0";
  currencySelect.value = "₸";
  items.replaceChildren();
  nextItemId = 0;
  resetCopy();
  addItem();
  draftReady = true;
  saveDraft();
}

function buildMessage() {
  recalculate();
  const lines = [estimateHeading()];
  if (savedFields.sender.value.trim()) lines.push(`От кого: ${savedFields.sender.value.trim()}`);
  if (savedFields.recipient.value.trim()) lines.push(`Для кого: ${savedFields.recipient.value.trim()}`);
  lines.push("");
  for (const row of items.rows) {
    const name = row.querySelector('[data-field="name"]').value.trim();
    const quantity = row.querySelector('[data-field="quantity"]').value;
    const price = row.querySelector('[data-field="price"]').value;
    const unit = row.querySelector('[data-field="unit"]').value;
    if (!name && !quantity.trim() && !price.trim()) continue;
    lines.push(`• ${name || "Без названия"} — ${String(parseNumber(quantity)).replace(".", ",")} ${unit} × ${formatMoney(parseNumber(price))} = ${row.querySelector('[data-field="sum"]').textContent}`);
  }
  lines.push("", `Сумма: ${document.querySelector("#subtotal").textContent}`);
  if (!document.querySelector("#discount-row").hidden) {
    lines.push(`Скидка (${parseNumber(discountInput.value)} %): ${document.querySelector("#discount-amount").textContent}`);
    lines.push(`Сумма со скидкой: ${document.querySelector("#discounted-amount").textContent}`);
  }
  if (!document.querySelector("#vat-row").hidden) {
    lines.push(`НДС (${parseNumber(vatInput.value)} %): ${document.querySelector("#vat-amount").textContent}`);
  }
  lines.push(`Итого к оплате: ${totalOutput.textContent}`);
  if (savedFields.comment.value.trim()) lines.push("", savedFields.comment.value.trim());
  return lines.join("\n");
}

async function copyEstimate() {
  resetCopy();
  const request = copyRequest;
  const text = buildMessage();
  try {
    await navigator.clipboard.writeText(text);
    if (request !== copyRequest) return;
    document.querySelector("#copy-status").textContent = "Скопировано ✓";
    copyTimer = window.setTimeout(() => {
      document.querySelector("#copy-status").textContent = "";
    }, 2000);
  } catch {
    if (request !== copyRequest) return;
    document.querySelector("#manual-copy").hidden = false;
    const field = document.querySelector("#copy-text");
    field.value = text;
    field.focus();
    field.select();
  }
}

document.querySelector("#new-estimate").addEventListener("click", newEstimate);
document.querySelector("#copy-estimate").addEventListener("click", copyEstimate);
estimate.addEventListener("input", (event) => {
  if (event.target.matches("input, select, textarea") && event.target.id !== "copy-text") saveDraft();
});
estimate.addEventListener("change", (event) => {
  if (event.target.matches("input, select, textarea") && event.target.id !== "copy-text") saveDraft();
});

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
  saveDraft();
  if (focusRow) focusRow.querySelector('[data-field="name"]').focus();
  else addButton.focus();
});

if (!restoreDraft()) {
  savedFields.date.value = todayValue();
  addItem(false);
}
draftReady = true;
