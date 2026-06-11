
// ==========================================
// 1. Supabase 初期設定 (ご自身の情報に書き換えてください)
// ==========================================
const SUPABASE_URL = 'https://wexmfasuheekporlgcbf.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG1mYXN1aGVla3BvcmxnY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTYwMjIsImV4cCI6MjA5NjU5MjAyMn0.VSWvnIMb_RpsiukTj7WRYk4V1VuQ6aIZF3bJ9nuxgwc'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// HTML要素の取得
const templateOptionsContainer = document.getElementById("template-options");
const stayNightsInput = document.getElementById("stay-nights");
const stayDaysText = document.getElementById("stay-days");
const btnGenerate = document.getElementById("btn-generate");
const listContainer = document.getElementById("list-container");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");

// 【新規】タブ・確認モード用の要素
const tabCreate = document.getElementById("tab-create");
const tabView = document.getElementById("tab-view");
const createModeArea = document.getElementById("create-mode-area");
const viewModeArea = document.getElementById("view-mode-area");
const viewTemplateSelect = document.getElementById("view-template-select");
const viewTemplateContent = document.getElementById("view-template-content");

// アプリ内状態管理
let currentItems = [];
let allTemplates = []; // 読み込んだテンプレート一覧を保持

// ==========================================
// 2. 初期化処理 (読み込み時に動くもの)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("持ち物アプリ: 確認機能付きロジック起動");

  const btnSaveTemplate = document.getElementById("btn-save-template");
  const btnAddCategory = document.getElementById("btn-add-category");

  // 1. 泊数入力の連動変更
  if (stayNightsInput) {
    stayNightsInput.addEventListener("input", () => {
      const nights = parseInt(stayNightsInput.value) || 1;
      if (stayDaysText) stayDaysText.textContent = nights + 1;
    });
  }

  // 2. モード切り替えタブのイベント設定
  setupTabEvents();

  // 3. マスターテンプレート一覧の取得（作成用と確認用の両方に分配）
  await loadTemplates();

  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener("click", saveTemplateMaster);
  }

  // 変更一括保存ボタンのイベント
  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener("click", saveTemplateMaster);
  }
  
  // カテゴリ追加ボタンのイベント
  if (btnAddCategory) {
    btnAddCategory.addEventListener("click", () => {
      const cat = prompt("追加したい家族のカテゴリ名（例: 共通, 子供部屋 など）を入力してください:");
      if (cat) {
        // 空のアイテムを1つ作って末尾に追加
        editingTemplateItems.push({
          id: 'new_' + Date.now(),
          template_id: viewTemplateSelect.value,
          category: cat.trim(),
          item_name: '',
          quantity: 1,
          unit: '個',
          extra_quantity_per_night: 0,
          sort_order: editingTemplateItems.length + 1
        });
        renderTemplateEditForm();
      }
    });
  }

  // 4. 確認用ドロップダウンが変更された時のイベント
  if (viewTemplateSelect) {
    viewTemplateSelect.addEventListener("change", (e) => {
      renderTemplateDetails(e.target.value);
    });
  }

  // 5. 現在のチェックリストの初回読み込み
  await fetchCurrentList();

  // 6. Supabaseのリアルタイム同期を開始
  setupRealtimeSubscription();

  // 7. ボタンイベント設定
  if (btnGenerate) {
    btnGenerate.addEventListener("click", generateListFromTemplates);
  }
});

// ==========================================
// 【新規】タブ切り替えのUI制御
// ==========================================
function setupTabEvents() {
  if (!tabCreate || !tabView || !createModeArea || !viewModeArea) return;

  tabCreate.addEventListener("click", () => {
    // リスト作成モードをアクティブに
    tabCreate.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm bg-white text-indigo-600 shadow-sm transition";
    tabView.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm text-slate-500 hover:text-slate-800 transition";
    createModeArea.classList.remove("hidden");
    viewModeArea.classList.add("hidden");
  });

  tabView.addEventListener("click", () => {
    // テンプレート確認モードをアクティブに
    tabView.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm bg-white text-indigo-600 shadow-sm transition";
    tabCreate.className = "flex-1 py-2 px-4 rounded-lg font-bold text-sm text-slate-500 hover:text-slate-800 transition";
    createModeArea.classList.add("hidden");
    viewModeArea.classList.remove("hidden");

    // 確認画面を開いた時、選択されているテンプレートの詳細を初回描画
    if (viewTemplateSelect && viewTemplateSelect.value) {
      renderTemplateDetails(viewTemplateSelect.value);
    }
  });
}

