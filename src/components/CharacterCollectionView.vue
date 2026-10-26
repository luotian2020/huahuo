<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";

const ROLES_PER_PAGE = 8;
const ACTIONS_PER_PAGE = 12;
const LOAD_MARGIN = 180;

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  kicker: { type: String, default: "MY LIBRARY" },
  emptyTitle: { type: String, required: true },
  emptyText: { type: String, default: "" },
  characters: { type: Array, required: true },
  currentUserId: { type: String, default: "" },
  isSuperAdmin: { type: Boolean, default: false },
  initialCharacterId: { type: String, default: "" },
  canAdd: { type: Boolean, default: false },
  canFavorite: { type: Boolean, default: true },
});

const emit = defineEmits(["open", "toggle-favorite", "delete", "select-character", "edit-character", "delete-character", "add", "batch-add", "export-pdf", "share-wechat", "share-qq"]);

const searchQuery = ref("");
const selectedCharacterId = ref(props.initialCharacterId || "");
const exporting = ref(false);
const roleGridRef = ref(null);
const actionGridRef = ref(null);
const visibleRoleCount = ref(ROLES_PER_PAGE);
const visibleActionCount = ref(ACTIONS_PER_PAGE);

watch(
  () => props.initialCharacterId,
  (value) => {
    selectedCharacterId.value = value || "";
    visibleActionCount.value = ACTIONS_PER_PAGE;
  },
);

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

function completedCount(character) {
  return character.actions.filter((action) => action.completed).length;
}

function fuzzyMatch(value, query) {
  const haystack = String(value || "").toLocaleLowerCase();
  const needle = String(query || "").toLocaleLowerCase().replace(/\s+/g, "");
  if (!needle) return true;
  if (haystack.includes(needle)) return true;

  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return false;
}

const filteredCharacters = computed(() =>
  props.characters.filter((character) => fuzzyMatch(character.name, searchQuery.value)),
);

const hasMoreRoles = computed(() => visibleRoleCount.value < filteredCharacters.value.length);
const displayedCharacters = computed(() => filteredCharacters.value.slice(0, visibleRoleCount.value));

const selectedCharacter = computed(
  () => props.characters.find((character) => character.id === selectedCharacterId.value) || null,
);

const hasMoreActions = computed(() => visibleActionCount.value < (selectedCharacter.value?.actions.length || 0));
const displayedActions = computed(() => (selectedCharacter.value?.actions || []).slice(0, visibleActionCount.value));

function loadMoreRoles() {
  if (!hasMoreRoles.value) return;
  visibleRoleCount.value = Math.min(filteredCharacters.value.length, visibleRoleCount.value + ROLES_PER_PAGE);
  ensureRoleFill();
}

function loadMoreActions() {
  if (!hasMoreActions.value) return;
  visibleActionCount.value = Math.min(
    selectedCharacter.value?.actions.length || 0,
    visibleActionCount.value + ACTIONS_PER_PAGE,
  );
  ensureActionFill();
}

function onRoleScroll(event) {
  const element = event.currentTarget;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - LOAD_MARGIN) {
    loadMoreRoles();
  }
}

function onActionScroll(event) {
  const element = event.currentTarget;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - LOAD_MARGIN) {
    loadMoreActions();
  }
}

function ensureRoleFill() {
  if (!hasMoreRoles.value) return;
  nextTick(() => {
    const element = roleGridRef.value;
    if (element && element.scrollHeight <= element.clientHeight + 4) loadMoreRoles();
  });
}

function ensureActionFill() {
  if (!hasMoreActions.value) return;
  nextTick(() => {
    const element = actionGridRef.value;
    if (element && element.scrollHeight <= element.clientHeight + 4) loadMoreActions();
  });
}

function openCharacter(character) {
  selectedCharacterId.value = character.id;
  visibleActionCount.value = ACTIONS_PER_PAGE;
  emit("select-character", character.id);
  ensureActionFill();
}

