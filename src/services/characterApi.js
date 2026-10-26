import { apiFetch } from "./apiClient";

function jsonOptions(method, payload) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export function getCharacters() {
  return apiFetch("/api/characters");
}

export function createCharacter(payload) {
  return apiFetch("/api/characters", jsonOptions("POST", payload));
}

export function updateCharacter(characterId, payload) {
  return apiFetch(`/api/characters/${encodeURIComponent(characterId)}`, jsonOptions("PATCH", payload));
}

export function deleteCharacter(characterId) {
  return apiFetch(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: "DELETE",
  });
}

export function createAction(characterId, payload) {
  return apiFetch(`/api/characters/${encodeURIComponent(characterId)}/actions`, jsonOptions("POST", payload));
}

export function updateAction(characterId, actionId, payload) {
  return apiFetch(
    `/api/characters/${encodeURIComponent(characterId)}/actions/${encodeURIComponent(actionId)}`,
    jsonOptions("PATCH", payload),
  );
}

export function deleteAction(characterId, actionId) {
  return apiFetch(`/api/characters/${encodeURIComponent(characterId)}/actions/${encodeURIComponent(actionId)}`, {
    method: "DELETE",
  });
}