// ==========================================
// 3. テンプレート一覧を読み込んでUIに表示 (分配処理に拡張)
// ==========================================
async function loadTemplates() {
  const { data: templates, error } = await supabaseClient
    .from("templates")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("テンプレート取得エラー:", error);
    if (templateOptionsContainer) templateOptionsContainer.innerHTML = `<div class="text-red-500 text-xs">読み込みに失敗しました</div>`;
    return;
  }

  allTemplates = templates || [];

  // --- A. 従来の「作成パネル」へのチェックボックス描画 ---
  if (templateOptionsContainer) {
    templateOptionsContainer.innerHTML = "";
    if (allTemplates.length > 0) {
      allTemplates.forEach(tpl => {
        const label = document.createElement("label");
        label.className = "flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-lg cursor-pointer hover:bg-slate-100 transition";
        label.innerHTML = `
          <input type="checkbox" name="template-select" value="${tpl.id}" class="rounded text-indigo-600 focus:ring-indigo-400">
          <span class="font-medium text-slate-700">${tpl.name}</span>
        `;
        templateOptionsContainer.appendChild(label);
      });
    } else {
      templateOptionsContainer.innerHTML = `<div class="text-slate-400 text-xs py-2">有効なテンプレートがありません</div>`;
    }
  }

  // --- B. 【新規】「確認パネル」のセレクトボックスへの挿入 ---
  if (viewTemplateSelect) {
    viewTemplateSelect.innerHTML = allTemplates.map(tpl => 
      `<option value="${tpl.id}">${tpl.name}</option>`
    ).join("");
  }
}

// ==========================================
// テンプレートデータを取得して編集用配列へ格納
// ==========================================
async function renderTemplateDetails(templateId) {
  if (!viewTemplateContent || !templateId) return;

  viewTemplateContent.innerHTML = `
    <div class="text-center py-8 text-slate-400">
      <i class="fa-solid fa-circle-notch animate-spin text-xl mb-2 text-indigo-400"></i>
      <p class="text-xs">マスターデータを読み込み中...</p>
    </div>`;

  const { data: items, error } = await supabaseClient
    .from("template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("テンプレートアイテムの取得失敗:", error);
    viewTemplateContent.innerHTML = `<div class="text-red-500 text-sm p-4">データの取得に失敗しました。</div>`;
    return;
  }

  // 編集用の一時配列にデータをコピー
  editingTemplateItems = items || [];
  renderTemplateEditForm();
}

