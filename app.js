// 1. Supabaseの初期化設定（あなたのプロジェクトのキーに書き換えてください）
const MY_SUPABASE_PROJECT_URL = 'https://wexmfasuheekporlgcbf.supabase.co';
const MY_SUPABASE_ANON_PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG1mYXN1aGVla3BvcmxnY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTYwMjIsImV4cCI6MjA5NjU5MjAyMn0.VSWvnIMb_RpsiukTj7WRYk4V1VuQ6aIZF3bJ9nuxgwc';

// ライブラリを直接指定して接続し、世界で一つだけの変数名「mySupabaseDB」を作ります
const mySupabaseDB = window.supabase.createClient(MY_SUPABASE_PROJECT_URL, MY_SUPABASE_ANON_PUBLIC_KEY);

// HTMLの要素（部品）を取得
const listContainer = document.getElementById('packing-list');
const loadingElement = document.getElementById('loading');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// アプリ起動時に最初に実行する処理
async function initApp() {
    await fetchItems();
    setupRealtimeSubscription();
}

// データベースからデータを取得して画面に描画する関数
async function fetchItems() {
    const { data: items, error } = await mySupabaseDB
        .from('trip_list_items')
        .select('*')
        .order('item_name', { ascending: true });

    if (error) {
        console.error('データ取得エラー:', error);
        return;
    }

    listContainer.innerHTML = '';

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = `flex items-center p-3 rounded-lg border transition-all ${
            item.is_checked ? 'bg-gray-50 border-gray-200 text-gray-400' : 'bg-white border-gray-200 text-gray-800'
        }`;

        li.innerHTML = `
            <input type="checkbox" 
                   id="${item.id}" 
                   ${item.is_checked ? 'checked' : ''} 
                   class="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-3 cursor-pointer"
                   onchange="toggleCheck('${item.id}', this.checked)">
            <label for="${item.id}" class="flex-1 cursor-pointer font-medium ${item.is_checked ? 'line-through' : ''}">
                ${item.item_name} <span class="text-xs text-gray-400 ml-1">x${item.quantity}</span>
            </label>
        `;
        listContainer.appendChild(li);
    });

    loadingElement.classList.add('hidden');
    listContainer.classList.remove('hidden');

    updateProgressBar(items);
}

// チェックボックスが押されたときにデータベースを更新する関数
async function toggleCheck(itemId, isChecked) {
    const { error } = await mySupabaseDB
        .from('trip_list_items')
        .update({ is_checked: isChecked })
        .eq('id', itemId);

    if (error) {
        console.error('更新エラー:', error);
    }
}

// 進捗バー（％）の表示を計算して更新する関数
function updateProgressBar(items) {
    if (items.length === 0) return;
    const checkedCount = items.filter(item => item.is_checked).length;
    const percentage = Math.round((checkedCount / items.length) * 100);
    
    progressBar.style.width = `${percentage}%`;
    progressText.innerText = `${percentage}%`;
}

// 他端末での変更を秒速で検知して画面を自動更新する設定
function setupRealtimeSubscription() {
    mySupabaseDB
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'trip_list_items'
            },
            (payload) => {
                console.log('データベースに変更を検知しました！画面を再読込します。', payload);
                fetchItems();
            }
        )
        .subscribe();
}

// アプリの起動を実行
initApp();
