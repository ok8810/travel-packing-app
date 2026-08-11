// ==========================================
// Google Apps Script (GAS) 連携設定
// ==========================================
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxEzdHaZDIUjGiDP-03EJKKAZDq0fe_OUAPk3cuwfqo4wba7nQHrtPxxRR3RoCCZJG0wQ/exec";

// アプリのグローバル状態
let templates = [];            // テンプレート名（シート名）一覧
let currentItems = [];         // 現在の旅行持ち物リスト
let editingTemplateItems = []; // 編集中のマスターテンプレート項目

// 🟢 優先させたいカテゴリ（家族）の並び順（お好みに合わせて並び替えてください）
const CATEGORY_ORDER = ["琴晴", "穂香", "遥菜", "ママ", "パパ", "共通"];

// DOM要素の取得
const templateCheckboxes = document.getElementById("template-checkboxes");
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
// アプリ初期化
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("持ち物アプリ: GAS連携モード起動");

  // 1. 泊数入力の連動変更
  if (stayNightsInput) {
    stayNightsInput.addEventListener("input", () => {
      const nights = parseInt(stayNightsInput.value) || 1;
      if (stayDaysText) stayDaysText.textContent = nights + 1;
    });
  }

  // 2. タブ切り替えイベント
  setupTabEvents();

  // 3. 一括保存ボタンイベント設定
  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener("click", saveTemplateMaster);
  }

  // 4. カテゴリ追加ボタンイベント
  if (btnAddCategory) {
    btnAddCategory.addEventListener("click", addNewCategoryToTemplate);
  }

  // 5. 確認用ドロップダウンの変更イベント
  if (viewTemplateSelect) {
    viewTemplateSelect.addEventListener("change", (e) => {
      renderTemplateDetails(e.target.value);
    });
  }

  // 6. リスト作成ボタンイベント
  if (btnGenerate) {
    btnGenerate.addEventListener("click", generateListFromTemplates);
  }

  // 7. 初期データの読み込み（テンプレート＆現在のリスト）
  await loadTemplates();
  await fetchCurrentList();
});

// ==========================================
// タブ切り替え処理
// ==========================================
function setupTabEvents() {
  const tabGenerate = document.getElementById("tab-generate");
  const tabMaster = document.getElementById("tab-master");
  const panelGenerate = document.getElementById("panel-generate");
  const panelMaster = document.getElementById("panel-master");

  if (!tabGenerate || !tabMaster) return;

  tabGenerate.addEventListener("click", () => {
    tabGenerate.className = "flex-1 py-3 px-4 text-center font-bold border-b-2 border-emerald-500 text-emerald-600 bg-emerald-50/50";
    tabMaster.className = "flex-1 py-3 px-4 text-center font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600";
    panelGenerate.classList.remove("hidden");
    panelMaster.classList.add("hidden");
  });

  tabMaster.addEventListener("click", () => {
    tabMaster.className = "flex-1 py-3 px-4 text-center font-bold border-b-2 border-emerald-500 text-emerald-600 bg-emerald-50/50";
    tabGenerate.className = "flex-1 py-3 px-4 text-center font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600";
    panelMaster.classList.remove("hidden");
    panelGenerate.classList.add("hidden");

    if (viewTemplateSelect && viewTemplateSelect.value) {
      renderTemplateDetails(viewTemplateSelect.value);
    }
  });
}