// ==========================================
// 編集用配列を元に、画面にフォームをレンダリングする（並び替え・追加・削除対応）
// ==========================================
function renderTemplateEditForm() {
  if (!viewTemplateContent) return;
  viewTemplateContent.innerHTML = "";

  if (editingTemplateItems.length === 0) {
    viewTemplateContent.innerHTML = `<div class="text-slate-400 text-xs text-center py-6">項目がありません。右上のボタンからカテゴリを追加してください。</div>`;
    return;
  }

  // カテゴリごとにグループ化
  const grouped = {};
  editingTemplateItems.forEach((item, index) => {
    // 配列内の本来のインデックスを保持させておく
    item.originalIndex = index;
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  });

  for (const category in grouped) {
    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4";

    // ヘッダー（カテゴリ名 ＆ そのカテゴリへの行追加ボタン）
    const header = document.createElement("div");
    header.className = "flex justify-between items-center mb-3 pb-2 border-b border-slate-100";
    header.innerHTML = `
      <h4 class="text-sm font-bold text-slate-800"><i class="fa-solid fa-user text-indigo-400 mr-1.5"></i>${category}</h4>
      <button class="btn-master-add text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-2 py-1 rounded-md transition" data-category="${category}">
        <i class="fa-solid fa-plus mr-1"></i>持物追加
      </button>
    `;
    card.appendChild(header);

    // 各持ち物行のフォーム生成
    const listWrapper = document.createElement("div");
    listWrapper.className = "space-y-2";

    grouped[category].forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "flex items-center gap-1.5 p-1.5 hover:bg-slate-50 rounded-lg transition text-xs";

      // 🔼 🔽 並び替えボタンの活性・非活性制御
      const isFirst = idx === 0;
      const isLast = idx === grouped[category].length - 1;

      row.innerHTML = `
        <div class="flex flex-col gap-0.5">
          <button class="btn-move-up text-slate-400 hover:text-indigo-600 disabled:opacity-20" ${isFirst ? 'disabled' : ''} data-index="${item.originalIndex}"><i class="fa-solid fa-caret-up text-sm"></i></button>
          <button class="btn-move-down text-slate-400 hover:text-indigo-600 disabled:opacity-20" ${isLast ? 'disabled' : ''} data-index="${item.originalIndex}"><i class="fa-solid fa-caret-down text-sm"></i></button>
        </div>
        
        <input type="text" value="${item.item_name || ''}" placeholder="持ち物名" class="change-name flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700" data-index="${item.originalIndex}">
        
        <input type="number" value="${item.quantity}" min="0" class="change-qty w-11 px-1 py-1.5 border border-slate-200 rounded-lg font-bold text-center text-slate-700" data-index="${item.originalIndex}">
        
        <input type="text" value="${item.unit || '個'}" placeholder="単位" class="change-unit w-10 px-1 py-1.5 border border-slate-200 rounded-lg text-center text-slate-600" data-index="${item.originalIndex}">
        
        <div class="flex items-center gap-0.5 bg-indigo-50/50 rounded-lg px-1 py-0.5 border border-indigo-100/30">
          <span class="text-[10px] text-indigo-400 font-bold">+</span>
          <input type="number" value="${item.extra_quantity_per_night || 0}" min="0" class="change-extra w-9 bg-transparent font-semibold text-center text-indigo-600 focus:outline-none" data-index="${item.originalIndex}">
        </div>

        <button class="btn-master-del text-slate-300 hover:text-red-500 p-1 transition" data-index="${item.originalIndex}">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      listWrapper.appendChild(row);
    });
    card.appendChild(listWrapper);
    viewTemplateContent.appendChild(card);
  }

  // --- 各種入力変更・ボタン操作のイベントバインド ---
  setupFormEventListeners();
}

// フォーム内の文字変更や各ボタンの挙動を一時配列にリアルタイム連動させる
function setupFormEventListeners() {
  // 1. 文字や数値の入力を配列に同期
  viewTemplateContent.querySelectorAll(".change-name").forEach(el => el.addEventListener("input", (e) => { editingTemplateItems[e.target.dataset.index].item_name = e.target.value; }));
  viewTemplateContent.querySelectorAll(".change-qty").forEach(el => el.addEventListener("input", (e) => { editingTemplateItems[e.target.dataset.index].quantity = parseInt(e.target.value) || 0; }));
  viewTemplateContent.querySelectorAll(".change-unit").forEach(el => el.addEventListener("input", (e) => { editingTemplateItems[e.target.dataset.index].unit = e.target.value; }));
  viewTemplateContent.querySelectorAll(".change-extra").forEach(el => el.addEventListener("input", (e) => { editingTemplateItems[e.target.dataset.index].extra_quantity_per_night = parseInt(e.target.value) || 0; }));

  // 2. 🔼 上に移動
  viewTemplateContent.querySelectorAll(".btn-move-up").forEach(btn => btn.addEventListener("click", (e) => {
    const idx = parseInt(e.currentTarget.dataset.index);
    swapItems(idx, idx - 1);
  }));

  // 3. 🔽 下に移動
  viewTemplateContent.querySelectorAll(".btn-move-down").forEach(btn => btn.addEventListener("click", (e) => {
    const idx = parseInt(e.currentTarget.dataset.index);
    swapItems(idx, idx + 1);
  }));

  // 4. ❌ 行削除
  viewTemplateContent.querySelectorAll(".btn-master-del").forEach(btn => btn.addEventListener("click", (e) => {
    const idx = parseInt(e.currentTarget.dataset.index);
    editingTemplateItems.splice(idx, 1); // 配列から除去
    renderTemplateEditForm(); // 再描画
  }));

  // 5. ➕ 持ち物の行追加
  viewTemplateContent.querySelectorAll(".btn-master-add").forEach(btn => btn.addEventListener("click", (e) => {
    const cat = e.currentTarget.dataset.category;
    // 現在のカテゴリの最後のアイテムの位置を探して、そこに滑り込ませる
    let insertIndex = editingTemplateItems.length;
    for (let i = editingTemplateItems.length - 1; i >= 0; i--) {
      if (editingTemplateItems[i].category === cat) {
        insertIndex = i + 1;
        break;
      }
    }
    editingTemplateItems.splice(insertIndex, 0, {
      id: 'new_' + Date.now() + Math.random().toString(36).substr(2, 5), // バニラなテンポラリID
      template_id: viewTemplateSelect.value,
      category: cat,
      item_name: '',
      quantity: 1,
      unit: '個',
      extra_quantity_per_night: 0,
      sort_order: insertIndex + 1
    });
    renderTemplateEditForm();
  }));
}

// 配列の要素を入れ替える（並び替え）
function swapItems(idx1, idx2) {
  const temp = editingTemplateItems[idx1];
  editingTemplateItems[idx1] = editingTemplateItems[idx2];
  editingTemplateItems[idx2] = temp;
  renderTemplateEditForm();
}

// ==========================================
// 4. 現在有効なチェックリスト (`trip_list_items`) を取得して描画
// ==========================================
async function fetchCurrentList() {
  // ✨【修正】sort_order を優先して並び替えることで、個別追加（9999）が最後尾になります
  const { data: items, error } = await supabaseClient
    .from("trip_list_items")
    .select("*")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true }) // 👈 並び順（sort_order）を最優先にする
    .order("id", { ascending: true });         // 同順位（個別追加同士）なら追加した順

  if (error) {
    console.error("リスト取得エラー:", error);
    return;
  }

  currentItems = items || [];
  renderChecklist();
  updateProgress();
}


// ==========================================
// 5. マスターから計算して新規リストを生成（上書き）するロジック
// ==========================================

async function generateListFromTemplates() {
  const checkedBoxes = document.querySelectorAll('input[name="template-select"]:checked');
  if (checkedBoxes.length === 0) {
    alert("少なくとも1つのリストにチェックを入れてください！");
    return;
  }
  
  const selectedTemplateIds = Array.from(checkedBoxes).map(box => box.value);
  const selectedTemplateNames = Array.from(checkedBoxes).map(box => {
    return box.nextElementSibling ? box.nextElementSibling.textContent.trim() : "不明なリスト";
  });

  const nights = parseInt(stayNightsInput.value) || 1;

  if (!confirm(`選択された要素と「${nights}泊」の条件で、現在のリストをリセットして新しく作り直します。よろしいですか？`)) {
    return;
  }

  btnGenerate.disabled = true;
  btnGenerate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> 生成中...`;

  try {
    // ✨【修正】ここでも sort_order 順にマスターデータを取得します
    const { data: masterItems, error: masterError } = await supabaseClient
      .from("template_items")
      .select("*")
      .in("template_id", selectedTemplateIds)
      .order("sort_order", { ascending: true }); // 並び順を維持して取得

    if (masterError) throw masterError;

    if (!masterItems || masterItems.length === 0) {
      alert("選ばれたテンプレートの中に持ち物データが見つかりませんでした。");
      btnGenerate.disabled = false;
      return;
    }

    // Mapを使って合算する際、最初に登場した順番（sort_order）を記憶できるようにします
    const mergedMap = new Map();
    masterItems.forEach(item => {
      const key = `${item.category}_${item.item_name}`;
      const extraNights = nights - 1;
      const computedQuantity = item.quantity + (item.extra_quantity_per_night * (extraNights > 0 ? extraNights : 0));

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.quantity += computedQuantity;
      } else {
        // ✨ 新規追加時に、マスターが持っていた sort_order を一緒に保管します
        mergedMap.set(key, {
          category: item.category,
          item_name: item.item_name,
          quantity: computedQuantity,
          unit: item.unit || "個",
          is_checked: false,
          sort_order: item.sort_order // 👈 ここで並び順を引き継ぐ
        });
      }
    });

    // インサート用レコードの配列。JSのMapは挿入順が維持されるため、すでに綺麗に並んでいます。
    const newRecordsToInsert = Array.from(mergedMap.values());

    const { error: deleteError } = await supabaseClient
      .from("trip_list_items")
      .delete()
      .gt("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) throw deleteError;

    // ✨ 新しい trip_list_items に並び順情報付きで一括登録
    // (※もし trip_list_items テーブルに sort_order 列がなくても、PostgreSQLはインサートされた順にデータを格納・返却する傾向がありますが、
    //  Mapの配列順のまま一気にインサートされるため順番が維持されます)
    const { error: insertError } = await supabaseClient
      .from("trip_list_items")
      .insert(newRecordsToInsert);

    if (insertError) throw insertError;

    // 条件テキストの表示処理
    const conditionContainer = document.getElementById("generated-condition-text");
    if (conditionContainer) {
      const templateListText = selectedTemplateNames.join(" ＋ ");
      const daysText = nights === 1 && templateListText.includes("ピクニック") ? "日帰り" : `${nights}泊${nights + 1}日`;
      
      conditionContainer.innerHTML = `
        <div class="flex items-start gap-1">
          <i class="fa-solid fa-info-circle text-indigo-400 mt-0.5"></i>
          <div>
            <span class="font-bold text-slate-500">現在の作成条件:</span><br>
            <span class="text-slate-600 font-semibold">${templateListText}</span> 
            <span class="mx-1 text-slate-300">|</span> 
            <span class="bg-indigo-50 text-indigo-600 px-1.5 py-0.2 rounded font-bold">${daysText}</span>
          </div>
        </div>
      `;
      conditionContainer.classList.remove("hidden");
    }

    await fetchCurrentList();

  } catch (err) {
    console.error("生成プロセス全体でエラー発生:", err);
    alert("エラーが発生しました: " + (err.message || JSON.stringify(err)));
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> この条件でリストを作成・上書き`;
  }
}

// ==========================================
// 6. チェックのON/OFF切り替え
// ==========================================
async function toggleItemCheck(id, currentStatus) {
  const { error } = await supabaseClient
    .from("trip_list_items")
    .update({ is_checked: !currentStatus })
    .eq("id", id);

  if (error) {
    console.error("チェック更新エラー:", error);
  }
}

// ==========================================
// 7. 画面へのチェックリスト描画（個別追加機能付き）
// ==========================================
function renderChecklist() {
  if (!listContainer) return;

  if (currentItems.length === 0) {
    listContainer.innerHTML = `
      <div class="bg-white rounded-2xl p-8 text-center border border-slate-100 text-slate-400 shadow-sm">
        <i class="fa-solid fa-clipboard-list text-3xl mb-2 text-slate-300"></i>
        <p class="text-sm">上のパネルから条件を選んで<br>「リストを作成」ボタンを押してください！</p>
      </div>`;
    return;
  }

  // カテゴリ（誰）ごとにグループ化
  const grouped = {};
  currentItems.forEach(item => {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  });

  listContainer.innerHTML = "";

  for (const category in grouped) {
    const categoryCard = document.createElement("div");
    categoryCard.className = "bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4";

    // --- カードヘッダー（追加ボタン付きに拡張） ---
    const header = document.createElement("h3");
    header.className = "text-md font-bold text-slate-800 mb-3 pb-1.5 border-b border-slate-100 flex justify-between items-center";
    
    const catItems = grouped[category];
    const checkedCount = catItems.filter(i => i.is_checked).length;
    
    header.innerHTML = `
      <div class="flex items-center gap-1.5">
        <i class="fa-solid fa-user text-indigo-400 text-sm"></i>
        <span>${category}</span>
        <span class="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.2 rounded-full ml-1">${checkedCount}/${catItems.length}</span>
      </div>
      <button class="btn-add-item text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100/70 px-2 py-1 rounded-lg transition cursor-pointer" data-category="${category}">
        <i class="fa-solid fa-plus text-[10px]"></i>追加
      </button>
    `;
    categoryCard.appendChild(header);

    // --- 【重要】入力フォームを表示するためのコンテナエリア ---
    const formContainer = document.createElement("div");
    formContainer.className = "hidden mb-3 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2";
    formContainer.innerHTML = `
      <div class="flex gap-2">
        <input type="text" placeholder="持ち物名" class="input-name flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
        <input type="number" value="1" min="1" class="input-qty w-14 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
        <input type="text" value="個" class="input-unit w-12 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
      </div>
      <div class="flex justify-end gap-1.5">
        <button class="btn-cancel-add text-[11px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1">キャンセル</button>
        <button class="btn-submit-add bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm transition">保存</button>
      </div>
    `;
    categoryCard.appendChild(formContainer);

    // --- 持ち物一覧リスト ---
    const itemsList = document.createElement("div");
    itemsList.className = "space-y-3";

    catItems.forEach(item => {
      const itemRow = document.createElement("div");
      itemRow.className = "flex items-center justify-between py-1.5 px-1 hover:bg-slate-50 rounded-lg transition duration-150";
      
      itemRow.innerHTML = `
        <label class="flex items-center gap-3 cursor-pointer flex-1 select-none">
          <input type="checkbox" ${item.is_checked ? "checked" : ""} class="checkbox-large rounded text-indigo-600 focus:ring-indigo-400 cursor-pointer">
          <span class="text-sm font-medium ${item.is_checked ? 'text-slate-400 line-through' : 'text-slate-700'}">${item.item_name}</span>
        </label>
        <span class="text-xs font-bold ${item.is_checked ? 'text-slate-300' : 'text-slate-400'} bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">
          ${item.quantity} ${item.unit}
        </span>
      `;

      const checkbox = itemRow.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener("change", () => toggleItemCheck(item.id, item.is_checked));
      }

      itemsList.appendChild(itemRow);
    });
    categoryCard.appendChild(itemsList);

    // --- 追加ボタンとフォームの開閉イベントを仕込む ---
    const btnAdd = categoryCard.querySelector(".btn-add-item");
    const btnCancel = categoryCard.querySelector(".btn-cancel-add");
    const btnSubmit = categoryCard.querySelector(".btn-submit-add");
    
    btnAdd.addEventListener("click", () => {
      formContainer.classList.toggle("hidden");
      if (!formContainer.classList.contains("hidden")) {
        formContainer.querySelector(".input-name").focus();
      }
    });

    btnCancel.addEventListener("click", () => {
      formContainer.classList.add("hidden");
    });

    btnSubmit.addEventListener("click", () => {
      addNewItemToTripList(category, formContainer);
    });

    listContainer.appendChild(categoryCard);
  }
}

// ==========================================
// 【新規追加】個別の持ち物を新しく trip_list_items へインサートする処理
// ==========================================
async function addNewItemToTripList(category, formContainer) {
  const nameInput = formContainer.querySelector(".input-name");
  const qtyInput = formContainer.querySelector(".input-qty");
  const unitInput = formContainer.querySelector(".input-unit");
  const btnSubmit = formContainer.querySelector(".btn-submit-add");

  const itemName = nameInput.value.trim();
  const quantity = parseInt(qtyInput.value) || 1;
  const unit = unitInput.value.trim() || "個";

  if (!itemName) {
    alert("持ち物名を入力してください！");
    nameInput.focus();
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i>`;

  const newRecord = {
    category: category,
    item_name: itemName,
    quantity: quantity,
    unit: unit,
    is_checked: false
  };

  // 💡 もし trip_list_items に sort_order 列が存在している場合は、一番最後に並ぶように大きな値を入れておきます
  // (なければ自動で無視される、または一応オブジェクトに含めておいても大丈夫です)
  newRecord.sort_order = 9999;

  const { error } = await supabaseClient
    .from("trip_list_items")
    .insert([newRecord]);

  if (error) {
    console.error("個別アイテムの追加失敗:", error);
    alert("追加に失敗しました。");
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = "保存";
  } else {
    // 成功したらフォームをクリアして隠す (リアルタイム同期で画面は自動更新されます)
    nameInput.value = "";
    qtyInput.value = "1";
    unitInput.value = "個";
    formContainer.classList.add("hidden");
  }
}

// ==========================================
// 8. 進捗バーの更新
// ==========================================
function updateProgress() {
  if (!progressBar || !progressText) return;

  if (currentItems.length === 0) {
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
    return;
  }

  const checkedCount = currentItems.filter(item => item.is_checked).length;
  const percent = Math.round((checkedCount / currentItems.length) * 100);

  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

// ==========================================
// 9. リアルタイム同期設定
// ==========================================
function setupRealtimeSubscription() {
  supabaseClient
    .channel("public:trip_list_items")
    .on("postgres_changes", { event: "*", pattern: "public", table: "trip_list_items" }, () => {
      fetchCurrentList();
    })
    .subscribe();
}

// ==========================================
// 【新規追加】編集したマスターデータをSupabaseへ一括保存
// ==========================================
async function saveTemplateMaster() {
  const templateId = viewTemplateSelect.value;
  if (!templateId) return;

  // バリデーション：持ち物名が空っぽの行がないかチェック
  const hasEmptyName = editingTemplateItems.some(item => !item.item_name.trim());
  if (hasEmptyName) {
    alert("持ち物名が空欄の項目があります。入力するか削除してください。");
    return;
  }

  btnSaveTemplate.disabled = true;
  btnSaveTemplate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> マスターデータを保存中...`;

  try {
    // 1. 現在の並び順（配列のインデックス順）をそのまま sort_order にセットし直す
    //    同時に、新しく追加した一時的なID（new_xxx）は、データベース側で自動生成（UUID）させるために id 列を除外する
    const recordsToUpsert = editingTemplateItems.map((item, index) => {
      const record = {
        template_id: item.template_id,
        category: item.category,
        item_name: item.item_name.trim(),
        quantity: item.quantity,
        unit: item.unit,
        extra_quantity_per_night: item.extra_quantity_per_night,
        sort_order: index + 1 // ✨ ここで完璧な連番が再割り当てされます
      };
      // 既存データ（UUIDを保持しているもの）であればIDを指定して上書きさせる
      if (item.id && !item.id.toString().startsWith('new_')) {
        record.id = item.id;
      }
      return record;
    });

    // 2. データベース側の「今ある項目」を一旦リセットして、新しい並び順・項目で登録し直す
    // (※upsertだと画面から「削除した項目」がDBに残ってしまうため、一度該当template_idのアイテムを全消去してinsertするのが最も確実です)
    const { error: deleteError } = await supabaseClient
      .from("template_items")
      .delete()
      .eq("template_id", templateId);

    if (deleteError) throw deleteError;

    // 3. 新しい配列を一括インサート
    if (recordsToUpsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from("template_items")
        .insert(recordsToUpsert);

      if (insertError) throw insertError;
    }

    alert("🎉 テンプレートの変更（項目・数量・単位・順序）をすべて正常に保存しました！");
    
    // マスターが書き換わったので、現在の選択データを再読込
    await renderTemplateDetails(templateId);
    
    // 表側のチェックボックス一覧用マスターも更新
    await loadTemplates();

  } catch (err) {
    console.error("マスター保存エラー:", err);
    alert("保存に失敗しました: " + (err.message || JSON.stringify(err)));
  } finally {
    btnSaveTemplate.disabled = false;
    btnSaveTemplate.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> テンプレートの変更をすべて保存`;
  }
}
