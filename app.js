// ==========================================
// Google Apps Script (GAS) 連携設定
// ==========================================
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxEzdHaZDIUjGiDP-03EJKKAZDq0fe_OUAPk3cuwfqo4wba7nQHrtPxxRR3RoCCZJG0wQ/exec";

// 🟢 CORS/302リダイレクト制限を回避する通信関数
function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "jsonp_cb_" + Math.random().toString(36).substring(2, 15);
    const script = document.createElement("script");

    const delimiter = url.includes("?") ? "&" : "?";
    script.src = `${url}${delimiter}callback=${callbackName}`;

    window[callbackName] = (data) => {
      resolve(data);
      document.body.removeChild(script);
      delete window[callbackName];
    };

    script.onerror = () => {
      reject(new Error("通信エラーが発生しました"));
      document.body.removeChild(script);
      delete window[callbackName];
    };

    document.body.appendChild(script);
  });
}

// アプリのグローバル状態
let templates = [];
let currentItems = [];
let editingTemplateItems = [];

const CATEGORY_ORDER = ["琴晴", "穂香", "遥菜", "ママ", "パパ", "共通"];

// DOM要素の取得（両方のIDパターンに対応）
const templateCheckboxes = document.getElementById("template-checkboxes") || document.getElementById("template-list");
const stayNightsInput = document.getElementById("stay-nights");
const stayDaysText = document.getElementById("stay-days");
const btnGenerate = document.getElementById("btn-generate");
const listContainer = document.getElementById("list-container");
const progressText = document.getElementById("progress-text");
const progressBar = document.getElementById("progress-bar");
const viewTemplateSelect = document.getElementById("view-template-select");
const viewTemplateContent = document.getElementById("view-template-content");
const btnSaveTemplate = document.getElementById("btn-save-template");
const btnAddCategory = document.getElementById("btn-add-category");

// ==========================================
// 初期化処理
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("持ち物アプリ: GAS連携モード起動");

  if (stayNightsInput) {
    stayNightsInput.addEventListener("input", () => {
      const nights = parseInt(stayNightsInput.value) || 1;
      if (stayDaysText) stayDaysText.textContent = nights + 1;
    });
  }

  // タブイベントの設定
  setupTabEvents();

  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener("click", saveTemplateMaster);
  }

  if (btnAddCategory) {
    btnAddCategory.addEventListener("click", addNewCategoryToTemplate);
  }

  if (viewTemplateSelect) {
    viewTemplateSelect.addEventListener("change", (e) => {
      renderTemplateDetails(e.target.value);
    });
  }

  if (btnGenerate) {
    btnGenerate.addEventListener("click", generateListFromTemplates);
  }

  // データ読み込みの実行
  await loadTemplates();
  await fetchCurrentList();
});

