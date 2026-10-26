<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionDialog from "./components/ActionDialog.vue";
import AppSidebar from "./components/AppSidebar.vue";
import AuthScreen from "./components/AuthScreen.vue";
import BatchActionDialog from "./components/BatchActionDialog.vue";
import ChangePasswordDialog from "./components/ChangePasswordDialog.vue";
import CharacterCollectionView from "./components/CharacterCollectionView.vue";
import CharacterDialog from "./components/CharacterDialog.vue";
import FilmStrip from "./components/FilmStrip.vue";
import GalleryViewer from "./components/GalleryViewer.vue";
import ShareDialog from "./components/ShareDialog.vue";
import { useAuth } from "./composables/useAuth";
import { useCharacterStore } from "./composables/useCharacterStore";
import { buildAppPath, parseAppRoute } from "./router";
import { exportCharacterActionsPdf } from "./utils/actionPdf";
import { buildCharacterShareUrl, copyText, openQqShare, toAbsoluteUrl } from "./utils/share";

const auth = useAuth();
const store = useCharacterStore();
const initialRoute = parseAppRoute();
const view = ref(initialRoute.view);
const previousView = ref("library");
const routeCharacterId = ref(initialRoute.characterId);
const showCharacterDialog = ref(false);
const characterToEdit = ref(null);
const showActionDialog = ref(false);
const showEditActionDialog = ref(false);
const showBatchActionDialog = ref(false);
const showLightbox = ref(false);
const showChangePasswordDialog = ref(false);
const authScreenVisible = ref(false);
const exportingPdf = ref(false);
const shareCharacter = ref(null);

const themeStyle = computed(() => ({
  "--character-accent": store.activeCharacter.value?.accent || "#ff5c3a",
}));

function routeView() {
  return view.value === "viewer" ? previousView.value : view.value;
}

function syncRoute({ replace = false } = {}) {
  const nextPath = buildAppPath(routeView(), routeCharacterId.value);
  if (window.location.pathname === nextPath) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
}

function handleCharacterSelect(characterId) {
  if (routeCharacterId.value === characterId) return;
  routeCharacterId.value = characterId;
  syncRoute();
}

function handlePopState() {
  const route = parseAppRoute();
  const canOpenView = auth.currentUser.value || route.view === "library";
  view.value = canOpenView ? route.view : "library";
  routeCharacterId.value = canOpenView ? route.characterId : "";
  previousView.value = view.value;
  showLightbox.value = false;
  showEditActionDialog.value = false;
  showActionDialog.value = false;
  showBatchActionDialog.value = false;
  shareCharacter.value = null;
  if (!canOpenView) syncRoute({ replace: true });
}

function handleKeydown(event) {
  const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (event.key === "Escape" && showLightbox.value) {
    showLightbox.value = false;
    return;
  }
  if (event.key === "Escape" && shareCharacter.value) {
    shareCharacter.value = null;
    return;
  }
  if (
    isTyping ||
    showCharacterDialog.value ||
    showActionDialog.value ||
    showEditActionDialog.value ||
    showBatchActionDialog.value ||
    shareCharacter.value ||
    authScreenVisible.value
  ) {
    return;
  }
  if (view.value !== "viewer") return;
  if (event.key === "ArrowLeft") store.selectAction(store.currentActionIndex.value - 1);
  if (event.key === "ArrowRight") store.selectAction(store.currentActionIndex.value + 1);
}

function requireLogin() {
  if (!auth.currentUser.value) {
    authScreenVisible.value = true;
    return false;
  }
  return true;
}

function openCreateCharacter() {
  if (!requireLogin()) return;
  characterToEdit.value = null;
  showCharacterDialog.value = true;
}

function openEditCharacter(character) {
  if (!requireLogin()) return;
  characterToEdit.value = character;
  showCharacterDialog.value = true;
}

async function handleCharacterSubmit(payload) {
  const wasActive = store.activeCharacter.value?.id === characterToEdit.value?.id;
  try {
    if (characterToEdit.value) {
      await store.updateCharacter(characterToEdit.value.id, payload);
    } else {
      await store.addCharacter(payload);
      view.value = view.value === "viewer" ? previousView.value : view.value;
      routeCharacterId.value = "";
      previousView.value = view.value;
    }
    showCharacterDialog.value = false;
  } catch (error) {
    window.alert(error.message || "保存角色失败。");
  }
  if (wasActive && view.value === "viewer") {
    view.value = previousView.value || "library";
  }
  syncRoute({ replace: true });
}

