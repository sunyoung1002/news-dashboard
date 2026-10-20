const FAVORITES_API_URL = "https://news-dashboard-favorites-api.babosun2.workers.dev";
const FAVORITES_PASSWORD_SESSION_KEY = "newsDashboard.favoritesPassword.v1";
const FAVORITES_DETAIL_CACHE_KEY = "newsDashboard.favoriteBillDetails.v1";

let favoritesPassword = window.sessionStorage.getItem(FAVORITES_PASSWORD_SESSION_KEY) || "";
let favoritesUnlocked = false;
let favoritesRequestPending = false;
let claimedCollectedBillKeys = new Set();

// 계류 목록에서 빠지며 상세정보가 유실된 기존 공용 즐겨찾기 복구값.
// 이후 수집 데이터에 같은 의안이 다시 포함되면 최신 수집값이 이 값을 덮어쓴다.
const RECOVERED_FAVORITE_DETAILS = {
  "PRC_V2X6R0E5I1T3Z1P7I5O7R0R2Q2R5T1": {
    month: "2026-09",
    billNo: "의안번호 2220247",
    agency: "공정거래위원회",
    committee: "정무위원회",
    proposer: "정무위원장",
    stage: "공포·시행",
    previousStage: "본회의",
    change: "2026-08-20 원안가결 · 2026-09-08 공포",
    changedDate: "2026-09-08",
    summary: "기술유용 피해기업의 손해배상 입증을 돕기 위해 자료제출명령 제도를 확대하고, 영업비밀 보호를 위한 비밀유지명령 근거를 마련합니다. 공정거래위원회의 자료제출 의무를 강화하고, 무처분 결정 등에 대한 신고인의 이의신청 절차를 신설해 피해구제를 보강하는 내용입니다."
  }
};

function encodeFavoritePassword(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function normalizedBillNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizedBillTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function officialBillUrl(billId) {
  const id = String(billId || "").trim();
  return id && !id.startsWith("law-")
    ? `https://likms.assembly.go.kr/bill/billDetail.do?billId=${encodeURIComponent(id)}`
    : "";
}

function loadFavoriteDetailCache() {
  try {
    const rows = JSON.parse(window.localStorage.getItem(FAVORITES_DETAIL_CACHE_KEY) || "{}");
    return rows && typeof rows === "object" ? rows : {};
  } catch (_) {
    return {};
  }
}

function saveFavoriteDetailSnapshot(item) {
  if (!item) return;
  const id = itemKey(item);
  if (!id) return;
  const cache = loadFavoriteDetailCache();
  cache[id] = {
    billId: item.billId || id,
    billNo: item.billNo || "",
    title: item.title || "",
    category: favoriteCategoryForItem(item).label,
    agency: item.agency || "",
    committee: item.committee || "",
    proposer: item.proposer || "",
    month: item.month || state.month,
    stage: item.stage || "-",
    previousStage: item.previousStage || "-",
    change: item.change || "",
    changedDate: item.changedDate || "",
    summary: item.summary || "",
    sourceUrl: item.sourceUrl || officialBillUrl(item.billId || id)
  };
  const entries = Object.entries(cache).slice(-100);
  window.localStorage.setItem(FAVORITES_DETAIL_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function findCollectedBill(row) {
  const claim = item => {
    if (item) claimedCollectedBillKeys.add(itemKey(item));
    return item || null;
  };
  const rowId = String(row.bill_id || row.billId || "");
  const direct = state.data.find(item => itemKey(item) === rowId);
  if (direct) return claim(direct);

  const rowNumber = normalizedBillNumber(row.bill_no || row.billNo);
  if (rowNumber) {
    const byNumber = state.data.find(item => normalizedBillNumber(item.billNo) === rowNumber);
    if (byNumber) return claim(byNumber);
  }

  const title = normalizedBillTitle(row.title);
  if (!title) return null;
  let exactTitles = state.data.filter(item => normalizedBillTitle(item.title) === title);
  if (!exactTitles.length) return null;

  const agency = normalizedBillTitle(row.agency);
  const sameAgency = agency
    ? exactTitles.filter(item => normalizedBillTitle(item.agency) === agency)
    : [];
  if (sameAgency.length) exactTitles = sameAgency;

  const proposer = normalizedBillTitle(row.proposer);
  const sameProposer = proposer
    ? exactTitles.filter(item => normalizedBillTitle(item.proposer) === proposer)
    : [];
  if (sameProposer.length) exactTitles = sameProposer;

  const detailScore = item => [item.billNo, item.committee, item.proposer, item.stage, item.summary]
    .filter(value => value && !String(value).includes("확인 중") && value !== "-").length;
  exactTitles.sort((a, b) => {
    const aFree = claimedCollectedBillKeys.has(itemKey(a)) ? 0 : 1;
    const bFree = claimedCollectedBillKeys.has(itemKey(b)) ? 0 : 1;
    return bFree - aFree ||
      detailScore(b) - detailScore(a) ||
      String(b.month || "").localeCompare(String(a.month || "")) ||
      String(b.changedDate || "").localeCompare(String(a.changedDate || ""));
  });
  return claim(exactTitles[0]);
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
  const id = String(row.bill_id || "");
  const recovered = RECOVERED_FAVORITE_DETAILS[id] || {};
  const cached = loadFavoriteDetailCache()[id] || {};
  const collected = findCollectedBill(row) || {};
  const fallback = {
    billId: id,
    billNo: "의안번호 확인 중",
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
    sourceUrl: officialBillUrl(id)
  };
  const serverDetails = {
    billNo: row.bill_no || "",
    committee: row.committee || "",
    proposer: row.proposer || "",
    stage: row.stage || "",
    previousStage: row.previous_stage || "",
    change: row.change || "",
    changedDate: row.changed_date || "",
    summary: row.summary || "",
    sourceUrl: row.source_url || ""
  };
  Object.keys(serverDetails).forEach(key => {
    if (!serverDetails[key]) delete serverDetails[key];
  });
  const merged = { ...fallback, ...recovered, ...serverDetails, ...cached, ...collected };
  merged.billId = id || merged.billId;
  merged.title = row.title || merged.title;
  merged.category = row.category || merged.category;
  merged.agency = row.agency || merged.agency;
  merged.sourceUrl = merged.sourceUrl || officialBillUrl(merged.billId);
  return merged;
}

function cloudFavoritePayload(item) {
  return {
    bill_id: itemKey(item),
    bill_no: item.billNo || "",
    title: item.title || "",
    category: favoriteCategoryForItem(item).label,
    agency: item.agency || "",
    committee: item.committee || "",
    proposer: item.proposer || "",
    stage: item.stage || "",
    previous_stage: item.previousStage || "",
    change: item.change || "",
    changed_date: item.changedDate || "",
    summary: item.summary || "",
    source_url: item.sourceUrl || officialBillUrl(item.billId || itemKey(item))
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
  claimedCollectedBillKeys = new Set();
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
      saveFavoriteDetailSnapshot(item);
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
  favoriteItems().forEach(saveFavoriteDetailSnapshot);
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