// ==========================================
// タブ切り替え処理（HTMLのID名に完全対応）
// ==========================================
function setupTabEvents() {
  const tabCreate = document.getElementById("tab-create");
  const tabView = document.getElementById("tab-view");
  const createModeArea = document.getElementById("create-mode-area");
  const viewModeArea = document.getElementById("view-mode-area");

  if (!tabCreate || !tabView || !createModeArea || !viewModeArea) {
    console.warn("タブ要素または切り替えエリアが見つかりません。");
    return;
  }

  // 1. 「リストを作成」タブをクリックした時
  tabCreate.addEventListener("click", () => {
    // タブ見た目の切り替え（アクティブ化）
    tabCreate.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm bg-white text-indigo-600 shadow-sm transition cursor-pointer";
    tabView.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm text-slate-500 hover:text-slate-800 transition cursor-pointer";

    // エリアの表示・非表示
    createModeArea.classList.remove("hidden");
    viewModeArea.classList.add("hidden");
  });

  // 2. 「テンプレートを確認」タブをクリックした時
  tabView.addEventListener("click", () => {
    // タブ見た目の切り替え（アクティブ化）
    tabView.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm bg-white text-indigo-600 shadow-sm transition cursor-pointer";
    tabCreate.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm text-slate-500 hover:text-slate-800 transition cursor-pointer";

    // エリアの表示・非表示
    viewModeArea.classList.remove("hidden");
    createModeArea.classList.add("hidden");

    // 🟢 テンプレート詳細を描画（選択されているドロップダウン値または最初のテンプレート）
    const viewTemplateSelect = document.getElementById("view-template-select");
    if (viewTemplateSelect && viewTemplateSelect.value) {
      renderTemplateDetails(viewTemplateSelect.value);
    } else if (templates && templates.length > 0) {
      renderTemplateDetails(templates[0]);
    }
  });
}
// ==========================================
// 1. スプレッドシートからテンプレート取得
// ==========================================
// 1. loadTemplates 内の通信を差し替え
async function loadTemplates() {
  try {
    // fetch から fetchJSONP へ変更
    const data = await fetchJSONP(`${GAS_API_URL}?action=get_templates`);
    templates = Array.isArray(data) ? data : [];

    const targetEl = document.getElementById("template-checkboxes") || document.getElementById("template-list");
    if (targetEl) {
      targetEl.innerHTML = templates.map((tplName, idx) => `
        <label class="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer">
          <input type="checkbox" value="${tplName}" class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 tpl-checkbox" ${idx === 0 ? 'checked' : ''}>
          <span class="text-sm font-medium text-slate-700">${tplName}</span>
        </label>
      `).join("");
    }

    if (viewTemplateSelect) {
      viewTemplateSelect.innerHTML = templates.map(tplName => `
        <option value="${tplName}">${tplName}</option>
      `).join("");

      if (templates.length > 0) {
        renderTemplateDetails(templates[0]);
      }
    }
  } catch (err) {
    console.error("テンプレート一覧取得エラー:", err);
  }
}
// ==========================================
// 2. 現在の持ち物リストの取得
// ==========================================
async function fetchCurrentList() {
  try {
    const data = await fetchJSONP(`${GAS_API_URL}?action=get_trip_list`);
    let fetchedItems = Array.isArray(data) ? data : [];

    fetchedItems.sort((a, b) => {
      let indexA = CATEGORY_ORDER.indexOf(a.category);
      let indexB = CATEGORY_ORDER.indexOf(b.category);

      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;

      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    currentItems = fetchedItems;
    renderChecklist();
    updateProgress();
  } catch (err) {
    console.error("リスト取得エラー:", err);
  }
}

// ==========================================
// 3. テンプレートから持ち物リスト作成
// ==========================================
async function generateListFromTemplates() {
  const selectedCheckboxes = document.querySelectorAll(".tpl-checkbox:checked");
  const selectedTemplateNames = Array.from(selectedCheckboxes).map(cb => cb.value);

  if (selectedTemplateNames.length === 0) {
    alert("少なくとも1つのテンプレートを選択してください！");
    return;
  }

  const nights = parseInt(stayNightsInput ? stayNightsInput.value : 1) || 1;

  if (btnGenerate) {
    btnGenerate.disabled = true;
    btnGenerate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> スプレッドシートから生成中...`;
  }

  try {
    const fetchPromises = selectedTemplateNames.map(tplName =>
      fetch(`${GAS_API_URL}?action=get_template_items&template=${encodeURIComponent(tplName)}`, { redirect: "follow" }).then(r => r.text()).then(t => JSON.parse(t))
    );
    const results = await Promise.all(fetchPromises);

    const mergedMap = new Map();

    results.forEach((masterItems, tplIndex) => {
      if (!Array.isArray(masterItems)) return;

      masterItems.forEach(item => {
        const key = `${item.category}_${item.item_name}`;
        const extraNights = Math.max(0, nights - 1);
        const computedQuantity = (Number(item.quantity) || 0) + ((Number(item.extra_quantity_per_night) || 0) * extraNights);
        const combinedSortOrder = ((tplIndex + 1) * 10000) + (Number(item.sort_order) || 0);

        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          existing.quantity += computedQuantity;
          if (combinedSortOrder < existing.sort_order) {
            existing.sort_order = combinedSortOrder;
          }
        } else {
          mergedMap.set(key, {
            category: item.category || "共通",
            item_name: item.item_name,
            quantity: computedQuantity,
            unit: item.unit || "個",
            is_checked: false,
            sort_order: combinedSortOrder
          });
        }
      });
    });

    const newTripList = Array.from(mergedMap.values());

    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "save_trip_list", items: newTripList })
    });

    const resData = await res.json();
    if (resData.error) throw new Error(resData.error);

    const conditionContainer = document.getElementById("generated-condition-text");
    const conditionDetails = document.getElementById("condition-details");
    if (conditionContainer && conditionDetails) {
      conditionDetails.textContent = `【条件】${selectedTemplateNames.join(" + ")}（${nights}泊 ${nights + 1}日）`;
      conditionContainer.classList.remove("hidden");
    }

    await fetchCurrentList();

  } catch (err) {
    console.error("リスト生成エラー:", err);
    alert("リスト作成に失敗しました: " + err.message);
  } finally {
    if (btnGenerate) {
      btnGenerate.disabled = false;
      btnGenerate.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> 選択した条件で持ち物リストを作成`;
    }
  }
}

// ==========================================
// 4. チェックリスト描画
// ==========================================
function renderChecklist() {
  if (!listContainer) return;

  if (currentItems.length === 0) {
    listContainer.className = "space-y-6";
    listContainer.innerHTML = `
      <div class="bg-white rounded-2xl p-8 text-center border border-slate-100 text-slate-400 shadow-sm">
        <i class="fa-solid fa-clipboard-list text-3xl mb-2 text-slate-300"></i>
        <p class="text-sm">上のパネルから条件を選んで<br>「リストを作成」ボタンを押してください！</p>
      </div>`;
    const conditionContainer = document.getElementById("generated-condition-text");
    if (conditionContainer) conditionContainer.classList.add("hidden");
    return;
  }

  const grouped = {};
  currentItems.forEach(item => {
    const cat = item.category || "共通";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  listContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start";
  listContainer.innerHTML = "";

  Object.keys(grouped).forEach(catName => {
    const items = grouped[catName];
    const catCard = document.createElement("div");
    catCard.className = "bg-white rounded-2xl p-4 border border-slate-100 shadow-sm";

    let html = `
      <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <h3 class="font-bold text-slate-700 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          ${catName}
        </h3>
        <span class="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
          ${items.filter(i => i.is_checked).length} / ${items.length}
        </span>
      </div>
      <div class="space-y-1.5">
    `;

    items.forEach(item => {
      html += `
        <label class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-id="${item.id}" ${item.is_checked ? "checked" : ""} class="item-checkbox w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500">
            <span class="text-sm text-slate-700 group-hover:text-slate-900 ${item.is_checked ? "line-through text-slate-300" : ""}">${item.item_name}</span>
          </div>
          <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg ${item.is_checked ? "opacity-40" : ""}">${item.quantity} ${item.unit || "個"}</span>
        </label>
      `;
    });

    html += `</div>`;
    catCard.innerHTML = html;
    listContainer.appendChild(catCard);
  });

  listContainer.querySelectorAll(".item-checkbox").forEach(cb => {
    cb.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const item = currentItems.find(i => String(i.id) === String(id));
      if (item) {
        item.is_checked = e.target.checked;
        renderChecklist();
        updateProgress();
        
        await fetch(GAS_API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "save_trip_list", items: currentItems })
        });
      }
    });
  });
}

