<script setup>
import { computed, ref } from "vue";
import { useCharacterStore } from "../composables/useCharacterStore";
import { uploadReferenceImage } from "../services/uploadApi";
import { MAX_COMPRESSED_BYTES, MAX_SOURCE_BYTES, compressImage } from "../utils/imageCompressor";

const props = defineProps({
  characterId: { type: String, required: true },
  characterName: { type: String, default: "当前角色" },
});
const emit = defineEmits(["close", "complete"]);

const store = useCharacterStore();

const files = ref([]);
const processing = ref(false);
const skippedCount = ref(0);
let idCounter = 0;

const doneCount = computed(() => files.value.filter((item) => item.status === "done").length);
const failedCount = computed(() => files.value.filter((item) => item.status === "error").length);
const total = computed(() => files.value.length);
const canStart = computed(() => !processing.value && files.value.some((item) => item.status === "pending" || item.status === "error"));

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function deriveName(file) {
  const base = file.name.replace(/\.[^.]+$/, "").trim();
  return base.slice(0, 30) || "未命名动作";
}

function statusText(item) {
  const messages = {
    pending: "等待添加",
    compressing: "正在压缩…",
    uploading: "正在上传…",
    done: "已添加",
    error: item.message || "添加失败",
  };
  return messages[item.status];
}

function statusIcon(status) {
  if (status === "done") return "✓";
  if (status === "error") return "!";
  if (status === "compressing" || status === "uploading") return "…";
  return "·";
}

function addFiles(fileList) {
  let skipped = 0;
  for (const file of fileList || []) {
    if (!file.type.startsWith("image/")) {
      skipped += 1;
      continue;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      skipped += 1;
      continue;
    }
    files.value.push({
      id: ++idCounter,
      file,
      name: deriveName(file),
      size: file.size,
      resultSize: 0,
      compressed: false,
      status: "pending",
      message: "",
    });
  }
  if (skipped) skippedCount.value += skipped;
}

function handleFileChange(event) {
  addFiles(event.target.files);
  event.target.value = "";
}

function handleDrop(event) {
  addFiles(event.dataTransfer.files);
}

function removeItem(item) {
  if (processing.value || item.status !== "pending") return;
  const index = files.value.indexOf(item);
  if (index >= 0) files.value.splice(index, 1);
}

async function processQueue() {
  if (!canStart.value) return;
  if (store.activeCharacter.value?.id !== props.characterId) {
    store.selectCharacter(props.characterId);
  }
  processing.value = true;
  try {
    for (const item of files.value) {
      if (item.status === "done") continue;
      item.status = "compressing";
      try {
        const needsCompression = item.file.size > MAX_COMPRESSED_BYTES;
        const compressed = needsCompression ? await compressImage(item.file) : item.file;
        item.resultSize = compressed.size;
        item.compressed = needsCompression;
        item.status = "uploading";
        const uploaded = await uploadReferenceImage(compressed);
        await store.addAction({
          name: item.name,
          image: uploaded.url,
          sourceName: uploaded.originalName,
          notes: "",
        });
        item.status = "done";
      } catch (error) {
        item.status = "error";
        item.message = error.message || "添加失败";
      }
    }
  } finally {
    processing.value = false;
  }
  if (files.value.every((item) => item.status === "done")) {
    emit("complete");
  }
}
</script>

<template>
  <div class="dialog-backdrop">
    <section
      class="dialog-card batch-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-dialog-title"
    >
      <button
        class="dialog-close"
        type="button"
        aria-label="关闭"
        :disabled="processing"
        @click="$emit('close')"
      >
        ×
      </button>
      <span class="section-kicker">QUICK UPLOAD / {{ characterName }}</span>
      <h2 id="batch-dialog-title">批量添加动作</h2>
      <p>选择多张图片，每张自动压缩至 1MB 内并添加为动作，动作名称默认为文件名（不含后缀）。</p>

      <div class="batch-dropzone" @dragover.prevent @drop.prevent="handleDrop">
        <input
          id="batch-files"
          class="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          @change="handleFileChange"
        />
        <label class="batch-dropzone-label" for="batch-files">
          <span class="upload-icon" aria-hidden="true">↥</span>
          <span class="upload-copy">
            <strong>选择图片或拖放到这里</strong>
            <small>支持一次选择多张 · JPG、PNG、WebP、GIF、AVIF</small>
          </span>
          <span class="upload-change">选择图片</span>
        </label>
      </div>

      <p v-if="skippedCount" class="batch-skip">
        已跳过 {{ skippedCount }} 个非图片或超过 20MB 的文件。
      </p>

      <ul v-if="files.length" class="batch-list">
        <li v-for="item in files" :key="item.id" class="batch-item" :class="item.status">
          <span class="batch-status" aria-hidden="true">{{ statusIcon(item.status) }}</span>
          <span class="batch-item-copy">
            <strong>{{ item.name }}</strong>
            <small>
              <template v-if="item.status === 'done'">
                <template v-if="item.compressed">已压缩 {{ formatFileSize(item.size) }} → {{ formatFileSize(item.resultSize) }}</template>
                <template v-else>无需压缩 · {{ formatFileSize(item.resultSize) }}</template>
              </template>
              <template v-else>{{ formatFileSize(item.size) }} · {{ statusText(item) }}</template>
            </small>
          </span>
          <button
            v-if="item.status === 'pending' && !processing"
            class="batch-remove"
            type="button"
            :aria-label="`移除 ${item.name}`"
            @click="removeItem(item)"
          >
            ×
          </button>
        </li>
      </ul>

      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="processing" @click="$emit('close')">
          取消
        </button>
        <button class="primary-button" type="button" :disabled="!canStart" @click="processQueue">
          <span v-if="processing" class="button-spinner" aria-hidden="true"></span>
          {{ processing ? `正在添加 ${doneCount}/${total}…` : failedCount ? "重试失败项" : "开始批量添加" }}
        </button>
      </div>
    </section>
  </div>
</template>