async function handleDeleteCharacter(character) {
  if (!requireLogin()) return;
  if (!window.confirm(`确认删除角色“${character.name}”？角色下的 ${character.actions.length} 个动作也会一并删除。`)) return;
  const wasActive = store.activeCharacter.value?.id === character.id;
  try {
    await store.deleteCharacter(character.id);
    if (routeCharacterId.value === character.id) routeCharacterId.value = "";
    if (wasActive && view.value === "viewer") {
      view.value = "library";
      previousView.value = "library";
      routeCharacterId.value = "";
    }
    syncRoute({ replace: true });
  } catch (error) {
    window.alert(error.message || "删除角色失败。");
  }
}

async function handleAddAction(payload) {
  if (!requireLogin()) return;
  try {
    await store.addAction(payload);
    showActionDialog.value = false;
  } catch (error) {
    window.alert(error.message || "新增动作失败。");
  }
}

async function handleUpdateAction(payload) {
  if (!requireLogin()) return;
  try {
    await store.updateCurrentAction(payload);
    showEditActionDialog.value = false;
  } catch (error) {
    window.alert(error.message || "修改动作失败。");
  }
}

async function handleDeleteAction(action) {
  if (!requireLogin()) return;
  if (!window.confirm(`确认删除动作“${action.name}”？`)) return;
  try {
    await store.deleteAction(action.id);
  } catch (error) {
    window.alert(error.message || "删除动作失败。");
  }
}

async function handleToggleFavorite(action, favorited) {
  if (!requireLogin()) return;
  try {
    await store.toggleFavorite(action, favorited);
  } catch (error) {
    window.alert(error.message || "更新收藏失败。");
  }
}

function handleOpenAction(action) {
  const character = store.characters.value.find((candidate) =>
    candidate.actions.some((candidateAction) => candidateAction.id === action.id),
  );
  if (!character) return;
  const actionIndex = character.actions.findIndex((candidateAction) => candidateAction.id === action.id);
  previousView.value = view.value;
  store.selectCharacter(character.id);
  store.selectAction(actionIndex);
  routeCharacterId.value = character.id;
  view.value = "viewer";
  syncRoute();
}

function handleAddActionForCharacter(characterId) {
  if (!requireLogin()) return;
  const character = store.characters.value.find((candidate) => candidate.id === characterId);
  if (!character) return;
  store.selectCharacter(characterId);
  showActionDialog.value = true;
}

function openBatchCreateAction() {
  if (!requireLogin()) return;
  if (!store.activeCharacter.value) {
    window.alert("请先选择一个角色。");
    return;
  }
  showBatchActionDialog.value = true;
}

function handleBatchAddForCharacter(characterId) {
  if (!requireLogin()) return;
  const character = store.characters.value.find((candidate) => candidate.id === characterId);
  if (!character) return;
  store.selectCharacter(characterId);
  showBatchActionDialog.value = true;
}

function handleBatchComplete() {
  showBatchActionDialog.value = false;
}

async function handleExportPdf(character) {
  if (!character || exportingPdf.value) return;
  if (!character.actions?.length) {
    window.alert("该角色还没有动作记录，无法导出。");
    return;
  }
  exportingPdf.value = true;
  try {
    await exportCharacterActionsPdf(character);
  } catch (error) {
    window.alert(error.message || "导出 PDF 失败，请稍后重试。");
  } finally {
    exportingPdf.value = false;
  }
}

function openWechatShare(character) {
  if (!character) return;
  shareCharacter.value = character;
}

async function shareToQq(character) {
  if (!character) return;
  const url = buildCharacterShareUrl(character.id);
  const opened = openQqShare({
    url,
    title: `${character.name} · Posebook 动作参考`,
    summary: character.tag ? `${character.tag} · 多角色拍摄动作参考` : "多角色拍摄动作参考与进度记录",
    image: toAbsoluteUrl(character.actions?.[0]?.image),
  });
  if (opened) return;

  const copied = await copyText(url);
  window.alert(
    copied
      ? "浏览器阻止了 QQ 分享窗口，链接已复制，请打开 QQ 粘贴分享。"
      : "浏览器阻止了 QQ 分享窗口，请允许弹出窗口后重试。",
  );
}

function handleNavigate(nextView, { preserveCharacter = false } = {}) {
  if (!auth.currentUser.value && nextView !== "library" && nextView !== "viewer") {
    authScreenVisible.value = true;
    return;
  }
  view.value = nextView;
  if (!preserveCharacter) routeCharacterId.value = "";
  showLightbox.value = false;
  showEditActionDialog.value = false;
  showActionDialog.value = false;
  showBatchActionDialog.value = false;
  shareCharacter.value = null;
  syncRoute();
}

function returnFromViewer() {
  handleNavigate(previousView.value || "library", { preserveCharacter: true });
}