function closeCharacter() {
  selectedCharacterId.value = "";
  emit("select-character", "");
}

function isFavorited(action, userId) {
  return Boolean(action.favoritedBy?.includes(userId));
}

function canDelete(action, userId, superAdmin) {
  return superAdmin || action.createdBy === userId;
}

function canManageCharacter(character) {
  return Boolean(character && (props.isSuperAdmin || character.createdBy === props.currentUserId));
}

watch(searchQuery, () => {
  selectedCharacterId.value = "";
  visibleRoleCount.value = ROLES_PER_PAGE;
  visibleActionCount.value = ACTIONS_PER_PAGE;
  emit("select-character", "");
  ensureRoleFill();
});

watch(
  () => props.characters,
  () => {
    const current = selectedCharacter.value;
    if (!current && selectedCharacterId.value) {
      selectedCharacterId.value = "";
      visibleActionCount.value = ACTIONS_PER_PAGE;
      emit("select-character", "");
    }
    visibleRoleCount.value = Math.min(visibleRoleCount.value, Math.max(ROLES_PER_PAGE, filteredCharacters.value.length));
    ensureRoleFill();
  },
  { deep: true },
);

watch(filteredCharacters, () => {
  visibleRoleCount.value = Math.min(visibleRoleCount.value, Math.max(ROLES_PER_PAGE, filteredCharacters.value.length));
  ensureRoleFill();
});

watch(
  () => selectedCharacter.value?.actions.length,
  () => {
    visibleActionCount.value = Math.min(
      visibleActionCount.value,
      Math.max(ACTIONS_PER_PAGE, selectedCharacter.value?.actions.length || 0),
    );
    ensureActionFill();
  },
);

onMounted(ensureRoleFill);
</script>

