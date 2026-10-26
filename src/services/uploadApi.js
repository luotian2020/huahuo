import { apiFetch } from "./apiClient";

export async function uploadReferenceImage(file) {
  return apiFetch("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
}