// ==========================================
// 1. スプレッドシートからテンプレート（シート一覧）取得
// ==========================================
async function loadTemplates() {
  try {
    const res = await fetch(`${GAS_API_URL}?action=get_templates`);
    const textData = await res.text(); // 一旦テキストとして取得
    templates = JSON.parse(textData);  // 安全にJSONパース

    if (!Array.isArray(templates)) templates = [];

    // 作成用チェックボックスのレンダリング
    if (templateCheckboxes) {
      templateCheckboxes.innerHTML = templates.map((tplName, idx) => `
        <label class="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer">
          <input type="checkbox" value="${tplName}" class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 tpl-checkbox" ${idx === 0 ? 'checked' : ''}>
          <span class="text-sm font-medium text-slate-700">${tplName}</span>
        </label>
      `).join("");
    }

    // マスター確認用ドロップダウンのレンダリング
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
// 2. 現在の持ち物リストの取得（GASより）
// ==========================================
async function fetchCurrentList() {
  try {
    const res = await fetch(`${GAS_API_URL}?action=get_trip_list`);
    const items = await res.json();

    let fetchedItems = Array.isArray(items) ? items : [];

    // 🟢 並び順設定：1. CATEGORY_ORDER順 ➔ 2. sort_order順
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
// 3. テンプレート選択から持ち物リストを新しく生成・合算
// ==========================================
async function generateListFromTemplates() {
  const selectedCheckboxes = document.querySelectorAll(".tpl-checkbox:checked");
  const selectedTemplateNames = Array.from(selectedCheckboxes).map(cb => cb.value);

  if (selectedTemplateNames.length === 0) {
    alert("少なくとも1つのテンプレートを選択してください！");
    return;
  }

  const nights = parseInt(stayNightsInput.value) || 1;

  btnGenerate.disabled = true;
  btnGenerate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> スプレッドシートから生成中...`;

  try {
    // 選択されたテンプレートの全アイテムを並列取得
    const fetchPromises = selectedTemplateNames.map(tplName =>
      fetch(`${GAS_API_URL}?action=get_template_items&template=${encodeURIComponent(tplName)}`).then(r => r.json())
    );
    const results = await Promise.all(fetchPromises);

    const mergedMap = new Map();

    results.forEach((masterItems, tplIndex) => {
      if (!Array.isArray(masterItems)) return;

      masterItems.forEach(item => {
        const key = `${item.category}_${item.item_name}`;
        const extraNights = Math.max(0, nights - 1);
        const computedQuantity = (Number(item.quantity) || 0) + ((Number(item.extra_quantity_per_night) || 0) * extraNights);

        // 🟢 テンプレート順 ➔ sort_order 順の計算
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

    // GASに保存（trip_list_itemsシートの上書き）
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "save_trip_list",
        items: newTripList
      })
    });

    const resData = await res.json();
    if (resData.error) throw new Error(resData.error);

    // 🟢 条件テキストを更新して表示（消えないように保護）
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
    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> 選択した条件で持ち物リストを作成`;
  }
}

// ==========================================
// 4. チェックリストのレンダリング
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
    
    // 🟢 リストが完全空のときだけ条件文を非表示にする
    const conditionContainer = document.getElementById("generated-condition-text");
    if (conditionContainer) conditionContainer.classList.add("hidden");
    return;
  }

  // カテゴリごとにグループ化
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

  // チェックボックスの変更イベント登録
  listContainer.querySelectorAll(".item-checkbox").forEach(cb => {
    cb.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const item = currentItems.find(i => String(i.id) === String(id));
      if (item) {
        item.is_checked = e.target.checked;
        renderChecklist();
        updateProgress();
        
        // 裏でGASに保存
        await fetch(GAS_API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "save_trip_list", items: currentItems })
        });
      }
    });
  });
}

// 進捗バーの更新
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
// 5. マスターテンプレート詳細の確認・編集フォーム描画
// ==========================================
async function renderTemplateDetails(templateName) {
  if (!viewTemplateContent) return;

  viewTemplateContent.innerHTML = `<div class="p-8 text-center text-slate-400"><i class="fa-solid fa-circle-notch animate-spin text-2xl"></i> スプレッドシートを読み込み中...</div>`;

  try {
    const res = await fetch(`${GAS_API_URL}?action=get_template_items&template=${encodeURIComponent(templateName)}`);
    const items = await res.json();

    editingTemplateItems = Array.isArray(items) ? items : [];

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

  // カテゴリごとにグループ化
  const grouped = {};
  editingTemplateItems.forEach((item, index) => {
    item.originalIndex = index; // 最新のインデックスを保持
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
  // 文字・数値入力を配列と即座に同期
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

  // 個別削除ボタン
  viewTemplateContent.querySelectorAll(".btn-master-delete").forEach(el => el.addEventListener("click", (e) => {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined) {
      editingTemplateItems.splice(idx, 1);
      renderTemplateEditForm();
    }
  }));

  // 持物追加ボタン
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

// 新規カテゴリ追加
function addNewCategoryToTemplate() {
  const catName = prompt("新しいカテゴリ（家族名など）を入力してください:", "共通");
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
// 6. スプレッドシートへ一括保存処理
// ==========================================
async function saveTemplateMaster() {
  const selectEl = document.getElementById("view-template-select");
  const templateName = selectEl ? selectEl.value : null;
  const btn = document.getElementById("btn-save-template");

  if (!templateName) {
    alert("編集対象のテンプレートが正しく選択されていません。");
    return;
  }

  // 空欄の行を安全に自動除外
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