async function handleLogout() {
  await auth.logout();
  store.reset();
  view.value = "library";
  previousView.value = "library";
  routeCharacterId.value = "";
  showCharacterDialog.value = false;
  characterToEdit.value = null;
  showActionDialog.value = false;
  showEditActionDialog.value = false;
  showBatchActionDialog.value = false;
  showLightbox.value = false;
  showChangePasswordDialog.value = false;
  authScreenVisible.value = false;
  shareCharacter.value = null;
  syncRoute({ replace: true });
  try {
    await store.loadCharacters();
  } catch {
    // The store exposes the error for the current page.
  }
}

watch(
  () => auth.currentUser.value?.id,
  async () => {
    authScreenVisible.value = false;
    try {
      await store.loadCharacters();
    } catch {
      // The store exposes the error for the current page.
    }
  },
);

watch(
  () => store.loading.value,
  (loading) => {
    if (loading || !routeCharacterId.value) return;
    if (store.characters.value.some((character) => character.id === routeCharacterId.value)) return;
    routeCharacterId.value = "";
    syncRoute({ replace: true });
  },
);

onMounted(async () => {
  await auth.restore();
  if (!auth.currentUser.value && view.value !== "library") {
    view.value = "library";
    previousView.value = "library";
    routeCharacterId.value = "";
    syncRoute({ replace: true });
  }
  try {
    await store.loadCharacters();
  } catch {
    // The store exposes the error for the current page.
  }
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("popstate", handlePopState);
});
onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("popstate", handlePopState);
});
</script>