function updateProgress() {
  if (currentItems.length === 0) {
    if (progressText) progressText.textContent = "0%";
    if (progressBar) progressBar.style.width = "0%";
    return;
  }
  const checkedCount = currentItems.filter(i => i.is_checked).length;
  const percent = Math.round((checkedCount / currentItems.length) * 100);
  if (progressText) progressText.textContent = `${percent}%`;
  if (progressBar) progressBar.style.width = `${percent}%`;
}

// ==========================================
// 5. マスター編集フォーム描画
// ==========================================
async function renderTemplateDetails(templateName) {
  if (!viewTemplateContent) return;

  viewTemplateContent.innerHTML = `<div class="p-8 text-center text-slate-400"><i class="fa-solid fa-circle-notch animate-spin text-2xl"></i> スプレッドシートを読み込み中...</div>`;

  try {
    const data = await fetchJSONP(`${GAS_API_URL}?action=get_template_items&template=${encodeURIComponent(templateName)}`);
    editingTemplateItems = Array.isArray(data) ? data : [];

    renderTemplateEditForm();
  } catch (err) {
    console.error("テンプレート詳細取得エラー:", err);
    viewTemplateContent.innerHTML = `<div class="p-4 text-red-500 text-center">データの取得に失敗しました</div>`;
  }
}

