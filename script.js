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
const catalogKey = "smeta-5-minutes-catalog-v1";
const catalogDialog = document.querySelector("#catalog-dialog");
const catalogSearch = document.querySelector("#catalog-search");
const catalogList = document.querySelector("#catalog-list");
const catalogEditor = document.querySelector("#catalog-editor");
let catalog = [];
let editingCatalogId = null;
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
  row.querySelector(".delete-button").setAttribute("aria-label", `Удалить позицию ${itemId}`);
  row.querySelector(".save-to-catalog").setAttribute("aria-label", `Сохранить в каталог позицию ${itemId}`);
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

function catalogNotice(message) {
  document.querySelector("#catalog-status").textContent = message;
  document.querySelector("#catalog-save-status").textContent = message;
}

function loadCatalog() {
  try {
    const raw = window.localStorage.getItem(catalogKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.items) ||
        !data.items.every((item) => item && typeof item.id === "string" &&
          typeof item.name === "string" && item.name.trim() && typeof item.price === "string" &&
          ["шт", "час", "услуга"].includes(item.unit)) ||
        new Set(data.items.map((item) => item.id)).size !== data.items.length) {
      catalogNotice("Не удалось прочитать каталог. Смета доступна для работы.");
      return;
    }
    catalog = data.items;
  } catch {
    catalogNotice("Каталог недоступен в хранилище браузера. Смета доступна для работы.");
  }
}

function storeCatalog(nextCatalog) {
  try {
    window.localStorage.setItem(catalogKey, JSON.stringify({ version: 1, items: nextCatalog }));
    catalog = nextCatalog;
    return true;
  } catch {
    catalogNotice("Не удалось сохранить каталог в браузере. Изменения каталога не сохранены.");
    return false;
  }
}

function renderCatalog() {
  const query = catalogSearch.value.trim().toLocaleLowerCase("ru");
  const found = catalog.filter((item) => item.name.toLocaleLowerCase("ru").includes(query));
  catalogList.replaceChildren();
  const empty = document.querySelector("#catalog-empty");
  empty.hidden = found.length > 0;
  empty.textContent = catalog.length === 0
    ? "Каталог пока пуст. Заполните наименование, единицу и цену позиции сметы и нажмите «Сохранить в каталог»."
    : "Ничего не найдено. Попробуйте другое название.";
  const entryTemplate = document.querySelector("#catalog-entry-template");
  for (const item of found) {
    const entry = entryTemplate.content.firstElementChild.cloneNode(true);
    entry.querySelector("[data-catalog-name]").textContent = item.name;
    entry.querySelector("[data-catalog-details]").textContent = `${formatMoney(parseNumber(item.price))} / ${item.unit}`;
    for (const button of entry.querySelectorAll("button")) {
      button.dataset.catalogId = item.id;
      button.setAttribute("aria-label", `${button.textContent}: ${item.name}`);
    }
    catalogList.append(entry);
  }
}

function saveRowToCatalog(row) {
  const nameField = row.querySelector('[data-field="name"]');
  const name = nameField.value.trim();
  if (!name) {
    catalogNotice("Укажите наименование позиции, чтобы сохранить её в каталог.");
    nameField.focus();
    return;
  }
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    unit: row.querySelector('[data-field="unit"]').value,
    price: String(parseNumber(row.querySelector('[data-field="price"]').value)),
  };
  if (storeCatalog([...catalog, item])) catalogNotice(`«${name}» сохранено в каталог.`);
}

function cancelCatalogEdit() {
  catalogEditor.hidden = true;
  editingCatalogId = null;
}

document.querySelector("#open-catalog").addEventListener("click", () => {
  cancelCatalogEdit();
  catalogSearch.value = "";
  renderCatalog();
  catalogDialog.showModal();
  catalogSearch.focus();
});
document.querySelector("#close-catalog").addEventListener("click", () => catalogDialog.close());
catalogSearch.addEventListener("input", renderCatalog);
document.querySelector("#cancel-catalog-edit").addEventListener("click", () => {
  cancelCatalogEdit();
  catalogSearch.focus();
});
catalogEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  const nameField = document.querySelector("#catalog-name");
  const name = nameField.value.trim();
  if (!name) {
    catalogNotice("Укажите наименование товара или услуги.");
    nameField.focus();
    return;
  }
  if (!catalog.some((item) => item.id === editingCatalogId)) return;
  const nextCatalog = catalog.map((item) => item.id === editingCatalogId ? {
    ...item,
    name,
    unit: document.querySelector("#catalog-unit").value,
    price: String(parseNumber(document.querySelector("#catalog-price").value)),
  } : item);
  if (!storeCatalog(nextCatalog)) return;
  cancelCatalogEdit();
  renderCatalog();
  catalogNotice("Изменения сохранены в каталог.");
  catalogSearch.focus();
});
catalogList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalog-action]");
  if (!button) return;
  const item = catalog.find((entry) => entry.id === button.dataset.catalogId);
  if (!item) return;
  if (button.dataset.catalogAction === "add") {
    addItem(false, { name: item.name, quantity: "1", unit: item.unit, price: item.price });
    catalogNotice(`«${item.name}» добавлено в смету. Итого: ${totalOutput.textContent}`);
  } else if (button.dataset.catalogAction === "edit") {
    editingCatalogId = item.id;
    catalogEditor.hidden = false;
    document.querySelector("#catalog-name").value = item.name;
    document.querySelector("#catalog-unit").value = item.unit;
    document.querySelector("#catalog-price").value = item.price;
    document.querySelector("#catalog-name").focus();
  } else if (button.dataset.catalogAction === "delete") {
    if (!storeCatalog(catalog.filter((entry) => entry.id !== item.id))) return;
    if (editingCatalogId === item.id) cancelCatalogEdit();
    renderCatalog();
    catalogNotice(`«${item.name}» удалено из каталога.`);
    catalogSearch.focus();
  }
});

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
currencySelect.addEventListener("change", () => {
  if (catalogDialog.open) renderCatalog();
});
items.addEventListener("input", recalculate);
items.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing && !event.repeat &&
      event.target.matches("input") && event.target.closest("tr") === items.lastElementChild) {
    event.preventDefault();
    addItem();
  }
});
items.addEventListener("click", (event) => {
  const saveButton = event.target.closest(".save-to-catalog");
  if (saveButton) {
    saveRowToCatalog(saveButton.closest("tr"));
    return;
  }
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
loadCatalog();