<template>
  <section class="collection-page">
    <header class="collection-header collection-tool-header">
      <div>
        <span class="section-kicker">{{ kicker }}</span>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="collection-tools">
        <label class="collection-search">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="搜索角色名"
            aria-label="搜索角色名"
          />
          <button v-if="searchQuery" type="button" aria-label="清空搜索" @click="searchQuery = ''">
            ×
          </button>
        </label>
        <span class="collection-count">{{ filteredCharacters.length }} 个角色</span>
      </div>
    </header>

    <template v-if="!selectedCharacter && filteredCharacters.length">
      <div
        ref="roleGridRef"
        class="character-collection-grid"
        @scroll="onRoleScroll"
      >
        <button
          v-for="character in displayedCharacters"
          :key="character.id"
          class="character-collection-card"
          :style="{ '--role-accent': character.accent }"
          type="button"
          @click="openCharacter(character)"
        >
          <span class="character-card-head">
            <span class="character-card-avatar">{{ initials(character.name) }}</span>
            <span class="character-card-copy">
              <strong>{{ character.name }}</strong>
              <small>{{ character.actions.length }} 个动作 · {{ completedCount(character) }} 已完成</small>
            </span>
            <span class="character-card-open" aria-hidden="true">↗</span>
          </span>
          <span v-if="character.actions.length" class="character-card-thumbs">
            <img
              v-for="action in character.actions.slice(0, 3)"
              :key="action.id"
              :src="action.image"
              :alt="action.name"
              loading="lazy"
            />
          </span>
        </button>
      </div>

      <button v-if="hasMoreRoles" class="scroll-more" type="button" @click="loadMoreRoles">
        <span class="scroll-more-icon" aria-hidden="true">↓</span>
        加载更多角色
      </button>
      <p v-else class="scroll-status">已加载全部 · 共 {{ filteredCharacters.length }} 个角色</p>
    </template>

    <section v-else-if="selectedCharacter" class="character-action-panel">
      <header class="character-action-header">
        <div>
          <button class="back-button" type="button" @click="closeCharacter">← 返回角色列表</button>
          <div class="character-action-title">
            <h2>{{ selectedCharacter.name }}</h2>
            <span>{{ selectedCharacter.actions.length }} 个动作 · {{ completedCount(selectedCharacter) }} 已完成</span>
          </div>
        </div>
        <div class="character-action-tools">
          <button
            class="secondary-button character-manage-button share-wechat-button"
            type="button"
            @click="$emit('share-wechat', selectedCharacter)"
          >
            微信分享
          </button>
          <button
            class="secondary-button character-manage-button share-qq-button"
            type="button"
            @click="$emit('share-qq', selectedCharacter)"
          >
            QQ 分享
          </button>
          <button
            v-if="canAdd && canManageCharacter(selectedCharacter)"
            class="secondary-button character-manage-button"
            type="button"
            @click="$emit('edit-character', selectedCharacter)"
          >
            编辑角色
          </button>
          <button
            v-if="canAdd && canManageCharacter(selectedCharacter)"
            class="danger-button character-manage-button"
            type="button"
            @click="$emit('delete-character', selectedCharacter)"
          >
            删除角色
          </button>
          <button
            v-if="canAdd"
            class="primary-button character-add-button"
            type="button"
            @click="$emit('add', selectedCharacter.id)"
          >
            <span aria-hidden="true">＋</span> 新增动作
          </button>
          <button
            v-if="canAdd"
            class="secondary-button character-manage-button"
            type="button"
            @click="$emit('batch-add', selectedCharacter.id)"
          >
            批量上传
          </button>
          <button
            v-if="canAdd"
            class="secondary-button character-manage-button"
            type="button"
            :disabled="exporting"
            @click="$emit('export-pdf', selectedCharacter)"
          >
            {{ exporting ? "正在导出…" : "快捷导出" }}
          </button>
        </div>
      </header>

      <div
        v-if="selectedCharacter.actions.length"
        ref="actionGridRef"
        class="collection-grid"
        @scroll="onActionScroll"
      >
        <article
          v-for="action in displayedActions"
          :key="action.id"
          class="collection-card"
          @click="$emit('open', action)"
        >
          <div class="collection-thumb">
            <img :src="action.image" :alt="action.name" loading="lazy" />
            <button
              v-if="canFavorite"
              class="favorite-chip"
              :class="{ active: isFavorited(action, currentUserId) }"
              type="button"
              @click.stop="$emit('toggle-favorite', action, !isFavorited(action, currentUserId))"
            >
              {{ isFavorited(action, currentUserId) ? "★" : "☆" }}
            </button>
          </div>
          <div class="collection-card-body">
            <h3>{{ action.name }}</h3>
            <p>{{ selectedCharacter.name }} · 由 {{ action.createdByName || "系统" }} 添加</p>
            <div class="collection-card-actions">
              <button type="button" @click.stop="$emit('open', action)">查看</button>
              <button
                v-if="canDelete(action, currentUserId, isSuperAdmin)"
                class="collection-delete"
                type="button"
                @click.stop="$emit('delete', action)"
              >
                删除
              </button>
            </div>
          </div>
        </article>
      </div>

      <button
        v-if="selectedCharacter.actions.length && hasMoreActions"
        class="scroll-more"
        type="button"
        @click="loadMoreActions"
      >
        <span class="scroll-more-icon" aria-hidden="true">↓</span>
        加载更多动作
      </button>
      <p v-else-if="selectedCharacter.actions.length" class="scroll-status">
        已加载全部 · 共 {{ selectedCharacter.actions.length }} 个动作
      </p>

      <div v-else class="collection-empty">
        <span class="empty-number">00</span>
        <h2>这个角色还没有动作</h2>
        <p>添加动作后，会在这里以卡片形式展示。</p>
      </div>
    </section>

    <section v-else class="collection-empty">
      <span class="empty-number">00</span>
      <h2>{{ searchQuery ? "没有匹配的角色" : emptyTitle }}</h2>
      <p>{{ searchQuery ? "换个角色名或清除搜索条件试试。" : emptyText }}</p>
    </section>
  </section>
</template>