function renderTemplateEditForm() {
  if (editingTemplateItems.length === 0) {
    viewTemplateContent.innerHTML = `
      <div class="p-8 text-center text-slate-400">
        項目がありません。「持物追加」ボタンで登録を開始してください。
      </div>`;
    return;
  }

  const grouped = {};
  editingTemplateItems.forEach((item, index) => {
    item.originalIndex = index;
    const cat = item.category || "共通";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  let html = `<div class="space-y-6">`;

  Object.keys(grouped).forEach(catName => {
    const items = grouped[catName];
    html += `
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/60">
        <div class="flex justify-between items-center mb-3">
          <h4 class="font-bold text-slate-700 text-sm flex items-center gap-2">
            <i class="fa-solid fa-folder text-emerald-500"></i> ${catName}
          </h4>
          <button type="button" class="btn-master-add text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1" data-category="${catName}">
            <i class="fa-solid fa-plus"></i> 持物追加
          </button>
        </div>
        <div class="space-y-2">
    `;

    items.forEach(item => {
      const idx = item.originalIndex;
      html += `
        <div class="flex flex-wrap md:flex-nowrap items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
          <input type="text" value="${item.item_name || ''}" placeholder="持ち物名" class="change-name flex-1 min-w-[120px] px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-1 focus:ring-emerald-500" data-index="${idx}">
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-400">基本</span>
            <input type="number" value="${item.quantity}" min="0" class="change-qty w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-1 focus:ring-emerald-500 text-center" data-index="${idx}">
          </div>
          <input type="text" value="${item.unit || '個'}" placeholder="単位" class="change-unit w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-1 focus:ring-emerald-500 text-center" data-index="${idx}">
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-400">+1泊</span>
            <input type="number" value="${item.extra_quantity_per_night || 0}" min="0" class="change-extra w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-1 focus:ring-emerald-500 text-center" data-index="${idx}">
          </div>
          <button type="button" class="btn-master-delete text-slate-300 hover:text-rose-500 p-1.5 transition-colors" data-index="${idx}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  html += `</div>`;
  viewTemplateContent.innerHTML = html;

  setupFormEventListeners();
}

function setupFormEventListeners() {
  viewTemplateContent.querySelectorAll(".change-name").forEach(el => el.addEventListener("input", (e) => {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined && editingTemplateItems[idx]) editingTemplateItems[idx].item_name = e.currentTarget.value;
  }));
  viewTemplateContent.querySelectorAll(".change-qty").forEach(el => el.addEventListener("input", (e) => {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined && editingTemplateItems[idx]) editingTemplateItems[idx].quantity = parseInt(e.currentTarget.value) || 0;
  }));
  viewTemplateContent.querySelectorAll(".change-unit").forEach(el => el.addEventListener("input", (e) => {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined && editingTemplateItems[idx]) editingTemplateItems[idx].unit = e.currentTarget.value;
  }));
  viewTemplateContent.querySelectorAll(".change-extra").forEach(el => el.addEventListener("input", (e) => {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined && editingTemplateItems[idx]) editingTemplateItems[idx].extra_quantity_per_night = parseInt(e.currentTarget.value) || 0;
  }));

  viewTemplateContent.querySelectorAll(".btn-master-delete").forEach(el => el.addEventListener("click", (e) => {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined) {
      editingTemplateItems.splice(idx, 1);
      renderTemplateEditForm();
    }
  }));

  viewTemplateContent.querySelectorAll(".btn-master-add").forEach(el => el.addEventListener("click", (e) => {
    const cat = e.currentTarget.dataset.category;
    editingTemplateItems.push({
      category: cat,
      item_name: "",
      quantity: 1,
      unit: "個",
      extra_quantity_per_night: 0
    });
    renderTemplateEditForm();
  }));
}

function addNewCategoryToTemplate() {
  const catName = prompt("新しいカテゴリを入力してください:", "共通");
  if (!catName || !catName.trim()) return;

  editingTemplateItems.push({
    category: catName.trim(),
    item_name: "",
    quantity: 1,
    unit: "個",
    extra_quantity_per_night: 0
  });
  renderTemplateEditForm();
}

// ==========================================
// 6. 一括保存処理
// ==========================================
async function saveTemplateMaster() {
  const selectEl = document.getElementById("view-template-select");
  const templateName = selectEl ? selectEl.value : null;
  const btn = document.getElementById("btn-save-template");

  if (!templateName) {
    alert("編集対象のテンプレートが正しく選択されていません。");
    return;
  }

  const validItems = editingTemplateItems.filter(item => item.item_name && item.item_name.trim());

  if (validItems.length === 0) {
    alert("保存する持ち物項目がありません。");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> スプレッドシートへ保存中...`;
  }

  try {
    const payload = {
      action: "save_template",
      template: templateName,
      items: validItems.map(item => ({
        category: item.category || "共通",
        item_name: item.item_name.trim(),
        quantity: Number(item.quantity) || 0,
        unit: item.unit || "個",
        extra_quantity_per_night: Number(item.extra_quantity_per_night) || 0
      }))
    };

    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error);

    alert("🎉 スプレッドシート（" + templateName + " シート）へ正常に保存しました！");
    await renderTemplateDetails(templateName);

  } catch (err) {
    console.error("スプレッドシート保存エラー:", err);
    alert("保存に失敗しました: " + (err.message || JSON.stringify(err)));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> テンプレートの変更をすべて保存`;
    }
  }
}
