const FAVORITES_API_URL = "https://news-dashboard-favorites-api.babosun2.workers.dev";
const FAVORITES_PASSWORD_SESSION_KEY = "newsDashboard.favoritesPassword.v1";

let favoritesPassword = window.sessionStorage.getItem(FAVORITES_PASSWORD_SESSION_KEY) || "";
let favoritesUnlocked = false;
let favoritesRequestPending = false;

function encodeFavoritePassword(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function favoritesApi(path, options = {}, password = favoritesPassword) {
  const response = await fetch(`${FAVORITES_API_URL}${path}`, {
    ...options,
    cache: "no-store",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "X-Favorites-Key": encodeFavoritePassword(password),
      ...(options.headers || {})
    }
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = {};
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `즐겨찾기 서버 오류 (${response.status})`);
  }
  return payload;
}

function cloudFavoriteRowToItem(row) {
  return {
    billId: String(row.bill_id || ""),
    billNo: String(row.bill_id || ""),
    title: row.title || "제목 확인 중",
    category: row.category || "기타 주요법안",
    agency: row.agency || "기타",
    committee: "",
    proposer: "",
    month: state.month,
    stage: "-",
    previousStage: "-",
    change: "공용 주요법안으로 등록",
    changedDate: String(row.updated_at || row.added_at || "").slice(0, 10),
    summary: "",
    sourceUrl: ""
  };
}

function cloudFavoritePayload(item) {
  return {
    bill_id: itemKey(item),
    title: item.title || "",
    category: favoriteCategoryForItem(item).label,
    agency: item.agency || ""
  };
}

function saveCloudFavoriteSnapshot() {
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favoriteIds]));
  state.legacyFavoriteIds = new Set(state.favoriteIds);
}

async function fetchCloudFavorites(saveSnapshot = true) {
  const payload = await favoritesApi("/favorites", { method: "GET" });
  const rows = Array.isArray(payload.items) ? payload.items : [];

  state.favoriteIds = new Set();
  state.favoriteRows = new Map();
  rows.forEach(row => {
    const id = String(row.bill_id || "");
    if (!id) return;
    state.favoriteIds.add(id);
    state.favoriteRows.set(id, cloudFavoriteRowToItem(row));
  });
  state.sharedFavoritesAvailable = true;
  state.favoritesConnectionError = "";
  if (saveSnapshot) saveCloudFavoriteSnapshot();
}

async function importExistingLocalFavorites() {
  const items = [...state.legacyFavoriteIds]
    .filter(id => !state.favoriteIds.has(id))
    .map(id => state.data.find(item => itemKey(item) === id))
    .filter(Boolean);

  if (!items.length) return 0;
  await favoritesApi("/favorites", {
    method: "POST",
    body: JSON.stringify({ items: items.map(cloudFavoritePayload) })
  });
  return items.length;
}

async function unlockCloudFavorites() {
  if (favoritesUnlocked) return true;

  let password = favoritesPassword;
  if (!password) {
    password = window.prompt("주요법안현황 비밀번호를 입력하세요.") || "";
  }
  if (!password) return false;

  try {
    await favoritesApi("/auth", { method: "POST" }, password);
    favoritesPassword = password;
    window.sessionStorage.setItem(FAVORITES_PASSWORD_SESSION_KEY, password);
    favoritesUnlocked = true;

    await fetchCloudFavorites(false);
    await importExistingLocalFavorites();
    await fetchCloudFavorites(true);
    render();
    return true;
  } catch (error) {
    favoritesUnlocked = false;
    favoritesPassword = "";
    window.sessionStorage.removeItem(FAVORITES_PASSWORD_SESSION_KEY);
    window.alert(error.message || "비밀번호를 확인해 주세요.");
    return false;
  }
}

loadFavoriteIds = async function () {
  loadLegacyFavoriteIds();
  state.favoriteIds = new Set();
  state.favoriteRows = new Map();
  state.sharedFavoritesAvailable = false;
  state.favoritesConnectionError = "";
};

toggleFavorite = async function (item) {
  if (favoritesRequestPending || !(await unlockCloudFavorites())) return;
  favoritesRequestPending = true;
  const id = itemKey(item);

  try {
    if (state.favoriteIds.has(id)) {
      await favoritesApi(`/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
    } else {
      await favoritesApi("/favorites", {
        method: "POST",
        body: JSON.stringify(cloudFavoritePayload(item))
      });
    }
    await fetchCloudFavorites(true);
    render();
  } catch (error) {
    window.alert(`주요법안현황을 수정하지 못했습니다.\n${error.message || "연결 상태를 확인해 주세요."}`);
  } finally {
    favoritesRequestPending = false;
  }
};

showFavoritesPage = async function () {
  if (!(await unlockCloudFavorites())) return;
  $("#dashboardPage").hidden = true;
  $("#favoritesPage").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const renderPrivateFavoritesPanel = renderFavoritesPanel;
renderFavoritesPanel = function () {
  renderPrivateFavoritesPanel();
  if (!$("#favoritesStatus")) return;

  if (!favoritesUnlocked) {
    $("#favoriteHeaderCount").textContent = "";
    $("#favoritesStatus").textContent = "비밀번호 입력 후 공용 주요법안현황을 볼 수 있습니다.";
    return;
  }

  const items = favoriteItems();
  const groups = favoriteCategoryGroups(items);
  $("#favoritesStatus").textContent = items.length
    ? `공용 주요법안 ${items.length.toLocaleString()}건을 ${groups.length.toLocaleString()}개 관심 분야로 분류했습니다.`
    : "공용 주요법안이 아직 없습니다. 각 법안 제목 앞 별표를 눌러 등록해 주세요.";
};