<template>
  <div v-if="!auth.ready.value" class="auth-screen auth-loading">正在读取登录状态…</div>
  <div v-else class="app-shell" :style="themeStyle">
    <AppSidebar
      :user="auth.currentUser.value"
      :view="view.value"
      @add="openCreateCharacter"
      @login="authScreenVisible = true"
      @logout="handleLogout"
      @navigate="handleNavigate"
      @change-password="showChangePasswordDialog = true"
    />

    <main class="workspace">
      <CharacterCollectionView
        v-if="view === 'library'"
        title="共享动作库"
        subtitle="所有用户共享的角色与动作参考"
        kicker="SHARED LIBRARY"
        empty-title="还没有角色"
        empty-text="先创建一个角色，再添加动作参考。"
        :characters="store.characters.value"
        :current-user-id="auth.currentUser.value?.id"
        :is-super-admin="auth.isSuperAdmin.value"
        :initial-character-id="routeCharacterId"
        :can-add="Boolean(auth.currentUser.value)"
        :can-favorite="Boolean(auth.currentUser.value)"
        @select-character="handleCharacterSelect"
        @open="handleOpenAction"
        @toggle-favorite="handleToggleFavorite"
        @delete="handleDeleteAction"
        @edit-character="openEditCharacter"
        @delete-character="handleDeleteCharacter"
        @add="handleAddActionForCharacter"
        @batch-add="handleBatchAddForCharacter"
        @export-pdf="handleExportPdf"
        @share-wechat="openWechatShare"
        @share-qq="shareToQq"
      />

      <template v-else-if="view === 'viewer'">
        <header class="workspace-header">
          <div class="title-block">
            <button class="back-button viewer-back" type="button" @click="returnFromViewer">
              ← 返回列表
            </button>
            <span class="section-kicker">POSE DIRECTION / 角色动作册</span>
            <div class="character-heading">
              <h1>{{ store.activeCharacter.value?.name }}</h1>
              <span>{{ store.activeCharacter.value?.tag }}</span>
            </div>
          </div>

          <div class="header-actions">
            <div v-if="auth.currentUser.value" class="progress-summary" aria-label="当前角色拍摄进度">
              <div class="progress-copy">
                <span>拍摄进度</span>
                <strong>{{ store.progress.value }}%</strong>
              </div>
              <div class="progress-track">
                <span :style="{ width: `${store.progress.value}%` }"></span>
              </div>
            </div>
            <button
              v-if="auth.currentUser.value"
              class="secondary-button batch-upload-button"
              type="button"
              :disabled="exportingPdf"
              @click="handleExportPdf(store.activeCharacter.value)"
            >
              {{ exportingPdf ? "正在导出…" : "快捷导出" }}
            </button>
            <button v-if="auth.currentUser.value" class="secondary-button batch-upload-button" type="button" @click="openBatchCreateAction">
              批量上传
            </button>
            <button v-if="auth.currentUser.value" class="primary-button" type="button" @click="showActionDialog = true">
              <span aria-hidden="true">＋</span> 新增动作
            </button>
          </div>
        </header>

        <GalleryViewer
          :action="store.currentAction.value"
          :index="store.currentActionIndex.value"
          :total="store.activeCharacter.value?.actions.length || 0"
          :can-delete="store.canDeleteAction(store.currentAction.value)"
          :favorited="store.isActionFavorited(store.currentAction.value)"
          :readonly="!auth.currentUser.value"
          @previous="store.selectAction(store.currentActionIndex.value - 1)"
          @next="store.selectAction(store.currentActionIndex.value + 1)"
          @toggle="store.toggleCurrentAction"
          @update-notes="store.updateCurrentNotes"
          @zoom="showLightbox = true"
          @toggle-favorite="handleToggleFavorite(store.currentAction.value, $event)"
          @edit="showEditActionDialog = true"
          @delete="handleDeleteAction(store.currentAction.value)"
          @add="showActionDialog = true"
        />

        <FilmStrip
          :actions="store.activeCharacter.value?.actions || []"
          :current-index="store.currentActionIndex.value"
          :can-add="Boolean(auth.currentUser.value)"
          @select="store.selectAction"
          @add="showActionDialog = true"
        />
      </template>

      <CharacterCollectionView
        v-else-if="view === 'mine'"
        title="我的角色"
        subtitle="你创建的角色会集中显示在这里"
        empty-title="还没有创建角色"
        empty-text="先建立一个角色，再添加动作参考。"
        :characters="store.ownedCharacters.value"
        :current-user-id="auth.currentUser.value?.id"
        :is-super-admin="auth.isSuperAdmin.value"
        :initial-character-id="routeCharacterId"
        :can-add="true"
        @select-character="handleCharacterSelect"
        @open="handleOpenAction"
        @toggle-favorite="handleToggleFavorite"
        @delete="handleDeleteAction"
        @edit-character="openEditCharacter"
        @delete-character="handleDeleteCharacter"
        @add="handleAddActionForCharacter"
        @batch-add="handleBatchAddForCharacter"
        @export-pdf="handleExportPdf"
        @share-wechat="openWechatShare"
        @share-qq="shareToQq"
      />

      <CharacterCollectionView
        v-else
        title="我的收藏"
        subtitle="收藏的动作会集中显示在这里"
        empty-title="还没有收藏动作"
        empty-text="在动作详情或列表中点星标，就能把动作加入收藏。"
        :characters="store.favoriteCharacters.value"
        :current-user-id="auth.currentUser.value?.id"
        :is-super-admin="auth.isSuperAdmin.value"
        :initial-character-id="routeCharacterId"
        @select-character="handleCharacterSelect"
        @open="handleOpenAction"
        @toggle-favorite="handleToggleFavorite"
        @delete="handleDeleteAction"
        @share-wechat="openWechatShare"
        @share-qq="shareToQq"
      />
    </main>

    <CharacterDialog
      v-if="showCharacterDialog"
      :character="characterToEdit"
      @close="showCharacterDialog = false"
      @submit="handleCharacterSubmit"
    />
    <ActionDialog
      v-if="showActionDialog"
      :character-name="store.activeCharacter.value?.name"
      @close="showActionDialog = false"
      @submit="handleAddAction"
    />
    <ActionDialog
      v-if="showEditActionDialog"
      :character-name="store.activeCharacter.value?.name"
      :action="store.currentAction.value"
      @close="showEditActionDialog = false"
      @submit="handleUpdateAction"
    />
    <BatchActionDialog
      v-if="showBatchActionDialog"
      :character-id="store.activeCharacter.value?.id"
      :character-name="store.activeCharacter.value?.name"
      @close="showBatchActionDialog = false"
      @complete="handleBatchComplete"
    />
    <ShareDialog
      v-if="shareCharacter"
      :character="shareCharacter"
      @close="shareCharacter = null"
    />
    <ChangePasswordDialog
      v-if="showChangePasswordDialog"
      @close="showChangePasswordDialog = false"
    />

    <Teleport to="body">
      <div v-if="authScreenVisible" class="auth-overlay">
        <AuthScreen @close="authScreenVisible = false" />
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showLightbox && store.currentAction.value"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="全屏查看动作参考"
      >
        <div class="lightbox-meta">
          <span>{{ String(store.currentActionIndex.value + 1).padStart(2, "0") }}</span>
          <strong>{{ store.currentAction.value.name }}</strong>
        </div>
        <div class="lightbox-stage">
          <img :src="store.currentAction.value.image" :alt="store.currentAction.value.name" />
        </div>
        <button class="lightbox-close" type="button" aria-label="关闭" @click="showLightbox = false">×</button>
        <button class="lightbox-nav lightbox-prev" type="button" aria-label="上一张" @click="store.selectAction(store.currentActionIndex.value - 1)">←</button>
        <button class="lightbox-nav lightbox-next" type="button" aria-label="下一张" @click="store.selectAction(store.currentActionIndex.value + 1)">→</button>
      </div>
    </Teleport>
  </div>
</template>
