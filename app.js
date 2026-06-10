
// ==========================================
// 1. Supabase 初期設定 (ご自身の情報に書き換えてください)
// ==========================================
const SUPABASE_URL = 'https://wexmfasuheekporlgcbf.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG1mYXN1aGVla3BvcmxnY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTYwMjIsImV4cCI6MjA5NjU5MjAyMn0.VSWvnIMb_RpsiukTj7WRYk4V1VuQ6aIZF3bJ9nuxgwc'; 

// グローバル競合を避ける名前でクライアントを初期化
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// HTML要素の取得
const templateOptionsContainer = document.getElementById("template-options");
const stayNightsInput = document.getElementById("stay-nights");
const stayDaysText = document.getElementById("stay-days");
const btnGenerate = document.getElementById("btn-generate");
const listContainer = document.getElementById("list-container");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");

// アプリ内状態管理
let currentItems = [];

// ==========================================
// 2. 初期化処理 (読み込み時に動くもの)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("持ち物アプリ: 修正版ロジック起動");

  // 1. 泊数入力の連動変更 (例: 2泊 → 3日)
  if (stayNightsInput) {
    stayNightsInput.addEventListener("input", () => {
      const nights = parseInt(stayNightsInput.value) || 1;
      if (stayDaysText) stayDaysText.textContent = nights + 1;
    });
  }

  // 2. マスターテンプレート一覧の取得とチェックボックス描画
  await loadTemplates();

  // 3. 現在のチェックリストの初回読み込み
  await fetchCurrentList();

  // 4. Supabaseのリアルタイム同期 (Realtime) を開始
  setupRealtimeSubscription();

  // 5. ボタンイベント設定
  if (btnGenerate) {
    btnGenerate.addEventListener("click", generateListFromTemplates);
  }
});

// ==========================================
// 3. テンプレート一覧を読み込んでUIに表示
// ==========================================
async function loadTemplates() {
  if (!templateOptionsContainer) return;

  const { data: templates, error } = await supabaseClient
    .from("templates")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("テンプレート取得エラー:", error);
    templateOptionsContainer.innerHTML = `<div class="text-red-500 text-xs">読み込みに失敗しました</div>`;
    return;
  }

  templateOptionsContainer.innerHTML = "";
  if (templates && templates.length > 0) {
    templates.forEach(tpl => {
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

// ==========================================
// 4. 現在有効なチェックリスト (`trip_list_items`) を取得して描画
// ==========================================
async function fetchCurrentList() {
  const { data: items, error } = await supabaseClient
    .from("trip_list_items")
    .select("*")
    .order("category", { ascending: true })
    .order("id", { ascending: true });

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
  const nights = parseInt(stayNightsInput.value) || 1;

  if (!confirm(`選択された要素と「${nights}泊」の条件で、現在のリストをリセットして新しく作り直します。よろしいですか？`)) {
    return;
  }

  btnGenerate.disabled = true;
  btnGenerate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> 生成中...`;

  try {
    const { data: masterItems, error: masterError } = await supabaseClient
      .from("template_items")
      .select("*") 
      .in("template_id", selectedTemplateIds);

    if (masterError) throw masterError;

    if (!masterItems || masterItems.length === 0) {
      alert("選ばれたテンプレートの中に持ち物データが見つかりませんでした。");
      return;
    }

    const mergedMap = new Map();
    masterItems.forEach(item => {
      const key = `${item.category}_${item.item_name}`;
      const extraNights = nights - 1;
      const computedQuantity = item.quantity + (item.extra_quantity_per_night * (extraNights > 0 ? extraNights : 0));

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.quantity += computedQuantity;
      } else {
        mergedMap.set(key, {
          category: item.category,
          item_name: item.item_name,
          quantity: computedQuantity,
          unit: item.unit || "個",
          is_checked: false
        });
      }
    });

    const newRecordsToInsert = Array.from(mergedMap.values());

    // テーブルの全削除
    const { error: deleteError } = await supabaseClient
      .from("trip_list_items")
      .delete()
      .neq("id", 0);

    if (deleteError) throw deleteError;

    // 新データの一括インサート
    const { error: insertError } = await supabaseClient
      .from("trip_list_items")
      .insert(newRecordsToInsert);

    if (insertError) throw insertError;

    await fetchCurrentList();

  } catch (err) {
    console.error("生成プロセス全体でエラー発生:", err);
    alert("エラーが発生しました: " + err.message);
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> この条件でリストを作成・上書き`;
  }
}

// ==========================================
// 6. チェックのON/OFF切り替え（Supabase送信）
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
// 7. 画面へのチェックリスト描画
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

    const header = document.createElement("h3");
    header.className = "text-md font-bold text-slate-800 mb-3 pb-1.5 border-b border-slate-100 flex justify-between items-center";
    
    const catItems = grouped[category];
    const checkedCount = catItems.filter(i => i.is_checked).length;
    header.innerHTML = `
      <span><i class="fa-solid fa-user text-indigo-400 mr-1.5 text-sm"></i>${category}</span>
      <span class="text-xs bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">${checkedCount} / ${catItems.length}</span>
    `;
    categoryCard.appendChild(header);

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
    listContainer.appendChild(categoryCard);
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
// 9. リアルタイム同期設定 (関数を確実に定義)
// ==========================================
function setupRealtimeSubscription() {
  console.log("リアルタイム同期を開始します...");
  supabaseClient
    .channel("public:trip_list_items")
    .on("postgres_changes", { event: "*", pattern: "public", table: "trip_list_items" }, () => {
      fetchCurrentList();
    })
    .subscribe();
}
