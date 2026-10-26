import { computed, ref, watch } from "vue";
import * as characterApi from "../services/characterApi";
import { useAuth } from "./useAuth";

const ACTIVE_KEY = "posebook-active-character-v1";

const auth = useAuth();
const characters = ref([]);
const activeCharacterId = ref(readStorage(ACTIVE_KEY) || "");
const currentActionIndex = ref(0);
const loading = ref(false);
const error = ref("");
let activeLoadPromise = null;

const activeCharacter = computed(
  () => characters.value.find((character) => character.id === activeCharacterId.value) || characters.value[0] || null,
);
const currentAction = computed(() => activeCharacter.value?.actions[currentActionIndex.value] || null);
const completedCount = computed(
  () => activeCharacter.value?.actions.filter((action) => action.completed).length || 0,
);
const progress = computed(() => {
  const total = activeCharacter.value?.actions.length || 0;
  return total ? Math.round((completedCount.value / total) * 100) : 0;
});
const allActions = computed(() =>
  characters.value.flatMap((character) =>
    character.actions.map((action) => ({
      ...action,
      characterId: character.id,
      characterName: character.name,
      accent: character.accent,
    })),
  ),
);
const myActions = computed(() =>
  allActions.value.filter((action) => action.createdBy === auth.currentUser.value?.id),
);
const favoriteActions = computed(() =>
  allActions.value.filter((action) => action.favoritedBy?.includes(auth.currentUser.value?.id)),
);

function groupActionsByCharacter(actions) {
  const groups = new Map();
  for (const action of actions) {
    if (!groups.has(action.characterId)) {
      groups.set(action.characterId, {
        id: action.characterId,
        name: action.characterName,
        accent: action.accent || "#ff5c3a",
        actions: [],
      });
    }
    groups.get(action.characterId).actions.push(action);
  }
  return Array.from(groups.values());
}

const myCharacters = computed(() => groupActionsByCharacter(myActions.value));
const favoriteCharacters = computed(() => groupActionsByCharacter(favoriteActions.value));
const ownedCharacters = computed(() =>
  characters.value.filter((character) => character.createdBy === auth.currentUser.value?.id),
);

watch(activeCharacterId, (value) => writeStorage(ACTIVE_KEY, value));

function selectCharacter(id) {
  activeCharacterId.value = id;
  currentActionIndex.value = 0;
}

function selectAction(index) {
  const total = activeCharacter.value?.actions.length || 0;
  if (!total) return;
  currentActionIndex.value = (index + total) % total;
}

function replaceCharacter(updatedCharacter) {
  const index = characters.value.findIndex((character) => character.id === updatedCharacter.id);
  if (index >= 0) characters.value.splice(index, 1, updatedCharacter);
}

async function loadCharacters() {
  if (activeLoadPromise) return activeLoadPromise;
  loading.value = true;
  error.value = "";
  activeLoadPromise = (async () => {
    characters.value = await characterApi.getCharacters();
    if (!characters.value.some((character) => character.id === activeCharacterId.value)) {
      activeCharacterId.value = characters.value[0]?.id || "";
    }
    currentActionIndex.value = 0;
  })();
  try {
    return await activeLoadPromise;
  } catch (requestError) {
    error.value = requestError.message || "加载动作库失败。";
    throw requestError;
  } finally {
    activeLoadPromise = null;
    loading.value = false;
  }
}

async function addCharacter(payload) {
  const character = await characterApi.createCharacter(payload);
  characters.value.push(character);
  selectCharacter(character.id);
  return character;
}

async function updateCharacter(characterId, payload) {
  const updatedCharacter = await characterApi.updateCharacter(characterId, payload);
  replaceCharacter(updatedCharacter);
  return updatedCharacter;
}

async function deleteCharacter(characterId) {
  await characterApi.deleteCharacter(characterId);
  characters.value = characters.value.filter((character) => character.id !== characterId);
  if (activeCharacterId.value === characterId) {
    activeCharacterId.value = characters.value[0]?.id || "";
    currentActionIndex.value = 0;
  }
}

async function addAction(payload) {
  const character = activeCharacter.value;
  if (!character) throw new Error("请先选择一个角色。");
  const updatedCharacter = await characterApi.createAction(character.id, payload);
  replaceCharacter(updatedCharacter);
  currentActionIndex.value = updatedCharacter.actions.length - 1;
  return updatedCharacter;
}

async function updateCurrentAction(payload) {
  const character = activeCharacter.value;
  const action = currentAction.value;
  if (!character || !action) return null;
  const updatedCharacter = await characterApi.updateAction(character.id, action.id, payload);
  replaceCharacter(updatedCharacter);
  return updatedCharacter;
}

async function toggleCurrentAction() {
  if (!currentAction.value) return;
  await updateCurrentAction({ completed: !currentAction.value.completed });
}

async function updateCurrentNotes(notes) {
  if (currentAction.value) currentAction.value.notes = notes;
  await updateCurrentAction({ notes });
}

async function toggleFavorite(action, favorited) {
  const character = characters.value.find((candidate) =>
    candidate.actions.some((candidateAction) => candidateAction.id === action.id),
  );
  if (!character || !action) return null;
  const updatedCharacter = await characterApi.updateAction(character.id, action.id, { favorite: favorited });
  replaceCharacter(updatedCharacter);
  return updatedCharacter;
}

async function deleteAction(actionId) {
  const character = characters.value.find((candidate) =>
    candidate.actions.some((candidateAction) => candidateAction.id === actionId),
  );
  if (!character) return;
  const updatedCharacter = await characterApi.deleteAction(character.id, actionId);
  replaceCharacter(updatedCharacter);
  if (activeCharacterId.value === character.id) {
    currentActionIndex.value = Math.min(currentActionIndex.value, Math.max(0, updatedCharacter.actions.length - 1));
  }
}

function canDeleteAction(action) {
  return Boolean(action && (auth.currentUser.value?.id === action.createdBy || auth.isSuperAdmin.value));
}

function isActionFavorited(action) {
  return Boolean(action?.favoritedBy?.includes(auth.currentUser.value?.id));
}

function reset() {
  characters.value = [];
  activeCharacterId.value = "";
  currentActionIndex.value = 0;
  error.value = "";
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Active character selection is only a convenience preference.
  }
}

export function useCharacterStore() {
  return {
    characters,
    activeCharacter,
    currentAction,
    currentActionIndex,
    completedCount,
    progress,
    allActions,
    myActions,
    favoriteActions,
    myCharacters,
    favoriteCharacters,
    ownedCharacters,
    loading,
    error,
    loadCharacters,
    selectCharacter,
    selectAction,
    toggleCurrentAction,
    updateCurrentNotes,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addAction,
    updateCurrentAction,
    toggleFavorite,
    deleteAction,
    canDeleteAction,
    isActionFavorited,
    reset,
  };
}
